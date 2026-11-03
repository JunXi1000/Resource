// Anonymous catalog projections. These mirror internal/models/public_catalog.go
// field for field: the backend never sends anything else to a visitor, so the
// UI can render the whole public site from these types alone.

export interface IPage<T> {
  data: Array<T>;
  next_cursor?: string;
}

export interface IPublicBucket {
  id: string;
  slug: string | null;
  name: string;
  description: string;
  category?: string;
  tags: Array<string>;
  file_count: number;
  total_size: number;
  published_at?: string;
}

export interface IPublicFolder {
  id: string;
  name: string;
}

export interface IPublicFile {
  id: string;
  name: string;
  extension: string;
  size: number;
  folder_id?: string;
  created_at: string;
}

export interface IPublicFileListing {
  bucket: IPublicBucket;
  folder?: IPublicFolder;
  breadcrumb: Array<IPublicFolder>;
  folders: Array<IPublicFolder>;
  files: Array<IPublicFile>;
  next_cursor?: string;
}

export interface IPublicCategory {
  category: string;
  bucket_count: number;
}

export interface IPublicDownload {
  id: string;
  name: string;
  size: number;
  url: string;
}

export type PublicBucketSort = "recent" | "name" | "popular";

export interface IPublicBucketQuery {
  q?: string;
  category?: string;
  tag?: string;
  sort?: PublicBucketSort;
}
