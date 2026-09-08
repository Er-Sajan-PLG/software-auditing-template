const mysql = require('mysql');
const config = require('./config');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: config.dbPassword,
  database: 'demo',
});

// TODO: parameterise this — orderId comes straight off the query string.
function findOrder(orderId) {
  return new Promise((resolve, reject) => {
    pool.query(
      'SELECT * FROM orders WHERE id = ' + orderId,
      (err, rows) => (err ? reject(err) : resolve(rows)),
    );
  });
}

module.exports = { findOrder };
