import { app } from './app.js';

const PORT = process.env.PORT || 3001;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Servidor de conciliacion corriendo en http://localhost:${PORT}`);
  });
}

export { app };
