export interface HeartbeatMetrics {
  organization_id: string
  agent_id: string
  session_id: string
  uptime_s: number
  active_executions: number
  cpu_percent: number
  memory_bytes: number
  net_rx_bytes: number
  net_tx_bytes: number
}

export interface MetricsPoint {
  timestamp: string
  cpu_percent: number
  memory_bytes: number
  net_rx_bytes: number
  net_tx_bytes: number
}
