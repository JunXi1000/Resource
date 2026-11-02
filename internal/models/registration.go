package models

import (
	"time"

	"github.com/google/uuid"
)

// RegistrationState is the value returned to the signup client after each step.
// It never reveals whether the email already had an account.
type RegistrationState string

const (
	RegistrationStatePendingVerification RegistrationState = "pending_verification"
	RegistrationStatePendingApproval     RegistrationState = "pending_approval"
	RegistrationStateActive              RegistrationState = "active"
)

// RegistrationBody is the self-service signup payload.
type RegistrationBody struct {
	FirstName string `json:"first_name" validate:"omitempty,max=100"`
	LastName  string `json:"last_name"  validate:"omitempty,max=100"`
	Email     string `json:"email"      validate:"required,email,max=254"`
	Password  string `json:"password"   validate:"required,min=8,max=72"`
}

func (b *RegistrationBody) NormalizeEmail() { b.Email = NormalizeEmail(b.Email) }

// RegistrationVerifyBody carries the six-character code mailed by signup.
type RegistrationVerifyBody struct {
	Email string `json:"email" validate:"required,email,max=254"`
	Code  string `json:"code"  validate:"required,len=6"`
}

func (b *RegistrationVerifyBody) NormalizeEmail() { b.Email = NormalizeEmail(b.Email) }

// RegistrationResendBody asks for a fresh verification code.
type RegistrationResendBody struct {
	Email string `json:"email" validate:"required,email,max=254"`
}

func (b *RegistrationResendBody) NormalizeEmail() { b.Email = NormalizeEmail(b.Email) }

// RegistrationResponse is what every signup step returns.
type RegistrationResponse struct {
	Status RegistrationState `json:"status"`
}

// AdminUserListQueryParams filters the approval queue. Cursor pagination is
// shared with the public catalog: keyset on (created_at, id).
type AdminUserListQueryParams struct {
	Status string `json:"status" validate:"omitempty,oneof=pending active suspended"`
	Query  string `json:"q"      validate:"omitempty,max=254"`
	Cursor string `json:"cursor" validate:"omitempty,max=512"`
	Limit  int    `json:"limit"  validate:"omitempty,gte=1,lte=100"`
}

// AdminUserItem is the approval-queue projection. It deliberately differs from
// UserListItem: operators need the review trail, and the payload is only ever
// served to administrators.
type AdminUserItem struct {
	ID              uuid.UUID  `json:"id"`
	FirstName       string     `json:"first_name"`
	LastName        string     `json:"last_name"`
	Email           string     `json:"email"`
	Role            Role       `json:"role"`
	Status          UserStatus `json:"status"`
	EmailVerifiedAt *time.Time `json:"email_verified_at"`
	ApprovedBy      *uuid.UUID `json:"approved_by"`
	ApprovedAt      *time.Time `json:"approved_at"`
	QuotaBytes      int64      `json:"quota_bytes"`
	UsedBytes       int64      `json:"used_bytes"`
	CreatedAt       time.Time  `json:"created_at"`
}

// AdminApproveUserBody activates a pending account. QuotaBytes is optional: when
// omitted the account keeps the site default it was created with.
type AdminApproveUserBody struct {
	QuotaBytes *int64 `json:"quota_bytes" validate:"omitempty,gte=0"`
}

// AdminRejectUserBody rejects a pending signup. It only applies to accounts
// that never got approved, so nothing is logged in the reason beyond audit.
type AdminRejectUserBody struct {
	Reason string `json:"reason" validate:"omitempty,max=500"`
}

// AdminSuspendUserBody bans an active account.
type AdminSuspendUserBody struct {
	Reason string `json:"reason" validate:"required,min=3,max=500"`
}

// AdminUserQuotaBody changes the storage quota of any account.
type AdminUserQuotaBody struct {
	QuotaBytes int64 `json:"quota_bytes" validate:"gte=0"`
}
