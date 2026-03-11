export type EventType =
  | 'workflow.started' | 'workflow.completed'
  | 'step.started' | 'step.completed' | 'step.failed' | 'step.skipped'
  | 'step.log' | 'step.waiting' | 'step.input' | 'step.output' | 'step.goto'
  | 'metrics'
  | 'execution.state'

export const ALL_EVENT_TYPES: EventType[] = [
  'workflow.started', 'workflow.completed',
  'step.started', 'step.completed', 'step.failed', 'step.skipped',
  'step.log', 'step.waiting', 'step.input', 'step.output', 'step.goto',
  'metrics',
  'execution.state',
]

// Unified format for display in shared components.
export interface EventRow {
  event_type: string
  step_id: string
  message: string
  data: string              // JSON stringified
  event_timestamp: string   // ISO 8601
  execution_id: string
  seq?: number              // monotonic sequence for stable ordering
  // Optional fields (SaaS only)
  organization_id?: string
  agent_id?: string
  session_id?: string
  workflow_name?: string
}

// Typed data payloads
export interface StepWaitingData {
  wait_type: string
}

export interface StepGotoData {
  target: string
  iteration: number
  max_iterations: number
  body: string[]
}

export interface WorkflowCompletedData {
  status: string
}

export interface StepLogData {
  level?: 'error' | 'warn' | 'info'
  stream?: boolean
}

export interface StepOutputData {
  output: unknown
}

export interface StepInputData {
  config?: unknown
  trigger?: unknown
  deps?: unknown
}

export interface ExecutionStateData {
  workflow_name: string
  status: string
  steps?: Record<string, StepStateData>
  group_params?: Record<string, unknown>
  idempotency_key?: string
  params?: Record<string, unknown>
  error_message?: string
}

export interface StepStateData {
  status: string
  on_recovery?: string
  started_at?: string
  finished_at?: string
  error_message?: string
  error_code?: string
}

// WorkflowEvent is the raw event shape used by the agent SSE stream.
export interface WorkflowEvent {
  type: string
  timestamp: string
  execution_id: string
  step_id?: string
  data?: Record<string, unknown>
  message?: string
  seq?: number
}
