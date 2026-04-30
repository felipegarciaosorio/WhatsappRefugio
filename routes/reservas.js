const express = require('express');
const router = express.Router();
const db = require('../src/database');
const { isValidDate } = require('../src/utils');

// GET /api/reservas?estado=confirmada&mes=2024-11
router.get('/', (req, res) => {
  const { estado, mes } = req.query;
  res.json(db.getReservas({ estado, mes }));
});

// GET /api/reservas/:id
router.get('/:id', (req, res) => {
  const reserva = db.getReserva(parseInt(req.params.id));
  if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });
  res.json(reserva);
});

// POST /api/reservas — crear reserva (desde admin o desde agente)
router.post('/', (req, res) => {
  const { nombre, cedula, celular, fecha_entrada, fecha_salida, num_personas, notas, wa_number } = req.body;

  if (!nombre || !celular || !fecha_entrada || !fecha_salida) {
    return res.status(400).json({ error: 'Faltan campos requeridos: nombre, celular, fecha_entrada, fecha_salida' });
  }
  if (!isValidDate(fecha_entrada) || !isValidDate(fecha_salida)) {
    return res.status(400).json({ error: 'Fechas inválidas (usar YYYY-MM-DD)' });
  }
  if (fecha_entrada >= fecha_salida) {
    return res.status(400).json({ error: 'fecha_salida debe ser posterior a fecha_entrada' });
  }

  const { disponible, conflictos } = db.verificarDisponibilidad(fecha_entrada, fecha_salida);
  if (!disponible) {
    return res.status(409).json({ error: 'Las fechas seleccionadas no están disponibles', conflictos });
  }

  const resultado = db.crearReserva({ nombre, cedula, celular, fecha_entrada, fecha_salida, num_personas, notas, wa_number });
  const reserva = db.getReserva(resultado.id);
  res.status(201).json(reserva);
});

// PATCH /api/reservas/:id/confirmar
router.patch('/:id/confirmar', (req, res) => {
  const reserva = db.getReserva(parseInt(req.params.id));
  if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });

  const actualizada = db.actualizarReserva(reserva.id, {
    anticipo_pagado: 1,
    estado: 'confirmada',
  });
  res.json(actualizada);
});

// PATCH /api/reservas/:id/cancelar
router.patch('/:id/cancelar', (req, res) => {
  const reserva = db.getReserva(parseInt(req.params.id));
  if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });

  const actualizada = db.actualizarReserva(reserva.id, { estado: 'cancelada' });
  res.json(actualizada);
});

// PATCH /api/reservas/:id/completar
router.patch('/:id/completar', (req, res) => {
  const reserva = db.getReserva(parseInt(req.params.id));
  if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });

  const actualizada = db.actualizarReserva(reserva.id, { estado: 'completada' });
  res.json(actualizada);
});

module.exports = router;
