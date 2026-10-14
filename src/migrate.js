'use strict';
// Schema and product seed. In production this runs with the OWNER role (MIGRATION_DATABASE_URL),
// never with the app role, which has no DDL rights (see db/roles.sql).
const fs = require('fs');
const path = require('path');
const db = require('./db');

const SCHEMA = `
create table if not exists users (
  id bigserial primary key,
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null default 'customer' check (role in ('customer','admin')),
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  password_changed_at timestamptz not null default now()
);
create table if not exists sessions (
  id_hash text primary key,
  user_id bigint references users(id) on delete cascade,
  csrf text not null,
  age_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create table if not exists password_resets (
  token_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);
create table if not exists products (
  id text primary key,
  name text not null,
  description text not null default '',
  price_npr integer check (price_npr is null or price_npr > 0),
  image text not null,
  image_alt text not null,
  source_note text not null,
  sort integer not null default 0,
  active boolean not null default true
);
create table if not exists orders (
  id bigserial primary key,
  public_id text not null unique,
  transaction_uuid text not null unique,
  user_id bigint references users(id) on delete set null,
  amount integer not null check (amount > 0),
  status text not null default 'PENDING' check (status in ('PENDING','PAID','FAILED')),
  fulfillment text not null default 'NEW' check (fulfillment in ('NEW','PREPARING','OUT_FOR_DELIVERY','DELIVERED','CANCELLED')),
  customer_name text not null,
  phone text not null,
  email text not null,
  address text not null,
  note text not null default '',
  esewa_ref text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists orders_status_created on orders(status, created_at);
create table if not exists order_items (
  order_id bigint not null references orders(id) on delete cascade,
  product_id text not null references products(id),
  name text not null,
  unit_price integer not null,
  qty integer not null check (qty between 1 and 20)
);
create table if not exists email_suppressions (
  email text primary key,
  created_at timestamptz not null default now()
);
create table if not exists pow_used (
  id text primary key,
  expires_at timestamptz not null
)
`;

async function migrate() {
  for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
  const file = path.join(__dirname, '..', 'content', 'products.json');
  const products = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [i, p] of products.entries()) {
    await db.query(
      `insert into products (id, name, description, price_npr, image, image_alt, source_note, sort, active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,true)
       on conflict (id) do update set name=excluded.name, description=excluded.description, price_npr=excluded.price_npr,
         image=excluded.image, image_alt=excluded.image_alt, source_note=excluded.source_note, sort=excluded.sort`,
      [p.id, p.name, p.description, p.price_npr, p.image, p.image_alt, p.source_note, i]
    );
  }
}

if (require.main === module) {
  (async () => {
    await db.connect({ databaseUrl: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL });
    await migrate();
    console.log('Migration complete');
    await db.close();
  })().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { migrate };
