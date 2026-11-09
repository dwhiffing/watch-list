-- Shared cache of TMDB list responses (discover pages, search, genre and provider lists), so repeat requests skip TMDB.
CREATE TABLE tmdb_cache (
  key TEXT PRIMARY KEY,                   -- request path and sorted query string
  body TEXT NOT NULL,                     -- JSON response
  expires_at TEXT NOT NULL
);
CREATE INDEX tmdb_cache_expires ON tmdb_cache (expires_at);
