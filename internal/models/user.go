package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Role string

const (
	RoleAdmin Role = "admin"
	RoleUser  Role = "user"
	RoleGuest Role = "guest"
)

// UserStatus tracks the account lifecycle, orthogonal to Role.
// Role answers "what is this user allowed to do", Status answers
// "is this account usable right now".
type UserStatus string

const (
	// UserStatusPending means the email is verified but an admin has not
	// approved the account yet. Such users can log in but cannot use
	// any business endpoint.
	UserStatusPending UserStatus = "pending"
	UserStatusActive  UserStatus = "active"
	// UserStatusSuspended is a ban: the account keeps its data but is
	// rejected at authentication time.
	UserStatusSuspended UserStatus = "suspended"
)

// DefaultUserQuotaBytes is the per-user upload quota applied to newly
// registered accounts: 20 GiB.
const DefaultUserQuotaBytes int64 = 20 * 1024 * 1024 * 1024

type User struct {
	ID              uuid.UUID    `gorm:"default:(-)"                                              json:"id"`
	FirstName       string       `gorm:"default:null"                                             json:"first_name"`
	LastName        string       `gorm:"default:null"                                             json:"last_name"`
	Email           string       `gorm:"not null;default:null;uniqueIndex:idx_email_provider_key" json:"email"`
	HashedPassword  string       `gorm:"default:null"                                             json:"-"`
	ProviderType    ProviderType `gorm:"not null"                                                 json:"provider_type"`
	ProviderKey     string       `gorm:"not null;uniqueIndex:idx_email_provider_key"              json:"provider_key"`
	Role            Role         `gorm:"not null"                                                 json:"role"`
	Status          UserStatus   `gorm:"not null;default:active"                                  json:"status"`
	EmailVerifiedAt *time.Time   `gorm:"default:null"                                             json:"email_verified_at,omitempty"`
	ApprovedBy      *uuid.UUID   `gorm:"default:null"                                             json:"approved_by,omitempty"`
	ApprovedAt      *time.Time   `gorm:"default:null"                                             json:"approved_at,omitempty"`
	// QuotaBytes of 0 means unlimited. Because of the gorm default tag a zero
	// value is omitted on insert, so a quota can only be set to 0 explicitly
	// through an Updates(map[string]any{...}) call. See QuotaService.
	QuotaBytes int64          `gorm:"not null;default:21474836480" json:"quota_bytes"`
	UsedBytes  int64          `gorm:"not null;default:0"           json:"used_bytes"`
	CreatedAt  time.Time      `                                    json:"created_at"`
	UpdatedAt  time.Time      `                                    json:"updated_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index"                        json:"-"`
	MFADevices []MFADevice    `gorm:"foreignKey:UserID"            json:"-"`
}

type UserListItem struct {
	ID           uuid.UUID    `json:"id"`
	FirstName    string       `json:"first_name"`
	LastName     string       `json:"last_name"`
	Email        string       `json:"email"`
	ProviderType ProviderType `json:"provider_type"`
	ProviderKey  string       `json:"provider_key"`
	Role         Role         `json:"role"`
	Status       UserStatus   `json:"status"`
	QuotaBytes   int64        `json:"quota_bytes"`
	UsedBytes    int64        `json:"used_bytes"`
	CreatedAt    time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
	MFAEnabled   bool         `json:"mfa_enabled"`
}

// UserUsage describes how much of the quota an account consumes.
type UserUsage struct {
	QuotaBytes    int64   `json:"quota_bytes"`
	UsedBytes     int64   `json:"used_bytes"`
	ReservedBytes int64   `json:"reserved_bytes"`
	Percent       float64 `json:"percent"`
}

func (u *User) IsActive() bool {
	return u.Status == UserStatusActive
}

func (u *User) IsSuspended() bool {
	return u.Status == UserStatusSuspended
}

func (u *User) BeforeSave(_ *gorm.DB) error {
	u.Email = NormalizeEmail(u.Email)
	return nil
}

func (u *User) HasMFAEnabled() bool {
	for _, d := range u.MFADevices {
		if d.IsVerified {
			return true
		}
	}
	return false
}

func (u *User) GetVerifiedDevices() []MFADevice {
	var verified []MFADevice
	for _, d := range u.MFADevices {
		if d.IsVerified {
			verified = append(verified, d)
		}
	}
	return verified
}

func (u *User) GetDefaultDevice() *MFADevice {
	for i := range u.MFADevices {
		if u.MFADevices[i].IsDefault && u.MFADevices[i].IsVerified {
			return &u.MFADevices[i]
		}
	}
	return nil
}

type UserInfo struct {
	ID        uuid.UUID `json:"id"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Email     string    `json:"email"`
}

func (u *User) ToActivity() UserInfo {
	return UserInfo{
		ID:        u.ID,
		FirstName: u.FirstName,
		LastName:  u.LastName,
		Email:     u.Email,
	}
}

type UserCreateBody struct {
	FirstName string `json:"first_name" validate:"omitempty,max=100"`
	LastName  string `json:"last_name"  validate:"omitempty,max=100"`
	Email     string `json:"email"      validate:"required,omitempty,email,max=254"`
	Password  string `json:"password"   validate:"required,min=8,max=72"`
}

func (b *UserCreateBody) NormalizeEmail() { b.Email = NormalizeEmail(b.Email) }

type UserUpdateBody struct {
	FirstName   string `json:"first_name"   validate:"omitempty,max=100"`
	LastName    string `json:"last_name"    validate:"omitempty,max=100"`
	OldPassword string `json:"old_password" validate:"omitempty,required_with=NewPassword,max=72"`
	NewPassword string `json:"new_password" validate:"omitempty,min=8,max=72"`
}

type UserStatsResponse struct {
	TotalFiles   int `json:"total_files"`
	TotalBuckets int `json:"total_buckets"`
}
