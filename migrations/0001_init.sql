-- People who use the app. Created on first sign-in through Cloudflare Access.
CREATE TABLE member (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cached TMDB titles (movies and TV shows).
CREATE TABLE title (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  name TEXT NOT NULL,
  year INTEGER,
  runtime INTEGER,
  overview TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  genres TEXT NOT NULL DEFAULT '[]',      -- JSON array of genre names
  keywords TEXT NOT NULL DEFAULT '[]',    -- JSON array of keyword names
  vote_average REAL,
  vote_count INTEGER,
  popularity REAL,
  seasons TEXT,                           -- TV only: JSON [{"season": 1, "episodes": 10}]
  details_at TEXT,                        -- when full details (runtime, credits) were last fetched
  refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tmdb_id, type)
);

CREATE TABLE person (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  profile_path TEXT
);

CREATE TABLE credit (
  title_id INTEGER NOT NULL REFERENCES title(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('cast', 'director', 'writer', 'creator')),
  billing_order INTEGER NOT NULL DEFAULT 0,
  character TEXT,
  PRIMARY KEY (title_id, person_id, role)
);

-- One swipe per person per title. "want" puts the title on the shared watchlist.
CREATE TABLE swipe (
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  title_id INTEGER NOT NULL REFERENCES title(id) ON DELETE CASCADE,
  choice TEXT NOT NULL CHECK (choice IN ('want', 'pass', 'seen')),
  source TEXT NOT NULL DEFAULT 'deck' CHECK (source IN ('deck', 'manual')),
  swiped_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, title_id)
);
CREATE INDEX swipe_title ON swipe (title_id, choice);

-- Thumbs up (1) or down (-1), one per person per title.
CREATE TABLE rating (
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  title_id INTEGER NOT NULL REFERENCES title(id) ON DELETE CASCADE,
  thumb INTEGER NOT NULL CHECK (thumb IN (-1, 1)),
  note TEXT,
  rated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, title_id)
);

-- One row per viewing. For TV, season/episode is the episode watched.
CREATE TABLE watch_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id INTEGER NOT NULL REFERENCES title(id) ON DELETE CASCADE,
  member_ids TEXT NOT NULL,               -- JSON array of member ids who watched
  watched_on TEXT,                        -- YYYY-MM-DD, null when unknown ("seen it before")
  season INTEGER,
  episode INTEGER,
  is_rewatch INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES member(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX watch_event_title ON watch_event (title_id);

-- Streaming services. Toggle "enabled" to change which services you have.
-- provider_ids holds TMDB watch-provider ids (some services have more than one).
CREATE TABLE streaming_service (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  provider_ids TEXT NOT NULL,             -- JSON array of TMDB provider ids
  logo_path TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Logos are filled in from TMDB the first time Settings loads.
INSERT INTO streaming_service (name, provider_ids, sort_order) VALUES
  ('Netflix', '[8]', 1),
  ('Prime Video', '[9,119]', 2),
  ('Disney+', '[337]', 3);

-- Where each title streams in the configured region (from TMDB / JustWatch).
CREATE TABLE title_availability (
  title_id INTEGER NOT NULL REFERENCES title(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL,
  region TEXT NOT NULL,
  PRIMARY KEY (title_id, provider_id, region)
);
CREATE TABLE availability_check (
  title_id INTEGER NOT NULL REFERENCES title(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (title_id, region)
);

-- Where each person is in the swipe deck, per filter combination.
CREATE TABLE deck_cursor (
  member_id INTEGER NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  deck_key TEXT NOT NULL,
  page INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (member_id, deck_key)
);
