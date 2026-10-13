import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './openapi';

export function createDocsRouter(): Router {
  const router = Router();

  router.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  router.use('/docs', swaggerUi.serve);
  router.get('/docs', swaggerUi.setup(openApiDocument));

  return router;
}
