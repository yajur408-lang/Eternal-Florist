-- Least-privilege setup. Run ONCE in the Supabase SQL Editor (it runs as the "postgres" admin role).
-- Replace the password with a long random value and keep it in your password manager.
--
-- Tables live in schema "shop", NOT "public", so Supabase's auto-generated Data API
-- (reachable with the public anon key) cannot see them. Do not add "shop" to
-- Dashboard > Settings > API > Exposed schemas.

-- 1. Schema, owned by postgres. Migrations (`npm run migrate`) run as postgres from YOUR machine only.
create schema if not exists shop;
revoke all on schema shop from public, anon, authenticated;

-- 2. App role: what the deployed server uses (DATABASE_URL). No DDL, no superuser, no role creation.
create role oohflorist_app login password 'REPLACE_APP_PASSWORD' nosuperuser nocreatedb nocreaterole noinherit;
grant usage on schema shop to oohflorist_app;

-- 3. After `npm run migrate` has created the tables, run these grants:
grant select on shop.products to oohflorist_app;
grant select, insert, update, delete on shop.users, shop.sessions, shop.password_resets, shop.pow_used to oohflorist_app;
grant select, insert, update on shop.orders, shop.order_items, shop.email_suppressions to oohflorist_app;
grant delete on shop.email_suppressions to oohflorist_app;
grant usage, select on all sequences in schema shop to oohflorist_app;
-- The app can never DROP/ALTER tables, change products or prices, or delete orders.

-- Connection string for the app (Session pooler, port 5432; the user name includes the project ref):
--   postgresql://oohflorist_app.czfsedinknylomtihagl:REPLACE_APP_PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres
