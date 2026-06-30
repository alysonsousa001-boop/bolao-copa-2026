-- ==========================================================
-- Bolão da Copa 2026 — Schema Supabase
-- Rode este script inteiro no SQL Editor do seu projeto Supabase
-- ==========================================================

create extension if not exists "pgcrypto";

-- Partidas cadastradas pelo organizador
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  phase text not null,
  team1 text not null,
  team2 text not null,
  date text,
  time text,
  created_at timestamptz default now()
);

-- Resultado real de cada partida (1 por jogo)
create table if not exists results (
  match_id uuid primary key references matches(id) on delete cascade,
  s1 int not null,
  s2 int not null,
  updated_at timestamptz default now()
);

-- Lista de participantes do bolão
create table if not exists participants (
  name text primary key,
  created_at timestamptz default now()
);

-- Palpites: 1 por participante + partida
create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  participant text not null references participants(name) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  s1 int not null,
  s2 int not null,
  updated_at timestamptz default now(),
  unique (participant, match_id)
);

-- ==========================================================
-- Row Level Security
-- App sem login (uso entre amigos/equipe confiável). Liberamos
-- leitura e escrita públicas via chave anon. NÃO use isso para
-- algo exposto publicamente na internet sem mais controle.
-- ==========================================================

alter table matches enable row level security;
alter table results enable row level security;
alter table participants enable row level security;
alter table predictions enable row level security;

create policy "public read matches" on matches for select using (true);
create policy "public write matches" on matches for insert with check (true);
create policy "public update matches" on matches for update using (true);
create policy "public delete matches" on matches for delete using (true);

create policy "public read results" on results for select using (true);
create policy "public write results" on results for insert with check (true);
create policy "public update results" on results for update using (true);
create policy "public delete results" on results for delete using (true);

create policy "public read participants" on participants for select using (true);
create policy "public write participants" on participants for insert with check (true);
create policy "public delete participants" on participants for delete using (true);

create policy "public read predictions" on predictions for select using (true);
create policy "public write predictions" on predictions for insert with check (true);
create policy "public update predictions" on predictions for update using (true);
create policy "public delete predictions" on predictions for delete using (true);

-- ==========================================================
-- Realtime: habilita atualização ao vivo no app
-- ==========================================================
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table results;
alter publication supabase_realtime add table predictions;
alter publication supabase_realtime add table participants;
