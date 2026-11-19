-- Bancos do Evolution Go (dois DSNs separados: auth/licença e dados).
-- Roda só na primeira inicialização do volume pgdata (initdb.d).
-- O banco do app (wajato_db) é criado automaticamente pelo POSTGRES_DB.
CREATE DATABASE evogo_auth;
CREATE DATABASE evogo_users;
