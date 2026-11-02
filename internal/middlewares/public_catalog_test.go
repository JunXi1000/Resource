package middlewares

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

// The catalog is the only part of the API reachable without a token. A typo in
// the exclusion pattern would either break anonymous browsing or, far worse,
// silently open unrelated endpoints, so the boundary is pinned by a test.
func TestPublicCatalogAnonymousBoundary(t *testing.T) {
	getPaths := map[string]bool{
		"/api/v1/public":                     true,
		"/api/v1/public/buckets":             true,
		"/api/v1/public/buckets/tools":       true,
		"/api/v1/public/buckets/tools/files": true,
		"/api/v1/public/categories":          true,
		"/api/v1/public/files/8f14e45f/url":  true,
		"/api/v1/publicity":                  false,
		"/api/v1/public-admin/buckets":       false,
		"/api/v1/buckets":                    false,
		"/api/v1/admin/public":               false,
	}

	for path, anonymous := range getPaths {
		assert.Equal(t, anonymous, isPathExcludedFromAuth(path, http.MethodGet), path)
	}

	assert.False(t, isPathExcludedFromAuth("/api/v1/public/buckets", http.MethodPost))
	assert.False(t, isPathExcludedFromAuth("/api/v1/public/buckets", http.MethodDelete))
}
