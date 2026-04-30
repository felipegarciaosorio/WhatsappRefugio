const express = require('express');
const router = express.Router();
const db = require('../src/database');
const { diasDelMes, isValidDate } = require('../src/utils');

// GET /api/disponibilidad?year=2024&month=11
router.get('/', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;

  if (month < 1 || month > 12) return res.status(400).json({ error: 'Mes inválido' });

  const dias = diasDelMes(year, month);
  const resultado = {};
  for (const dia of dias) {
    resultado[dia] = db.getEstadoDia(dia);
  }
  res.json(resultado);
});

// GET /api/disponibilidad/verificar?entrada=YYYY-MM-DD&salida=YYYY-MM-DD&personas=2
router.get('/verificar', (req, res) => {
  const { entrada, salida, personas } = req.query;

  if (!entrada || !salida) {
    return res.status(400).json({ error: 'Se requieren los parámetros entrada y salida' });
  }
  if (!isValidDate(entrada) || !isValidDate(salida)) {
    return res.status(400).json({ error: 'Formato de fecha inválido (usar YYYY-MM-DD)' });
  }
  if (entrada >= salida) {
    return res.status(400).json({ error: 'La fecha de salida debe ser posterior a la de entrada' });
  }

  const { disponible, conflictos } = db.verificarDisponibilidad(entrada, salida);
  const precio = disponible ? db.calcularPrecio(entrada, salida, parseInt(personas) || 2) : null;

  res.json({
    disponible,
    mensaje: disponible
      ? `¡Disponible! ${precio.noches} noche(s) × $${precio.tarifaNoche.toLocaleString('es-CO')}`
      : 'No hay disponibilidad para esas fechas',
    precio,
    conflictos: disponible ? undefined : conflictos.map(c => c.dia),
  });
});

module.exports = router;
