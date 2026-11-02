package handlers

import (
	"net/http"

	apierrors "github.com/safebucket/safebucket/internal/errors"
	h "github.com/safebucket/safebucket/internal/helpers"
	m "github.com/safebucket/safebucket/internal/middlewares"
	"github.com/safebucket/safebucket/internal/models"
	"github.com/safebucket/safebucket/internal/tracing"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// Public handlers differ from the generic ones in exactly one way: they never
// read user claims. Anonymous requests have no claims in context, so reusing
// the authenticated handlers would silently pass a zero-value identity into
// the service layer.

type (
	PublicListTargetFunc[Q any, Out any] func(*zap.Logger, Q) (models.Page[Out], error)

	PublicBucketGetOneTargetFunc[Out any] func(
		*zap.Logger, models.PublicBucketListItem,
	) (Out, error)

	PublicBucketGetOneWithQueryTargetFunc[Q any, Out any] func(
		*zap.Logger, models.PublicBucketListItem, Q,
	) (Out, error)

	PublicGetOneTargetFunc[Out any] func(*zap.Logger, uuid.UUIDs) (Out, error)

	PublicReadTargetFunc[Out any] func(*zap.Logger) (Out, error)
)

// PublicReadHandler serves a collection that needs no parameters at all, such
// as the category index.
func PublicReadHandler[Out any](target PublicReadTargetFunc[Out]) http.HandlerFunc {
	name := spanName(target)

	return func(w http.ResponseWriter, r *http.Request) {
		ctx, span := tracing.StartSpan(r.Context(), name)
		defer span.End()
		r = r.WithContext(ctx)

		record, err := target(m.GetLogger(r))
		if err != nil {
			WriteError(span, w, err)
			return
		}

		h.RespondWithJSON(w, http.StatusOK, record)
	}
}

// PublicListHandler serves a cursor-paginated collection to anonymous clients.
func PublicListHandler[Q any, Out any](target PublicListTargetFunc[Q, Out]) http.HandlerFunc {
	name := spanName(target)

	return func(w http.ResponseWriter, r *http.Request) {
		ctx, span := tracing.StartSpan(r.Context(), name)
		defer span.End()
		r = r.WithContext(ctx)

		logger := m.GetLogger(r)

		query, ok := r.Context().Value(models.QueryKey{}).(Q)
		if !ok {
			logger.Error("Failed to extract query params from context")
			h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
			return
		}

		page, err := target(logger, query)
		if err != nil {
			WriteError(span, w, err)
			return
		}

		h.RespondWithJSON(w, http.StatusOK, page)
	}
}

// PublicBucketGetOneHandler serves a single catalog entry. The entry was
// already resolved and visibility-checked by LoadPublicBucket.
func PublicBucketGetOneHandler[Out any](target PublicBucketGetOneTargetFunc[Out]) http.HandlerFunc {
	name := spanName(target)

	return func(w http.ResponseWriter, r *http.Request) {
		ctx, span := tracing.StartSpan(r.Context(), name)
		defer span.End()
		r = r.WithContext(ctx)

		logger := m.GetLogger(r)

		bucket, ok := m.GetPublicBucket(r)
		if !ok {
			logger.Error("Public bucket missing from request context")
			h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
			return
		}

		record, err := target(logger, bucket)
		if err != nil {
			WriteError(span, w, err)
			return
		}

		h.RespondWithJSON(w, http.StatusOK, record)
	}
}

// PublicBucketGetOneWithQueryHandler serves a catalog entry that needs query
// parameters, such as the folder listing.
func PublicBucketGetOneWithQueryHandler[Q any, Out any](
	target PublicBucketGetOneWithQueryTargetFunc[Q, Out],
) http.HandlerFunc {
	name := spanName(target)

	return func(w http.ResponseWriter, r *http.Request) {
		ctx, span := tracing.StartSpan(r.Context(), name)
		defer span.End()
		r = r.WithContext(ctx)

		logger := m.GetLogger(r)

		bucket, ok := m.GetPublicBucket(r)
		if !ok {
			logger.Error("Public bucket missing from request context")
			h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
			return
		}

		query, ok := r.Context().Value(models.QueryKey{}).(Q)
		if !ok {
			logger.Error("Failed to extract query params from context")
			h.RespondWithError(w, http.StatusInternalServerError, []string{apierrors.CodeInternalServerError})
			return
		}

		record, err := target(logger, bucket, query)
		if err != nil {
			WriteError(span, w, err)
			return
		}

		h.RespondWithJSON(w, http.StatusOK, record)
	}
}

// PublicGetOneHandler serves a resource addressed by path UUIDs, such as the
// presigned download URL of a public file.
func PublicGetOneHandler[Out any](target PublicGetOneTargetFunc[Out]) http.HandlerFunc {
	name := spanName(target)

	return func(w http.ResponseWriter, r *http.Request) {
		ctx, span := tracing.StartSpan(r.Context(), name)
		defer span.End()
		r = r.WithContext(ctx)

		ids, ok := h.ParseUUIDs(w, r)
		if !ok {
			return
		}

		logger := m.GetLogger(r)

		record, err := target(logger, ids)
		if err != nil {
			WriteError(span, w, err)
			return
		}

		h.RespondWithJSON(w, http.StatusOK, record)
	}
}
