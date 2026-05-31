CREATE DATABASE IF NOT EXISTS assistente_virtual CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE assistente_virtual;

CREATE TABLE IF NOT EXISTS memories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  normalized_question TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX idx_normalized_question ON memories (normalized_question(255));