/**
 * SQLite 版本遷移（以 PRAGMA user_version 記錄目前版本）。
 * 陣列索引 i 代表「升級到版本 i + 1」，只能往後新增。
 */
export const sqliteMigrations: string[] = [
  // v1：初始結構
  `
  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY NOT NULL,
    platform TEXT NOT NULL DEFAULT 'threads',
    platform_post_id TEXT,
    fbid TEXT,
    original_url TEXT,
    canonical_url TEXT,
    author TEXT,
    title TEXT,
    content TEXT,
    thumbnail_url TEXT,
    saved_at TEXT,
    imported_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL CHECK (status IN ('normal', 'missing_url')),
    source TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_bookmarks_post ON bookmarks(platform, platform_post_id);
  CREATE UNIQUE INDEX IF NOT EXISTS ux_bookmarks_fbid ON bookmarks(fbid);
  CREATE INDEX IF NOT EXISTS ix_bookmarks_saved_at ON bookmarks(saved_at);
  CREATE INDEX IF NOT EXISTS ix_bookmarks_imported_at ON bookmarks(imported_at);

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_folders_sort ON folders(sort_order);

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_tags_name ON tags(name);

  CREATE TABLE IF NOT EXISTS bookmark_folders (
    bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (bookmark_id, folder_id)
  );
  CREATE INDEX IF NOT EXISTS ix_bf_folder ON bookmark_folders(folder_id);

  CREATE TABLE IF NOT EXISTS bookmark_tags (
    bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (bookmark_id, tag_id)
  );
  CREATE INDEX IF NOT EXISTS ix_bt_tag ON bookmark_tags(tag_id);

  CREATE TABLE IF NOT EXISTS import_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    source_type TEXT NOT NULL,
    file_name TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    counts_json TEXT NOT NULL,
    repaired_text_count INTEGER NOT NULL DEFAULT 0,
    missing_url_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_import_jobs_started ON import_jobs(started_at);
  `,
  // v2：自動分類規則
  `
  CREATE TABLE IF NOT EXISTS auto_rules (
    id TEXT PRIMARY KEY NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('folder', 'tag')),
    target_name TEXT NOT NULL,
    keywords_json TEXT NOT NULL,
    match_mode TEXT NOT NULL DEFAULT 'any' CHECK (match_mode IN ('any', 'all')),
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_auto_rules_sort ON auto_rules(sort_order);
  `,
];

export const SQLITE_VERSION = sqliteMigrations.length;
