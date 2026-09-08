-- No migrations, no down files, no seed for a rollback path.
CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_email VARCHAR(255),
  total_cents INT,
  created_at DATETIME DEFAULT NOW()
);
