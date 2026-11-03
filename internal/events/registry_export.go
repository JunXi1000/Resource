package events

import "strings"

// EventTypeNames returns every registered event type name, excluding the
// companion payload type names. The event router maps each of these to a
// message topic; a missing mapping used to be fatal at runtime, so callers
// (and tests) need a way to enumerate them.
func EventTypeNames() []string {
	names := make([]string, 0, len(eventRegistry))
	for name := range eventRegistry {
		if strings.HasSuffix(name, "Payload") {
			continue
		}
		names = append(names, name)
	}
	return names
}
