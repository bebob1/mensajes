// server.js — Mensajes Fraudulentos
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const port = process.env.PORT || 3001;

// ── Configuración DB ──────────────────────────────────────
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dashboard'
};

// ── Middleware ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Página principal ──────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── API: Consulta de mensajes con filtros ─────────────────
//
//  Query params:
//    q          → búsqueda libre (message_body o sender)
//    sender     → filtrar por número/remitente exacto (contiene)
//    content    → filtrar por contenido (contiene)
//    dateFrom   → fecha inicio  (YYYY-MM-DD)
//    dateTo     → fecha fin     (YYYY-MM-DD)
//    minScore   → score mínimo  (0-100)
//    maxScore   → score máximo  (0-100)
//    page       → página (default 1)
//    limit      → registros por página (default 50, max 200)
//    sortBy     → campo de orden (id|received_at|detection_score)
//    sortDir    → dirección (asc|desc)
//
app.get('/api/mensajes', async (req, res) => {
  let connection;
  try {
    const {
      q = '',
      sender = '',
      content = '',
      dateFrom = '',
      dateTo = '',
      minScore = '',
      maxScore = '',
      page = 1,
      limit = 50,
      sortBy = 'received_at',
      sortDir = 'desc'
    } = req.query;

    // Validaciones básicas
    const safeLimit = Math.min(parseInt(limit) || 50, 200);
    const safePage  = Math.max(parseInt(page) || 1, 1);
    const offset    = (safePage - 1) * safeLimit;

    const allowedSort = ['id', 'received_at', 'detection_score'];
    const safeSort    = allowedSort.includes(sortBy) ? sortBy : 'received_at';
    const safeDir     = sortDir === 'asc' ? 'ASC' : 'DESC';

    // Construcción WHERE dinámica
    const conditions = [];
    const params     = [];

    if (q.trim()) {
      conditions.push(`(m.message_body LIKE ? OR pn.number LIKE ?)`);
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }
    if (content.trim()) {
      conditions.push(`m.message_body LIKE ?`);
      params.push(`%${content.trim()}%`);
    }
    if (sender.trim()) {
      conditions.push(`pn.number LIKE ?`);
      params.push(`%${sender.trim()}%`);
    }
    if (dateFrom.trim()) {
      conditions.push(`DATE(m.received_at) >= ?`);
      params.push(dateFrom.trim());
    }
    if (dateTo.trim()) {
      conditions.push(`DATE(m.received_at) <= ?`);
      params.push(dateTo.trim());
    }
    if (minScore !== '') {
      conditions.push(`m.detection_score >= ?`);
      params.push(parseFloat(minScore));
    }
    if (maxScore !== '') {
      conditions.push(`m.detection_score <= ?`);
      params.push(parseFloat(maxScore));
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const baseQuery = `
      FROM messages m
      LEFT JOIN phone_number_message pnm ON m.id = pnm.message_id
      LEFT JOIN phone_number pn ON pnm.phone_number_id = pn.id
      ${whereClause}
    `;

    connection = await mysql.createConnection(dbConfig);

    // Conteo total para paginación
    // Usamos query() en lugar de execute() para evitar conflicto de tipos
    // con parámetros string + LIMIT/OFFSET integer en prepared statements
    const [countRows] = await connection.query(
      `SELECT COUNT(DISTINCT m.id) AS total ${baseQuery}`,
      params
    );
    const total = countRows[0].total;

    // Datos paginados — LIMIT y OFFSET se interpolan directamente
    // (son integers validados, sin riesgo de inyección)
    const dataQuery = `
      SELECT
        m.id,
        m.message_body,
        m.detection_score,
        m.received_at,
        GROUP_CONCAT(DISTINCT pn.number ORDER BY pn.number SEPARATOR ', ') AS sender
      ${baseQuery}
      GROUP BY m.id, m.message_body, m.detection_score, m.received_at
      ORDER BY ${safeSort === 'sender' ? 'm.received_at' : 'm.' + safeSort} ${safeDir}
      LIMIT ${safeLimit} OFFSET ${offset}
    `;

    const [rows] = await connection.query(dataQuery, params);
    await connection.end();

    res.json({
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
      data: rows.map(r => ({
        id:             r.id,
        message_body:   r.message_body,
        detection_score: r.detection_score !== null ? parseFloat(r.detection_score) : null,
        received_at:    r.received_at,
        sender:         r.sender || 'Desconocido'
      }))
    });

  } catch (error) {
    console.error('[/api/mensajes] Error:', error.message);
    if (connection) await connection.end().catch(() => {});
    res.status(500).json({ error: 'Error al consultar los mensajes', details: error.message });
  }
});

// ── API: Remitentes únicos para autocomplete ──────────────
app.get('/api/remitentes', async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(`
      SELECT DISTINCT pn.number
      FROM phone_number pn
      JOIN phone_number_message pnm ON pn.id = pnm.phone_number_id
      WHERE pn.number IS NOT NULL AND pn.number != ''
      ORDER BY pn.number
      LIMIT 500
    `);
    await connection.end();
    res.json(rows.map(r => r.number));
  } catch (error) {
    if (connection) await connection.end().catch(() => {});
    res.status(500).json({ error: 'Error al obtener remitentes' });
  }
});

// ── API: Rangos de fecha y score para los sliders ─────────
app.get('/api/meta', async (req, res) => {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(`
      SELECT
        MIN(DATE(received_at)) AS minDate,
        MAX(DATE(received_at)) AS maxDate,
        MIN(detection_score)   AS minScore,
        MAX(detection_score)   AS maxScore,
        COUNT(*)               AS total
      FROM messages
    `);
    await connection.end();
    res.json(rows[0]);
  } catch (error) {
    if (connection) await connection.end().catch(() => {});
    res.status(500).json({ error: 'Error al obtener metadatos' });
  }
});

// ── Arranque ──────────────────────────────────────────────
app.listen(port, async () => {
  console.log(`\n🚀 Mensajes app corriendo en http://localhost:${port}`);
  console.log(`   Base de datos: ${dbConfig.host}/${dbConfig.database}\n`);

  // Verificación rápida de conexión
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [r] = await conn.execute('SELECT COUNT(*) AS total FROM messages');
    console.log(`✓ BD conectada — ${r[0].total} mensajes en total`);
    await conn.end();
  } catch (e) {
    console.error('✗ Error al conectar con la BD:', e.message);
    console.error('  Verifica tu archivo .env');
  }
});
