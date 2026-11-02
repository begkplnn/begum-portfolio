-- Paste this into Supabase → SQL Editor → Run.
-- It creates the notes table. Visitors can read and add notes, but not edit or delete them.
-- You can delete any note yourself from Supabase → Table Editor → notes.

create table notes (
  id bigint generated always as identity primary key,
  x int not null check (x between -1 and 400),
  y int not null check (y between -1 and 400),
  name text not null check (char_length(name) between 1 and 20),
  text text not null check (char_length(text) between 1 and 140),
  created_at timestamptz not null default now()
);

alter table notes enable row level security;

create policy "anyone can read notes" on notes for select using (true);
create policy "anyone can add notes" on notes for insert with check (true);
