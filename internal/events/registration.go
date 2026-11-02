package events

import (
	"encoding/json"

	"github.com/safebucket/safebucket/internal/messaging"

	"github.com/ThreeDotsLabs/watermill"
	"github.com/ThreeDotsLabs/watermill/message"
	"go.uber.org/zap"
)

const (
	RegistrationChallengeName        = "RegistrationChallenge"
	RegistrationChallengePayloadName = "RegistrationChallengePayload"
)

type RegistrationChallengePayload struct {
	Type       string
	Secret     string
	To         string
	WebURL     string
	VerifyURL  string
	ExpiresMin int
}

type RegistrationChallengeEvent struct {
	Publisher messaging.IPublisher
	Payload   RegistrationChallengePayload
}

func NewRegistrationChallenge(
	publisher messaging.IPublisher,
	secret string,
	to string,
	webURL string,
	expiresMin int,
) RegistrationChallengeEvent {
	return RegistrationChallengeEvent{
		Publisher: publisher,
		Payload: RegistrationChallengePayload{
			Type:       RegistrationChallengeName,
			Secret:     secret,
			To:         to,
			WebURL:     webURL,
			VerifyURL:  webURL + "/auth/register/verify",
			ExpiresMin: expiresMin,
		},
	}
}

func (e *RegistrationChallengeEvent) Trigger() {
	payload, err := json.Marshal(e.Payload)
	if err != nil {
		zap.L().Error("Error marshalling event payload", zap.Error(err))
		return
	}

	msg := message.NewMessage(watermill.NewUUID(), payload)
	msg.Metadata.Set("type", e.Payload.Type)
	if err := e.Publisher.Publish(msg); err != nil {
		zap.L().Error("failed to trigger event", zap.Error(err))
	}
}

func (e *RegistrationChallengeEvent) callback(params *EventParams) error {
	e.Payload.WebURL = params.WebURL
	subject := "Verify your email address"
	err := params.Notifier.NotifyFromTemplate(
		e.Payload.To,
		subject,
		"registration_verification",
		e.Payload,
	)
	if err != nil {
		zap.L().Error("failed to notify", zap.Any("event", e), zap.Error(err))
		return err
	}
	return nil
}

const (
	RegistrationApprovedName        = "RegistrationApproved"
	RegistrationApprovedPayloadName = "RegistrationApprovedPayload"
)

type RegistrationApprovedPayload struct {
	Type      string
	To        string
	WebURL    string
	LoginURL  string
	QuotaSize string
}

type RegistrationApprovedEvent struct {
	Publisher messaging.IPublisher
	Payload   RegistrationApprovedPayload
}

func NewRegistrationApproved(
	publisher messaging.IPublisher,
	to string,
	webURL string,
	quotaSize string,
) RegistrationApprovedEvent {
	return RegistrationApprovedEvent{
		Publisher: publisher,
		Payload: RegistrationApprovedPayload{
			Type:      RegistrationApprovedName,
			To:        to,
			WebURL:    webURL,
			LoginURL:  webURL + "/auth/login",
			QuotaSize: quotaSize,
		},
	}
}

func (e *RegistrationApprovedEvent) Trigger() {
	payload, err := json.Marshal(e.Payload)
	if err != nil {
		zap.L().Error("Error marshalling event payload", zap.Error(err))
		return
	}

	msg := message.NewMessage(watermill.NewUUID(), payload)
	msg.Metadata.Set("type", e.Payload.Type)
	if err := e.Publisher.Publish(msg); err != nil {
		zap.L().Error("failed to trigger event", zap.Error(err))
	}
}

func (e *RegistrationApprovedEvent) callback(params *EventParams) error {
	e.Payload.WebURL = params.WebURL
	subject := "Your account has been approved"
	err := params.Notifier.NotifyFromTemplate(
		e.Payload.To,
		subject,
		"registration_approved",
		e.Payload,
	)
	if err != nil {
		zap.L().Error("failed to notify", zap.Any("event", e), zap.Error(err))
		return err
	}
	return nil
}

const (
	RegistrationRejectedName        = "RegistrationRejected"
	RegistrationRejectedPayloadName = "RegistrationRejectedPayload"
)

type RegistrationRejectedPayload struct {
	Type   string
	To     string
	WebURL string
	Reason string
}

type RegistrationRejectedEvent struct {
	Publisher messaging.IPublisher
	Payload   RegistrationRejectedPayload
}

func NewRegistrationRejected(
	publisher messaging.IPublisher,
	to string,
	webURL string,
	reason string,
) RegistrationRejectedEvent {
	return RegistrationRejectedEvent{
		Publisher: publisher,
		Payload: RegistrationRejectedPayload{
			Type:   RegistrationRejectedName,
			To:     to,
			WebURL: webURL,
			Reason: reason,
		},
	}
}

func (e *RegistrationRejectedEvent) Trigger() {
	payload, err := json.Marshal(e.Payload)
	if err != nil {
		zap.L().Error("Error marshalling event payload", zap.Error(err))
		return
	}

	msg := message.NewMessage(watermill.NewUUID(), payload)
	msg.Metadata.Set("type", e.Payload.Type)
	if err := e.Publisher.Publish(msg); err != nil {
		zap.L().Error("failed to trigger event", zap.Error(err))
	}
}

func (e *RegistrationRejectedEvent) callback(params *EventParams) error {
	e.Payload.WebURL = params.WebURL
	subject := "Your registration request was declined"
	err := params.Notifier.NotifyFromTemplate(
		e.Payload.To,
		subject,
		"registration_rejected",
		e.Payload,
	)
	if err != nil {
		zap.L().Error("failed to notify", zap.Any("event", e), zap.Error(err))
		return err
	}
	return nil
}
