package middlewares

import (
	"context"
	"errors"
	"net/http"

	apierrors "github.com/safebucket/safebucket/internal/errors"
	"github.com/safebucket/safebucket/internal/helpers"
	"github.com/safebucket/safebucket/internal/models"
	"github.com/safebucket/safebucket/internal/sql"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// PublicBucketKey carries the catalog entry resolved from the {slug} path
// parameter, mirroring how ShareKey carries a resolved share.
type PublicBucketKey struct{}

// LoadPublicBucket resolves {slug} to a published bucket before the handler
// runs. Unknown and private buckets both surface as 404 BUCKET_NOT_PUBLIC so
// the endpoint cannot be used to discover private bucket names.
func LoadPublicBucket(db *gorm.DB) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			bucket, err := sql.GetPublicBucketBySlug(db, chi.URLParam(r, "slug"))
			if err != nil {
				status, code := http.StatusInternalServerError, apierrors.CodeInternalServerError

				var apiErr *apierrors.APIError
				if errors.As(err, &apiErr) {
					status, code = apiErr.Status, apiErr.Code
				}

				helpers.RespondWithError(w, status, []string{code})
				return
			}

			ctx := context.WithValue(r.Context(), PublicBucketKey{}, bucket)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetPublicBucket reads the bucket resolved by LoadPublicBucket.
func GetPublicBucket(r *http.Request) (models.PublicBucketListItem, bool) {
	bucket, ok := r.Context().Value(PublicBucketKey{}).(models.PublicBucketListItem)
	return bucket, ok
}
