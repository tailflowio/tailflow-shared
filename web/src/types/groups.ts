export interface GroupSummary {
  group_key: string
  execution_count: number
  status_counts: Record<string, number>
  last_execution_at: string
}

export interface GroupExecution {
  id: string
  workflow_name: string
  status: string
  started_at: string
  finished_at?: string
}

export interface GroupDetail {
  executions: GroupExecution[]
  total: number
}
