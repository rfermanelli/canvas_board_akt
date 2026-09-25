-- Schema minimo per la lavagna collaborativa.
-- Applicato automaticamente da MySQL al primo avvio (montato in /docker-entrypoint-initdb.d).

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(120) NOT NULL,
  role          ENUM('user','admin') NOT NULL DEFAULT 'user',
  disabled_at   DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS boards (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id   BIGINT UNSIGNED NOT NULL,
  name       VARCHAR(200) NOT NULL DEFAULT 'Senza titolo',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_boards_owner (owner_id),
  CONSTRAINT fk_boards_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Relazione utente<->board con ruolo. Il proprietario è in boards.owner_id;
-- qui stanno editor e viewer (e, per comodità, si può replicare l'owner).
CREATE TABLE IF NOT EXISTS board_collaborators (
  board_id BIGINT UNSIGNED NOT NULL,
  user_id  BIGINT UNSIGNED NOT NULL,
  role     ENUM('owner','editor','viewer') NOT NULL DEFAULT 'viewer',
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (board_id, user_id),
  CONSTRAINT fk_collab_board FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE,
  CONSTRAINT fk_collab_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stato serializzato della lavagna come documento JSON (MySQL 8 tipo JSON).
CREATE TABLE IF NOT EXISTS board_content (
  board_id   BIGINT UNSIGNED NOT NULL,
  doc        JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (board_id),
  CONSTRAINT fk_content_board FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Riferimenti ai media caricati; nel canvas si salva l'id/url, non il binario.
CREATE TABLE IF NOT EXISTS media_assets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  board_id    BIGINT UNSIGNED NULL,
  uploader_id BIGINT UNSIGNED NOT NULL,
  kind        ENUM('image','video','pdf') NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  mime        VARCHAR(120) NOT NULL,
  size_bytes  BIGINT UNSIGNED NOT NULL,
  url         VARCHAR(512) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_media_board (board_id),
  CONSTRAINT fk_media_uploader FOREIGN KEY (uploader_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_media_board    FOREIGN KEY (board_id)    REFERENCES boards (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Log delle azioni amministrative (chi ha fatto cosa e quando). `admin_id` resta
-- nel log anche se l'admin viene eliminato (ON DELETE SET NULL), per non perdere lo storico.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id    BIGINT UNSIGNED NULL,
  action      VARCHAR(64) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id   BIGINT UNSIGNED NULL,
  details     JSON NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Token per il recupero password ("Password dimenticata?"). In DB si salva solo
-- l'hash SHA-256 del token; il token in chiaro vive solo nel link via email.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prt_token (token_hash),
  KEY idx_prt_user (user_id),
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
