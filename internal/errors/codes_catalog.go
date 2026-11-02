package apierrors

// Errors raised by the public catalog, self-service registration, per-user
// quota enforcement and the upload review workflow.
const (
	CodeRegistrationDisabled   = "REGISTRATION_DISABLED"
	CodeEmailAlreadyRegistered = "EMAIL_ALREADY_REGISTERED"
	CodeEmailNotVerified       = "EMAIL_NOT_VERIFIED"
	CodeInvalidVerification    = "INVALID_VERIFICATION_CODE"
	CodeUserPendingApproval    = "USER_PENDING_APPROVAL"
	CodeUserSuspended          = "USER_SUSPENDED"
)

const (
	CodeQuotaExceeded = "QUOTA_EXCEEDED"
	CodeInvalidSlug   = "INVALID_SLUG"
	CodeSlugTaken     = "SLUG_TAKEN"
)

const (
	CodeBucketNotPublic         = "BUCKET_NOT_PUBLIC"
	CodeReviewInvalidTransition = "REVIEW_INVALID_TRANSITION"
	CodeReviewNotAllowed        = "REVIEW_NOT_ALLOWED"
)
