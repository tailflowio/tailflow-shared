package event

// StepWaitingData is the data payload for StepWaiting events.
type StepWaitingData struct {
	WaitType string `json:"wait_type"`
}

// StepGotoData is the data payload for StepGoto events.
type StepGotoData struct {
	Target        string   `json:"target"`
	Iteration     int      `json:"iteration"`
	MaxIterations int      `json:"max_iterations"`
	Body          []string `json:"body"`
}

// WorkflowCompletedData is the data payload for WorkflowCompleted events.
type WorkflowCompletedData struct {
	Status string `json:"status"` // "success", "failed"
}

// StepOutputData is the data payload for StepOutput/StepCompleted events.
type StepOutputData struct {
	Output any `json:"output"`
}

// StepInputData is the data payload for StepInput events.
type StepInputData struct {
	Config  any `json:"config,omitempty"`
	Trigger any `json:"trigger,omitempty"`
	Deps    any `json:"deps,omitempty"`
}

// StepLogData is the data payload for StepLog events.
type StepLogData struct {
	Level  string `json:"level,omitempty"`  // "error", "warn", "info"
	Stream bool   `json:"stream,omitempty"`
}
