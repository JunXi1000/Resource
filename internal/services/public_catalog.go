package services

import (
	"net/http"

	apierrors "github.com/safebucket/safebucket/internal/errors"
	"github.com/safebucket/safebucket/internal/handlers"
	h "github.com/safebucket/safebucket/internal/helpers"
	m "github.com/safebucket/safebucket/internal/middlewares"
	"github.com/safebucket/safebucket/internal/models"
	"github.com/safebucket/safebucket/internal/sql"
	"github.com/safebucket/safebucket/internal/storage"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// PublicCatalogService serves the anonymous, read-only catalog. It never reads
// user claims and never accepts writes: every rule that decides what a visitor
// may see lives in the SQL layer, so there is no code path here that could be
// tricked into returning a private bucket.
type PublicCatalogService struct {
	DB      *gorm.DB
	Storage storage.IStorage
	Enabled bool
}

func (s PublicCatalogService) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(s.requireEnabled)

	r.Route("/buckets", func(r chi.Router) {
		r.With(m.ValidateQuery[models.PublicBucketQuery]).
			Get("/", handlers.PublicListHandler(s.ListBuckets))

		r.Route("/{slug}", func(r chi.Router) {
			r.Use(m.LoadPublicBucket(s.DB))

			r.Get("/", handlers.PublicBucketGetOneHandler(s.GetBucket))

			r.With(m.ValidateQuery[models.PublicFileQuery]).
				Get("/files", handlers.PublicBucketGetOneWithQueryHandler(s.ListBucketFiles))
		})
	})

	r.Get("/categories", handlers.PublicReadHandler(s.ListCategories))
	r.Get("/files/{id0}/url", handlers.PublicGetOneHandler(s.DownloadFile))

	return r
}

// requireEnabled turns the whole catalog into a 404 when the feature is
// switched off, which is what an operator expects from a disabled endpoint.
func (s PublicCatalogService) requireEnabled(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.Enabled {
			h.RespondWithError(w, http.StatusNotFound, []string{apierrors.CodeNotFound})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s PublicCatalogService) ListBuckets(
	logger *zap.Logger,
	query models.PublicBucketQuery,
) (models.Page[models.PublicBucketListItem], error) {
	empty := models.Page[models.PublicBucketListItem]{Data: []models.PublicBucketListItem{}}

	items, nextCursor, err := sql.ListPublicBuckets(s.DB, query)
	if err != nil {
		logger.Error("Failed to list public buckets", zap.Error(err))
		return empty, err
	}

	return models.Page[models.PublicBucketListItem]{Data: items, NextCursor: nextCursor}, nil
}

func (s PublicCatalogService) GetBucket(
	_ *zap.Logger,
	bucket models.PublicBucketListItem,
) (models.PublicBucketListItem, error) {
	return bucket, nil
}

func (s PublicCatalogService) ListBucketFiles(
	logger *zap.Logger,
	bucket models.PublicBucketListItem,
	query models.PublicFileQuery,
) (models.PublicFileListing, error) {
	listing := models.PublicFileListing{
		Bucket:     bucket,
		Breadcrumb: []models.PublicFolderItem{},
		Folders:    []models.PublicFolderItem{},
		Files:      []models.PublicFileItem{},
	}

	if query.Folder != "" {
		folderID, err := uuid.Parse(query.Folder)
		if err != nil {
			return models.PublicFileListing{}, apierrors.New(
				http.StatusBadRequest, apierrors.CodeInvalidUUID,
			)
		}

		folder, folderErr := sql.GetPublicFolder(s.DB, bucket.ID, folderID)
		if folderErr != nil {
			logger.Error("Failed to load public folder", zap.Error(folderErr))
			return models.PublicFileListing{}, folderErr
		}

		listing.Folder = &folder
		listing.Breadcrumb = sql.PublicBreadcrumb(s.DB, bucket.ID, folderID)
	}

	folders, err := sql.ListPublicFolders(s.DB, bucket.ID, query.Folder)
	if err != nil {
		logger.Error("Failed to list public folders", zap.Error(err))
		return models.PublicFileListing{}, err
	}
	listing.Folders = folders

	files, nextCursor, err := sql.ListPublicFiles(s.DB, bucket.ID, query)
	if err != nil {
		logger.Error("Failed to list public files", zap.Error(err))
		return models.PublicFileListing{}, err
	}
	listing.Files = files
	listing.NextCursor = nextCursor

	return listing, nil
}

func (s PublicCatalogService) ListCategories(
	logger *zap.Logger,
) (models.Page[models.PublicCategoryItem], error) {
	items, err := sql.ListPublicCategories(s.DB)
	if err != nil {
		logger.Error("Failed to list public categories", zap.Error(err))
		return models.Page[models.PublicCategoryItem]{Data: []models.PublicCategoryItem{}}, err
	}

	return models.Page[models.PublicCategoryItem]{Data: items}, nil
}

// DownloadFile mints a short-lived presigned URL. Visibility is re-checked in
// SQL on every call: a file that was un-published or sent back to review after
// the catalog page was rendered must stop downloading immediately.
func (s PublicCatalogService) DownloadFile(
	logger *zap.Logger,
	ids uuid.UUIDs,
) (models.PublicDownloadResponse, error) {
	if len(ids) == 0 {
		return models.PublicDownloadResponse{}, apierrors.New(
			http.StatusBadRequest, apierrors.CodeInvalidUUID,
		)
	}

	file, err := sql.GetPublicDownloadableFile(s.DB, ids[0])
	if err != nil {
		return models.PublicDownloadResponse{}, err
	}

	url, presignErr := s.Storage.PresignedGetObject(
		storage.VersionObjectKey(file.BucketID, file.ContentVersionID()),
		storage.GetObjectOptions{DownloadFilename: file.Name},
	)
	if presignErr != nil {
		logger.Error("Failed to presign public download", zap.Error(presignErr))
		return models.PublicDownloadResponse{}, apierrors.New(
			http.StatusInternalServerError, apierrors.CodeInternalServerError,
		)
	}

	return models.PublicDownloadResponse{
		ID:   file.ID,
		Name: file.Name,
		Size: int64(file.Size),
		URL:  url,
	}, nil
}
