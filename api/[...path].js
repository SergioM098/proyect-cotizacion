module.exports = async function handler(req, res) {
  try {
    process.env.VERCEL = process.env.VERCEL || '1';
    const mod = await import('./_server/index.js');
    return mod.app(req, res);
  } catch (error) {
    console.error('API function failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno en la API',
    });
  }
};
