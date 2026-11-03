package core

import (
	"testing"

	"github.com/safebucket/safebucket/internal/events"

	"github.com/stretchr/testify/assert"
)

// TestEveryRegisteredEventHasTopic guards the runtime invariant behind the event
// router. Publishing an event without a topic used to kill the process, so every
// registered event must resolve to a topic.
func TestEveryRegisteredEventHasTopic(t *testing.T) {
	router := &EventRouter{}

	names := events.EventTypeNames()
	assert.NotEmpty(t, names)

	for _, name := range names {
		assert.NotEmpty(t, router.getTopicKeyForEvent(name), "event %q has no topic in getTopicKeyForEvent", name)
	}
}
