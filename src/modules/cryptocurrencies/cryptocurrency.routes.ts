import { Router } from 'express';
import type { CryptocurrencyController } from './cryptocurrency.controller';

export function createCryptocurrencyRouter(controller: CryptocurrencyController): Router {
  const router = Router();

  router.get('/cryptocurrencies', controller.getAll);
  router.post('/cryptocurrencies', controller.create);
  router.get('/cryptocurrencies/:id', controller.getById);
  router.patch('/cryptocurrencies/:id', controller.update);
  router.delete('/cryptocurrencies/:id', controller.delete);

  return router;
}
