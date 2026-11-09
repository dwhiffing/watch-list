-- Sign-in is now a shared password plus picking your name, so members are keyed by name instead of email.
ALTER TABLE member RENAME COLUMN email TO login;
UPDATE member SET login = lower(trim(name));
