package event

import "time"

// EventType represents the type of a workflow event.
type EventType string

const (
	WorkflowStarted   EventType = "workflow.started"
	WorkflowCompleted EventType = "workflow.completed"
	StepStarted       EventType = "step.started"
	StepCompleted     EventType = "step.completed"
	StepFailed        EventType = "step.failed"
	StepSkipped       EventType = "step.skipped"
	StepLog           EventType = "step.log"
	StepWaiting       EventType = "step.waiting"
	StepInput         EventType = "step.input"
	StepOutput        EventType = "step.output"
	StepGoto          EventType = "step.goto"
	Metrics           EventType = "metrics"
)

// AllTypes returns all known event types (useful for validation).
var AllTypes = []EventType{
	WorkflowStarted, WorkflowCompleted,
	StepStarted, StepCompleted, StepFailed, StepSkipped,
	StepLog, StepWaiting, StepInput, StepOutput, StepGoto,
	Metrics,
}

// Event represents a single workflow event.
type Event struct {
	Type        EventType      `json:"type"`
	Timestamp   time.Time      `json:"timestamp"`
	ExecutionID string         `json:"execution_id"`
	StepID      string         `json:"step_id,omitempty"`
	Data        map[string]any `json:"data,omitempty"`
	Message     string         `json:"message,omitempty"`
	Seq         uint64         `json:"seq,omitempty"`
}
