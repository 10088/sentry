import React from 'react';

import EventDataSection from 'sentry/components/events/eventDataSection';
import KeyValueList from 'sentry/components/events/interfaces/keyValueList/keyValueList';
import Annotated from 'sentry/components/events/meta/annotated';
import {t} from 'sentry/locale';
import {objectIsEmpty} from 'sentry/utils';

type Props = {
  data: {
    formatted: string;
    params?: Record<string, any> | any[];
  };
};

const Message = ({data}: Props) => {
  const renderParams = () => {
    let params = data?.params;

    if (!params || objectIsEmpty(params)) {
      return null;
    }

    // NB: Always render params, regardless of whether they appear in the
    // formatted string due to structured logging frameworks, like Serilog. They
    // only format some parameters into the formatted string, but we want to
    // display all of them.

    if (Array.isArray(params)) {
      params = params.map((value, i) => [`#${i}`, value]);
    }

    return <KeyValueList data={params} isSorted={false} isContextData />;
  };

  return (
    <EventDataSection type="message" title={t('Message')}>
      <Annotated object={data} objectKey="formatted">
        {value => <pre className="plain">{value}</pre>}
      </Annotated>
      {renderParams()}
    </EventDataSection>
  );
};

export default Message;
