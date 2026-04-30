const express = require('express');
const router = express.Router();
const db = require('../src/database');

// ── Auth ───────────────────────────────────────────────────────────────────────

function generarToken(user, pass) {
  return Buffer.from(`${user}:${pass}`).toString('base64');
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const token = auth.slice(7);
  const esperado = generarToken(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS || 'admin');
  if (token !== esperado) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  next();
}

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { user, pass } = req.body;
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'admin';

  if (user !== adminUser || pass !== adminPass) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  const token = generarToken(adminUser, adminPass);
  res.json({ token });
});

// GET /api/admin/metricas?year=2024&month=11
router.get('/metricas', requireAuth, (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const metricas = db.getMetricasMes(year, month);
  res.json(metricas);
});

module.exports = router;
module.exports.requireAuth = requireAuth;
