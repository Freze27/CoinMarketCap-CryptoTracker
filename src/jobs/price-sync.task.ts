import type { PriceService } from '../modules/prices/price.service';
import type { ScheduledTask } from './task-scheduler';

export function createPriceSyncTask(priceService: PriceService, intervalMs: number): ScheduledTask {
  return {
    name: 'price-sync',
    intervalMs,
    run: async () => ({ savedPrices: await priceService.refreshPrices() }),
  };
}
