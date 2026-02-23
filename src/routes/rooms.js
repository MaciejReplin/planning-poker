const { Router } = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { SCALES, getScale } = require('../scales');

const router = Router();

function generateSlug() {
  return crypto.randomBytes(4).toString('hex');
}

// Create room
router.post('/', (req, res) => {
  const { name, scaleType, customScale } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Room name is required' });
  }
  const id = generateSlug();
  const type = SCALES[scaleType] ? scaleType : (scaleType === 'custom' ? 'custom' : 'fibonacci');
  const custom = type === 'custom' && customScale
    ? JSON.stringify(customScale.split(',').map(s => s.trim()).filter(Boolean))
    : null;

  const db = getDb();
  db.prepare('INSERT INTO rooms (id, name, scale_type, custom_scale) VALUES (?, ?, ?, ?)')
    .run(id, name.trim(), type, custom);

  const scale = getScale(type, custom);
  res.status(201).json({ id, name: name.trim(), scale, scaleType: type });
});

// Get room
router.get('/:id', (req, res) => {
  const db = getDb();
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const scale = getScale(room.scale_type, room.custom_scale);
  res.json({ id: room.id, name: room.name, scale, scaleType: room.scale_type });
});

module.exports = router;
