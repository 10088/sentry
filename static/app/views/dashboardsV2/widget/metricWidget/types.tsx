export type MetricMeta = {
  name: string;
  operations: string[];
};

export type MetricQuery = {
  legend?: string;
  aggregation?: string;
  groupBy?: string[];
  metricMeta?: MetricMeta;
};

export type MetricWidget = {
  title: string;
  groupings: MetricQuery[];
  searchQuery?: string;
};
