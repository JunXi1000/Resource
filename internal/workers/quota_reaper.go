package workers

import (
	"context"
	"time"

	"github.com/safebucket/safebucket/internal/sql"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

// ReapBatchSize bounds one reaper pass. The worker runs again on the next
// tick, so a backlog larger than the batch drains gradually instead of holding
// long transactions.
const ReapBatchSize = 500

// QuotaReaperWorker releases upload quota holds that outlived their TTL.
//
// It is the safety net behind the explicit release paths (upload aborted,
// version cleaned up, file purged): an upload whose presigned URL expired or
// whose browser died never triggers those, so without this worker the bytes
// would stay reserved forever and quietly eat the user's quota.
type QuotaReaperWorker struct {
	DB          *gorm.DB
	RunInterval time.Duration
}

func (w *QuotaReaperWorker) Start(ctx context.Context) {
	StartPeriodicWorker(ctx, "quota_reaper", w.RunInterval, []WorkerTask{
		{Name: "expired_reservations", Fn: w.releaseExpired},
	})
}

func (w *QuotaReaperWorker) releaseExpired(ctx context.Context) (int, error) {
	select {
	case <-ctx.Done():
		return 0, nil
	default:
	}

	released, err := sql.ReapExpiredReservations(w.DB, time.Now(), ReapBatchSize)
	if err != nil {
		return 0, err
	}
	if released > 0 {
		zap.L().Info("Released expired quota reservations", zap.Int64("count", released))
	}
	return int(released), nil
}
