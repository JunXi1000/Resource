import { useDeferredValue, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  Search,
} from "lucide-react";
import type { FC } from "react";
import type { IPublicFile } from "@/types/public-catalog";
import {
  publicDownloadUrl,
  publicFilesInfiniteQueryOptions,
} from "@/queries/public-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFileSize } from "@/lib/utils";

const iconFor = (extension: string) => {
  const ext = extension.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext))
    return FileImage;
  if (["mp4", "mkv", "mov", "webm", "avi"].includes(ext)) return FileVideo;
  if (["mp3", "flac", "wav", "ogg", "m4a"].includes(ext)) return FileAudio;
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext))
    return FileArchive;
  if (["pdf", "txt", "md", "doc", "docx", "xls", "xlsx", "csv"].includes(ext))
    return FileText;
  return File;
};

const triggerDownload = (url: string, filename: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const FileRow: FC<{ file: IPublicFile }> = ({ file }) => {
  const { t } = useTranslation();
  const [isDownloading, setIsDownloading] = useState(false);
  const Icon = iconFor(file.extension);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const download = await publicDownloadUrl(file.id);
      triggerDownload(download.url, download.name);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors">
      <Icon className="text-muted-foreground h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="text-muted-foreground text-xs">
          {formatFileSize(file.size)} ·{" "}
          {new Date(file.created_at).toLocaleDateString()}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDownload}
        disabled={isDownloading}
        title={t("public_catalog.file.download")}
      >
        <Download className="h-4 w-4" />
        <span className="sr-only">{t("public_catalog.file.download")}</span>
      </Button>
    </div>
  );
};

/**
 * Browsing is one folder at a time: the backend returns folders and files for
 * a single level, so this component only ever renders the current level plus
 * the breadcrumb back to the bucket root.
 */
export const BucketBrowser: FC<{ slug: string; folderId?: string }> = ({
  slug,
  folderId,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(
    publicFilesInfiniteQueryOptions(slug, folderId, deferredSearch),
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-muted-foreground text-sm">
          {t(`errors.${(error as Error).message}`, {
            defaultValue: t("public_catalog.error"),
          })}
        </p>
      </div>
    );
  }

  const firstPage = data?.pages[0];
  const folders = firstPage?.folders ?? [];
  const files = (data?.pages ?? []).flatMap((page) => page.files);
  const breadcrumb = firstPage?.breadcrumb ?? [];
  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
          <Link
            to="/b/$slug"
            params={{ slug }}
            className="hover:text-foreground transition-colors"
          >
            {t("public_catalog.bucket.root")}
          </Link>
          {breadcrumb.map((folder, index) => (
            <span key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5" />
              {index === breadcrumb.length - 1 ? (
                <span className="text-foreground">{folder.name}</span>
              ) : (
                <Link
                  to="/b/$slug/f/{-$folderId}"
                  params={{ slug, folderId: folder.id }}
                  className="hover:text-foreground transition-colors"
                >
                  {folder.name}
                </Link>
              )}
            </span>
          ))}
        </nav>

        <div className="relative w-full sm:w-72">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("public_catalog.bucket.search_placeholder")}
            className="pl-8"
          />
        </div>
      </div>

      {folders.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <Link
              key={folder.id}
              to="/b/$slug/f/{-$folderId}"
              params={{ slug, folderId: folder.id }}
              className="hover:bg-muted/60 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
            >
              <Folder className="text-warning h-5 w-5 shrink-0" />
              <span className="truncate text-sm font-medium">
                {folder.name}
              </span>
            </Link>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">
            {deferredSearch
              ? t("public_catalog.bucket.no_search_results", {
                  query: deferredSearch,
                })
              : t("public_catalog.bucket.empty")}
          </p>
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage
              ? t("common.loading")
              : t("public_catalog.load_more")}
          </Button>
        </div>
      )}

      {deferredSearch && files.length > 0 && (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Badge variant="secondary">
            {t("public_catalog.bucket.search_results", {
              count: files.length,
            })}
          </Badge>
        </div>
      )}
    </div>
  );
};
