-- Ratings are looked up by title (history, title page); without this every lookup scans the whole table.
CREATE INDEX rating_title ON rating (title_id);
