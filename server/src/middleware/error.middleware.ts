import type { Request, Response, NextFunction } from 'express';

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('Error:', err.message);
  res.status(500).json({
    error: err.message || 'Error interno del servidor',
  });
}
