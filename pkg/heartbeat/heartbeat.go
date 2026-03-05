package heartbeat

// Metrics represents the normalized metrics sent from agent to SaaS.
// Agent must populate these fields with consistent units.
type Metrics struct {
	CPUPercent  float64 `json:"cpu_percent"`
	MemoryBytes uint64  `json:"memory_bytes"` // RSS in bytes
	Goroutines  int     `json:"goroutines"`
	NetRxBytes  uint64  `json:"net_rx_bytes"`
	NetTxBytes  uint64  `json:"net_tx_bytes"`
	UptimeS     uint64  `json:"uptime_s"`
}

// Request is the heartbeat payload sent by the agent.
type Request struct {
	AgentID          string  `json:"agent_id"`
	SessionID        string  `json:"session_id"`
	UptimeS          uint64  `json:"uptime_s"`
	ActiveExecutions int     `json:"active_executions"`
	Metrics          Metrics `json:"metrics"`
}
