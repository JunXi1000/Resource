package helpers

import (
	"encoding/base64"
	"encoding/json"
	"net/http"

	apierrors "github.com/safebucket/safebucket/internal/errors"

	"github.com/google/uuid"
)

// CatalogCursor is an opaque keyset pagination cursor. It stores the sort key
// of the last row of the previous page plus that row's id, so rows sharing the
// same sort key (identical names, identical timestamps) never get skipped or
// repeated across pages.
type CatalogCursor struct {
	Value string    `json:"v"`
	ID    uuid.UUID `json:"id"`
}

// EncodeCatalogCursor serialises a keyset position. The encoding is opaque on
// purpose: clients must not build cursors themselves.
func EncodeCatalogCursor(value string, id uuid.UUID) string {
	raw, err := json.Marshal(CatalogCursor{Value: value, ID: id})
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

// DecodeCatalogCursor parses a cursor produced by EncodeCatalogCursor.
// A malformed cursor is a client error, never a server error.
func DecodeCatalogCursor(cursor string) (CatalogCursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return CatalogCursor{}, apierrors.New(http.StatusBadRequest, apierrors.CodeBadRequest)
	}

	var decoded CatalogCursor
	if unmarshalErr := json.Unmarshal(raw, &decoded); unmarshalErr != nil {
		return CatalogCursor{}, apierrors.New(http.StatusBadRequest, apierrors.CodeBadRequest)
	}
	if decoded.ID == uuid.Nil {
		return CatalogCursor{}, apierrors.New(http.StatusBadRequest, apierrors.CodeBadRequest)
	}

	return decoded, nil
}
