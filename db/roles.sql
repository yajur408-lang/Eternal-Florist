-- Least-privilege roles. Run ONCE as the database owner/admin (never from the app).
-- Replace the passwords with long random values and keep them in your password manager.

-- 1. Migration role: owns the schema. Its URL goes in MIGRATION_DATABASE_URL on YOUR machine only.
create role oohflorist_owner login password 'REPLACE_OWNER_PASSWORD';
grant create, usage on schema public to oohflorist_owner;

-- 2. App role: what the deployed server uses (DATABASE_URL). No DDL, no superuser, no role creation.
create role oohflorist_app login password 'REPLACE_APP_PASSWORD' nosuperuser nocreatedb nocreaterole;
grant usage on schema public to oohflorist_app;
revoke create on schema public from public;

-- After `npm run migrate` (as oohflorist_owner), run these as oohflorist_owner:
grant select on products to oohflorist_app;
grant select, insert, update, delete on users, sessions, password_resets, pow_used to oohflorist_app;
grant select, insert, update on orders, order_items, email_suppressions to oohflorist_app;
grant delete on email_suppressions to oohflorist_app;
grant usage, select on all sequences in schema public to oohflorist_app;
-- Note: the app can never DROP/ALTER tables, change products/prices, or delete orders.
