import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadRouter } from './routes/upload.routes.js';
import { reconciliationRouter } from './routes/reconciliation.routes.js';
import { errorMiddleware } from './middleware/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

app.get(['/api/health', '/health'], (_req, res) => {
  res.json({ ok: true });
});

// Rutas API
app.use('/api/upload', uploadRouter);
app.use('/api', reconciliationRouter);
app.use('/upload', uploadRouter);
app.use('/', reconciliationRouter);

if (!process.env.VERCEL) {
  // Servir frontend en produccion cuando Express corre como servidor tradicional.
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  // Fallback para SPA en produccion.
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Manejo de errores
app.use(errorMiddleware);

export { app };
