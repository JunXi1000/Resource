# Frontend
FROM node:26-alpine AS frontend-builder

WORKDIR /app/web

COPY web/package*.json ./
COPY web/ ./

RUN npm install && npm run build

# Backend
FROM golang:1.27-bookworm AS backend-builder

ARG UPX_VERSION=5.3.0
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates tzdata curl xz-utils && rm -rf /var/lib/apt/lists/*
RUN curl -L -o upx.tar.xz https://github.com/upx/upx/releases/download/v${UPX_VERSION}/upx-${UPX_VERSION}-${TARGETARCH}_linux.tar.xz && \
    tar -xf upx.tar.xz && \
    mv upx-${UPX_VERSION}-${TARGETARCH}_linux/upx /usr/local/bin/ && \
    rm -rf upx.tar.xz upx-${UPX_VERSION}-${TARGETARCH}_linux

WORKDIR /app

# GOPROXY is overridable for networks where proxy.golang.org is unreachable.
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}

COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY --from=frontend-builder /app/web/dist ./web/dist

RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -a -o safebucket . && \
    upx --best --lzma safebucket && \
    mkdir -p /app/data

# Runtime
# debian:bookworm-slim instead of distroless: gcr.io is unreachable from some
# networks, and this keeps the runtime pullable everywhere. The nonroot user
# keeps uid 65532 so volumes created by the official distroless image stay
# writable across upgrades.
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 65532 --no-create-home --shell /usr/sbin/nologin nonroot

WORKDIR /app

COPY --from=backend-builder --chown=nonroot:nonroot /app/safebucket ./safebucket
COPY --chown=nonroot:nonroot --from=backend-builder /app/data /app/data

USER nonroot

EXPOSE 8080

CMD ["./safebucket"]
