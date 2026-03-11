export interface GroupSummary {
  param_name: string
  param_value: string
  execution_count: number
  status_counts: Record<string, number>
  last_execution_at: string
}

export interface GroupExecution {
  execution_id: string
  workflow_name: string
  status: string
  started_at: string
  finished_at?: string
  current_step?: string
}

export interface GroupDetail {
  param_name: string
  param_value: string
  executions: GroupExecution[]
  total: number
}

export interface GroupMatrixCell {
  status: string
  execution_id: string
}

export interface GroupMatrixRow {
  param_value: string
  workflows: Record<string, GroupMatrixCell | null>
}
