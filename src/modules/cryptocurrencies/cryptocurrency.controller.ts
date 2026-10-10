import type { Request, Response } from 'express';
import type { CryptocurrencyService } from './cryptocurrency.service';
import {
  parseCreateCryptocurrencyBody,
  parseCryptocurrencyId,
  parseUpdateCryptocurrencyBody,
} from './cryptocurrency.validation';

export class CryptocurrencyController {
  constructor(private readonly service: CryptocurrencyService) {}

  getAll = async (_req: Request, res: Response): Promise<void> => {
    const cryptocurrencies = await this.service.getAll();

    res.json({ data: cryptocurrencies });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const id = parseCryptocurrencyId(req.params.id);
    const cryptocurrency = await this.service.getById(id);

    res.json({ data: cryptocurrency });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const data = parseCreateCryptocurrencyBody(req.body);
    const cryptocurrency = await this.service.create(data);

    res.status(201).json({ data: cryptocurrency });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const id = parseCryptocurrencyId(req.params.id);
    const data = parseUpdateCryptocurrencyBody(req.body);
    const cryptocurrency = await this.service.update(id, data);

    res.json({ data: cryptocurrency });
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    const id = parseCryptocurrencyId(req.params.id);
    await this.service.delete(id);

    res.status(204).end();
  };
}
