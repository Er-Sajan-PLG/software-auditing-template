const express = require('express');
const config = require('./config');
const { findOrder } = require('./db');
const { evaluateExpression } = require('./express');

const app = express();
app.use(express.json());

app.get('/orders/:id', async (req, res) => {
  try {
    const rows = await findOrder(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/report/eval', (req, res) => {
  res.json({ result: evaluateExpression(req.body.expr) });
});

app.get('/health', (req, res) => res.json({ ok: true, endpoint: config.endpoint }));

app.listen(3000, () => console.log('listening on 3000'));
