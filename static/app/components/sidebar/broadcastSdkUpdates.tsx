import styled from '@emotion/styled';
import groupBy from 'lodash/groupBy';

import ProjectBadge from 'app/components/idBadge/projectBadge';
import {t} from 'app/locale';
import space from 'app/styles/space';
import {Project, ProjectSdkUpdates, SDKUpdatesSuggestion} from 'app/types';
import getSdkUpdateSuggestion from 'app/utils/getSdkUpdateSuggestion';
import withProjects from 'app/utils/withProjects';
import withSdkUpdates from 'app/utils/withSdkUpdates';

import Collapsible from '../collapsible';
import List from '../list';
import ListItem from '../list/listItem';

import SidebarPanelItem from './sidebarPanelItem';

type Props = {
  projects: Project[];
  sdkUpdates?: ProjectSdkUpdates[] | null;
};

const flattenSuggestions = (list: ProjectSdkUpdates[]) =>
  list.reduce<SDKUpdatesSuggestion[]>(
    (suggestions, sdk) => [...suggestions, ...sdk.suggestions],
    []
  );

const commonUpdateMessage = t(
  'We recommend updating the following SDKs to make sure you’re getting all the data you need.'
);

const javascriptUpdateMessage = t(
  'All instalations of javascript must be updated to the same version. Otherwise, there will be problems getting the correct data.'
);

const ravenUpdateMessage = t(
  'All instalations of raven are out date and must be migrated to the new Sentry SDKs.'
);

const BroadcastSdkUpdates = ({projects, sdkUpdates}: Props) => {
  if (!sdkUpdates) {
    return null;
  }

  // Are there any updates?
  if (flattenSuggestions(sdkUpdates).length === 0) {
    return null;
  }

  // Group SDK updates by project
  const items = Object.entries(groupBy(sdkUpdates, 'projectId'));

  function getUpdateMessage() {
    const hasRavenSDkUpdate = !!sdkUpdates?.find(sdkUpdate =>
      sdkUpdate.sdkName.includes('raven')
    );

    const hasJavascriptSDkUpdate = !!sdkUpdates?.find(sdkUpdate =>
      sdkUpdate.sdkName.includes('javascript')
    );

    if (hasRavenSDkUpdate && hasJavascriptSDkUpdate) {
      return (
        <UpdateMessage>
          <p>{commonUpdateMessage}</p>
          <p>{ravenUpdateMessage}</p>
          <p>{javascriptUpdateMessage}</p>
        </UpdateMessage>
      );
    }

    if (hasRavenSDkUpdate) {
      <UpdateMessage>
        <p>{commonUpdateMessage}</p>
        <p>{ravenUpdateMessage}</p>
      </UpdateMessage>;
    }

    if (hasJavascriptSDkUpdate) {
      return (
        <UpdateMessage>
          <p>{commonUpdateMessage}</p>
          <p>{javascriptUpdateMessage}</p>
        </UpdateMessage>
      );
    }

    return commonUpdateMessage;
  }

  return (
    <SidebarPanelItem hasSeen title={t('Update your SDKs')} message={getUpdateMessage()}>
      <UpdatesList>
        <Collapsible>
          {items.map(([projectId, updates]) => {
            const project = projects.find(p => p.id === projectId);
            if (project === undefined) {
              return null;
            }

            return (
              <div key={project.id}>
                <SdkProjectBadge project={project} />
                <Suggestions>
                  {updates.map(sdkUpdate => (
                    <div key={sdkUpdate.sdkName}>
                      <SdkName>
                        {sdkUpdate.sdkName}{' '}
                        <SdkOutdatedVersion>@v{sdkUpdate.sdkVersion}</SdkOutdatedVersion>
                      </SdkName>
                      <List>
                        {sdkUpdate.suggestions.map((suggestion, i) => (
                          <ListItem key={i}>
                            {getSdkUpdateSuggestion({
                              sdk: {
                                name: sdkUpdate.sdkName,
                                version: sdkUpdate.sdkVersion,
                              },
                              suggestion,
                              shortStyle: true,
                              capitalized: true,
                            }) ?? null}
                          </ListItem>
                        ))}
                      </List>
                    </div>
                  ))}
                </Suggestions>
              </div>
            );
          })}
        </Collapsible>
      </UpdatesList>
    </SidebarPanelItem>
  );
};

const UpdatesList = styled('div')`
  margin-top: ${space(3)};
  display: grid;
  grid-auto-flow: row;
  grid-gap: ${space(3)};
`;

const Suggestions = styled('div')`
  margin-top: ${space(1)};
  margin-left: calc(${space(4)} + ${space(0.25)});
  display: grid;
  grid-auto-flow: row;
  grid-gap: ${space(1.5)};
`;

const SdkProjectBadge = styled(ProjectBadge)`
  font-size: ${p => p.theme.fontSizeLarge};
`;

const SdkName = styled('div')`
  font-family: ${p => p.theme.text.familyMono};
  font-weight: bold;
  margin-bottom: ${space(1)};
`;

const SdkOutdatedVersion = styled('span')`
  color: ${p => p.theme.subText};
`;

const UpdateMessage = styled('div')`
  && {
    p:last-child {
      margin-bottom: 0;
    }
  }
`;

export default withSdkUpdates(withProjects(BroadcastSdkUpdates));
