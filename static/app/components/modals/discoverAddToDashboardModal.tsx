import * as React from 'react';
import {browserHistory} from 'react-router';
import {css} from '@emotion/react';
import styled from '@emotion/styled';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import pick from 'lodash/pick';
import set from 'lodash/set';

import {validateWidget} from 'app/actionCreators/dashboards';
import {addErrorMessage} from 'app/actionCreators/indicator';
import {ModalRenderProps} from 'app/actionCreators/modal';
import {Client} from 'app/api';
import Button from 'app/components/button';
import ButtonBar from 'app/components/buttonBar';
import WidgetQueriesForm from 'app/components/dashboards/widgetQueriesForm';
import SelectControl from 'app/components/forms/selectControl';
import {PanelAlert} from 'app/components/panels';
import {t} from 'app/locale';
import space from 'app/styles/space';
import {GlobalSelection, Organization, SelectValue, TagCollection} from 'app/types';
import {
  aggregateOutputType,
  isAggregateField,
  isLegalYAxisType,
} from 'app/utils/discover/fields';
import Measurements from 'app/utils/measurements/measurements';
import withApi from 'app/utils/withApi';
import withGlobalSelection from 'app/utils/withGlobalSelection';
import withTags from 'app/utils/withTags';
import {DISPLAY_TYPE_CHOICES} from 'app/views/dashboardsV2/data';
import {
  DashboardListItem,
  DisplayType,
  Widget,
  WidgetQuery,
} from 'app/views/dashboardsV2/types';
import WidgetCard from 'app/views/dashboardsV2/widgetCard';
import {generateFieldOptions} from 'app/views/eventsV2/utils';
import Input from 'app/views/settings/components/forms/controls/input';
import Field from 'app/views/settings/components/forms/field';

export type DiscoverAddToDashboardModalOptions = {
  organization: Organization;
  defaultQuery?: string;
};

type Props = ModalRenderProps &
  DiscoverAddToDashboardModalOptions & {
    api: Client;
    organization: Organization;
    selection: GlobalSelection;
    tags: TagCollection;
  };

type ValidationError = {
  [key: string]: string[] | ValidationError[] | ValidationError;
};

type FlatValidationError = {
  [key: string]: string | FlatValidationError[] | FlatValidationError;
};

type State = {
  title: string;
  displayType: Widget['displayType'];
  interval: Widget['interval'];
  queries: Widget['queries'];
  loading: boolean;
  errors?: Record<string, any>;
  dashboards: SelectValue<string>[];
  selectedDashboard?: SelectValue<string>;
};

const newQuery = {
  name: '',
  fields: ['count()'],
  conditions: '',
  orderby: '',
};

function mapErrors(
  data: ValidationError,
  update: FlatValidationError
): FlatValidationError {
  Object.keys(data).forEach((key: string) => {
    const value = data[key];
    // Recurse into nested objects.
    if (Array.isArray(value) && typeof value[0] === 'string') {
      update[key] = value[0];
    } else if (Array.isArray(value) && typeof value[0] === 'object') {
      update[key] = (value as ValidationError[]).map(item => mapErrors(item, {}));
    } else {
      update[key] = mapErrors(value as ValidationError, {});
    }
  });

  return update;
}

function normalizeQueries(
  displayType: Widget['displayType'],
  queries: Widget['queries']
): Widget['queries'] {
  const isTimeseriesChart = ['line', 'area', 'stacked_area', 'bar'].includes(displayType);

  if (['table', 'world_map', 'big_number'].includes(displayType)) {
    // Some display types may only support at most 1 query.
    queries = queries.slice(0, 1);
  } else if (isTimeseriesChart) {
    // Timeseries charts supports at most 3 queries.
    queries = queries.slice(0, 3);
  }

  if (displayType === 'table') {
    return queries;
  }

  // Filter out non-aggregate fields
  queries = queries.map(query => {
    let fields = query.fields.filter(isAggregateField);

    if (isTimeseriesChart || displayType === 'world_map') {
      // Filter out fields that will not generate numeric output types
      fields = fields.filter(field => isLegalYAxisType(aggregateOutputType(field)));
    }

    if (isTimeseriesChart && fields.length && fields.length > 3) {
      // Timeseries charts supports at most 3 fields.
      fields = fields.slice(0, 3);
    }

    return {
      ...query,
      fields: fields.length ? fields : ['count()'],
    };
  });

  if (isTimeseriesChart) {
    // For timeseries widget, all queries must share identical set of fields.

    const referenceFields = [...queries[0].fields];

    queryLoop: for (const query of queries) {
      if (referenceFields.length >= 3) {
        break;
      }

      if (isEqual(referenceFields, query.fields)) {
        continue;
      }

      for (const field of query.fields) {
        if (referenceFields.length >= 3) {
          break queryLoop;
        }

        if (!referenceFields.includes(field)) {
          referenceFields.push(field);
        }
      }
    }

    queries = queries.map(query => {
      return {
        ...query,
        fields: referenceFields,
      };
    });
  }

  if (['world_map', 'big_number'].includes(displayType)) {
    // For world map chart, cap fields of the queries to only one field.
    queries = queries.map(query => {
      return {
        ...query,
        fields: query.fields.slice(0, 1),
      };
    });
  }

  return queries;
}

class DiscoverAddToDashboardModal extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);

    const {defaultQuery} = props;

    this.state = {
      title: '',
      displayType: DisplayType.LINE,
      interval: '5m',
      queries: [{...newQuery, ...(defaultQuery ? {conditions: defaultQuery} : {})}],
      errors: undefined,
      loading: true,
      dashboards: [],
    };
    return;
  }

  async componentDidMount() {
    await this.fetchDashboards();
  }

  handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const {api, closeModal, organization} = this.props;
    this.setState({loading: true});
    let errors: FlatValidationError = {};
    const widgetData: Widget = pick(this.state, [
      'title',
      'displayType',
      'interval',
      'queries',
    ]);
    try {
      await validateWidget(api, organization.slug, widgetData);
    } catch (err) {
      errors = mapErrors(err?.responseJSON ?? {}, {});
      this.setState({errors});
    } finally {
      this.setState({loading: false});
    }
    // Validate that a dashboard was selected since api call to /dashboards/widgets/ does not check for dashboard
    if (
      !this.state.selectedDashboard ||
      !(
        this.state.dashboards.includes(this.state.selectedDashboard) ||
        this.state.selectedDashboard.value === 'new'
      )
    ) {
      errors.dashboard = t('This field may not be blank');
      this.setState({errors});
    }
    if (!Object.keys(errors).length && this.state.selectedDashboard) {
      closeModal();

      const queryData: {
        queryNames: string[];
        queryConditions: string[];
        queryFields: string[];
        queryOrderby: string;
      } = {
        queryNames: [],
        queryConditions: [],
        queryFields: widgetData.queries[0].fields,
        queryOrderby: widgetData.queries[0].orderby,
      };
      widgetData.queries.forEach(query => {
        queryData.queryNames.push(query.name);
        queryData.queryConditions.push(query.conditions);
      });
      const pathQuery = {
        displayType: widgetData.displayType,
        interval: widgetData.interval,
        title: widgetData.title,
        ...queryData,
      };
      if (this.state.selectedDashboard.value === 'new') {
        browserHistory.push({
          pathname: `/organizations/${organization.slug}/dashboards/new/`,
          query: pathQuery,
        });
      } else {
        browserHistory.push({
          pathname: `/organizations/${organization.slug}/dashboard/${this.state.selectedDashboard.value}/`,
          query: pathQuery,
        });
      }
    }
  };

  handleFieldChange = (field: string) => (value: string) => {
    this.setState(prevState => {
      const newState = cloneDeep(prevState);
      set(newState, field, value);

      if (field === 'displayType') {
        const displayType = value as Widget['displayType'];
        set(newState, 'queries', normalizeQueries(displayType, prevState.queries));
      }

      return {...newState, errors: undefined};
    });
  };

  handleQueryChange = (widgetQuery: WidgetQuery, index: number) => {
    this.setState(prevState => {
      const newState = cloneDeep(prevState);
      set(newState, `queries.${index}`, widgetQuery);

      return {...newState, errors: undefined};
    });
  };

  handleQueryRemove = (index: number) => {
    this.setState(prevState => {
      const newState = cloneDeep(prevState);
      newState.queries.splice(index, 1);

      return {...newState, errors: undefined};
    });
  };

  handleAddSearchConditions = () => {
    this.setState(prevState => {
      const newState = cloneDeep(prevState);
      newState.queries.push(cloneDeep(newQuery));

      return newState;
    });
  };

  canAddSearchConditions() {
    const rightDisplayType = ['line', 'area', 'stacked_area', 'bar'].includes(
      this.state.displayType
    );
    const underQueryLimit = this.state.queries.length < 3;

    return rightDisplayType && underQueryLimit;
  }

  async fetchDashboards() {
    const {api, organization} = this.props;
    const promise: Promise<DashboardListItem[]> = api.requestPromise(
      `/organizations/${organization.slug}/dashboards/`,
      {
        method: 'GET',
        query: {sort: 'title'},
      }
    );

    try {
      const response = await promise;
      const dashboards = response.map(({id, title}) => {
        return {label: title, value: id};
      });
      this.setState({
        dashboards,
      });
    } catch (error) {
      const errorResponse = error?.responseJSON ?? null;
      if (errorResponse) {
        addErrorMessage(errorResponse);
      } else {
        addErrorMessage(t('Unable to fetch dashboards'));
      }
    }
    this.setState({loading: false});
  }

  handleDashboardChange(option: SelectValue<string>) {
    this.setState({selectedDashboard: option});
  }

  render() {
    const {Footer, Body, Header, api, organization, selection, tags} = this.props;
    const state = this.state;
    const errors = state.errors;

    const fieldOptions = (measurementKeys: string[]) =>
      generateFieldOptions({
        organization,
        tagKeys: Object.values(tags).map(({key}) => key),
        measurementKeys,
      });

    return (
      <React.Fragment>
        <Header closeButton>
          <h4>{t('Add Widget to Dashboard')}</h4>
        </Header>
        <Body>
          <p>
            {t(
              `Choose which dashboard you'd like to add this query to. It will appear as a widget.`
            )}
          </p>
          <Field
            label={t('Custom Dashboard')}
            inline={false}
            flexibleControlStateSize
            stacked
            error={errors?.dashboard}
            style={{marginBottom: space(1), position: 'relative'}}
            required
          >
            <SelectControl
              name="dashboard"
              options={[
                {label: t('+ Create New Dashboard'), value: 'new'},
                ...this.state.dashboards,
              ]}
              onChange={(option: SelectValue<string>) =>
                this.handleDashboardChange(option)
              }
              onSelectResetsInput={false}
              onCloseResetsInput={false}
              onBlurResetsInput={false}
              disabled={state.loading}
            />
          </Field>
          <DoubleFieldWrapper>
            <StyledField
              data-test-id="widget-name"
              label={t('Widget Name')}
              inline={false}
              flexibleControlStateSize
              stacked
              error={errors?.title}
              required
            >
              <Input
                type="text"
                name="title"
                maxLength={255}
                required
                value={state.title}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  this.handleFieldChange('title')(event.target.value);
                }}
                disabled={state.loading}
              />
            </StyledField>
            <StyledField
              data-test-id="chart-type"
              label={t('Visualization Display')}
              inline={false}
              flexibleControlStateSize
              stacked
              error={errors?.displayType}
              required
            >
              <SelectControl
                required
                options={DISPLAY_TYPE_CHOICES.slice()}
                name="displayType"
                label={t('Visualization Display')}
                value={state.displayType}
                onChange={(option: {label: string; value: Widget['displayType']}) => {
                  this.handleFieldChange('displayType')(option.value);
                }}
                disabled={state.loading}
              />
            </StyledField>
          </DoubleFieldWrapper>
          <Measurements organization={organization}>
            {({measurements}) => {
              const measurementKeys = Object.values(measurements).map(({key}) => key);
              const amendedFieldOptions = fieldOptions(measurementKeys);
              return (
                <WidgetQueriesForm
                  organization={organization}
                  selection={selection}
                  fieldOptions={amendedFieldOptions}
                  displayType={state.displayType}
                  queries={state.queries}
                  errors={errors?.queries}
                  onChange={(queryIndex: number, widgetQuery: WidgetQuery) =>
                    this.handleQueryChange(widgetQuery, queryIndex)
                  }
                  canAddSearchConditions={this.canAddSearchConditions()}
                  handleAddSearchConditions={this.handleAddSearchConditions}
                  handleDeleteQuery={this.handleQueryRemove}
                />
              );
            }}
          </Measurements>
          <WidgetCard
            api={api}
            organization={organization}
            selection={selection}
            widget={this.state}
            isEditing={false}
            onDelete={() => undefined}
            onEdit={() => undefined}
            renderErrorMessage={errorMessage =>
              typeof errorMessage === 'string' && (
                <PanelAlert type="error">{errorMessage}</PanelAlert>
              )
            }
            isSorting={false}
            currentWidgetDragging={false}
          />
        </Body>
        <Footer>
          <ButtonBar gap={1}>
            <Button
              external
              href="https://docs.sentry.io/product/dashboards/custom-dashboards/#widget-builder"
            >
              {t('Read the docs')}
            </Button>
            <Button
              data-test-id="add-widget"
              priority="primary"
              type="button"
              onClick={this.handleSubmit}
              disabled={state.loading}
              busy={state.loading}
            >
              {t('Add Widget')}
            </Button>
          </ButtonBar>
        </Footer>
      </React.Fragment>
    );
  }
}

const DoubleFieldWrapper = styled('div')`
  display: inline-grid;
  grid-template-columns: repeat(2, 1fr);
  grid-column-gap: ${space(1)};
  width: 100%;
`;

export const modalCss = css`
  width: 100%;
  max-width: 700px;
  margin: 70px auto;
`;

const StyledField = styled(Field)`
  position: relative;
`;

export default withApi(withGlobalSelection(withTags(DiscoverAddToDashboardModal)));
