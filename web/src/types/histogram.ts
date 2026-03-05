export interface HistogramBucket {
  bucket: string
  event_type: string
  count: number
}

export interface HistogramResponse {
  buckets: HistogramBucket[]
  interval_seconds: number
  min_timestamp: string
  max_timestamp: string
}
