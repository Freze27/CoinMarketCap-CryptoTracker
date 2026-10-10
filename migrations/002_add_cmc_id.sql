ALTER TABLE cryptocurrencies ADD COLUMN cmc_id INTEGER CHECK (cmc_id > 0);

CREATE UNIQUE INDEX idx_cryptocurrencies_cmc_id ON cryptocurrencies (cmc_id);
