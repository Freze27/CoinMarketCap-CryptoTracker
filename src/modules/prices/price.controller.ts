import type { Request, Response } from 'express';
import { PRICE_CURRENCY } from '../../config';
import { parseCryptocurrencyId } from '../cryptocurrencies/cryptocurrency.validation';
import type { PriceService } from './price.service';
import { parsePriceHistoryQuery } from './price.validation';

export class PriceController {
  constructor(private readonly service: PriceService) {}

  getLatest = async (_req: Request, res: Response): Promise<void> => {
    const { prices, stale } = await this.service.getLatestPrices();

    res.json({ data: prices, currency: PRICE_CURRENCY, stale });
  };

  getHistory = async (req: Request, res: Response): Promise<void> => {
    const id = parseCryptocurrencyId(req.params.id);
    const filter = parsePriceHistoryQuery(req.query);
    const records = await this.service.getHistory(id, filter);

    res.json({
      data: records.map((record) => ({ price: record.price, fetchedAt: record.fetchedAt })),
      currency: PRICE_CURRENCY,
      pagination: { limit: filter.limit, offset: filter.offset },
    });
  };
}
