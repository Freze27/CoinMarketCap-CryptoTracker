import { Router } from 'express';
import type { PriceController } from './price.controller';

export function createPriceRouter(controller: PriceController): Router {
  const router = Router();

  router.get('/prices', controller.getLatest);
  router.get('/cryptocurrencies/:id/prices', controller.getHistory);

  return router;
}
