CREATE TABLE cryptocurrencies (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE
    CHECK (symbol <> '' AND symbol = upper(symbol)),
  name TEXT NOT NULL
    CHECK (trim(name) <> ''),
  updated_at TEXT NOT NULL
    CHECK (updated_at IS strftime('%Y-%m-%dT%H:%M:%fZ', updated_at))
);

CREATE TABLE price_history (
  id INTEGER PRIMARY KEY,
  cryptocurrency_id TEXT NOT NULL REFERENCES cryptocurrencies (id) ON DELETE CASCADE,
  price REAL NOT NULL
    CHECK (typeof(price) = 'real' AND price >= 0),
  fetched_at TEXT NOT NULL
    CHECK (fetched_at IS strftime('%Y-%m-%dT%H:%M:%fZ', fetched_at))
);

CREATE INDEX idx_price_history_cryptocurrency_fetched_at
  ON price_history (cryptocurrency_id, fetched_at);
