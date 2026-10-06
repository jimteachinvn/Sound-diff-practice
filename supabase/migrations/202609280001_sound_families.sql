-- These tables share a project with other apps. Abort before creating anything if
-- this module's namespace is already in use. Review any existing sr_* tables first.
begin;
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and left(c.relname, 3) = 'sr_'
  ) then
    raise exception 'Existing public.sr_* relation found; inspect it before applying this migration';
  end if;
end $$;

-- Catalog rows are reviewed before they can enter the exercise pool.
create table public.sr_phonemes (
  id text primary key,
  ipa text not null unique,
  learner_label text not null
);

create table public.sr_graphemes (
  id text primary key,
  spelling text not null,
  position text not null check (position in ('initial','medial','final','any')),
  unique (spelling, position)
);

create table public.sr_sound_outcomes (
  id text primary key,
  ipa_sequence text not null,
  learner_label text not null
);

create table public.sr_sound_outcome_phonemes (
  outcome_id text not null references public.sr_sound_outcomes(id),
  ordinal smallint not null check (ordinal > 0),
  phoneme_id text not null references public.sr_phonemes(id),
  primary key (outcome_id, ordinal)
);

create table public.sr_sound_patterns (
  id text primary key,
  grapheme_id text not null references public.sr_graphemes(id),
  outcome_id text not null references public.sr_sound_outcomes(id),
  pattern_kind text not null check (pattern_kind in ('rule','tendency','lexical')),
  condition_text text not null default '',
  explanation_en text not null,
  explanation_vi text,
  status text not null default 'draft' check (status in ('draft','reviewed','approved','rejected')),
  unique (grapheme_id, outcome_id, condition_text)
);

create table public.sr_words (
  id bigint generated always as identity primary key,
  spelling text not null,
  lemma text,
  part_of_speech text,
  sense_note text,
  unique (spelling, part_of_speech, sense_note)
);

create table public.sr_pronunciations (
  id bigint generated always as identity primary key,
  word_id bigint not null references public.sr_words(id),
  accent text not null check (accent in ('en-GB','en-US')),
  ipa text not null,
  syllables smallint check (syllables > 0),
  stress_pattern text,
  audio_url text,
  source_name text not null,
  source_url text not null,
  validation_status text not null default 'draft' check (validation_status in ('draft','reviewed','approved','rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid,
  unique (word_id, accent, ipa)
);

create table public.sr_grapheme_occurrences (
  id bigint generated always as identity primary key,
  word_id bigint not null references public.sr_words(id),
  pronunciation_id bigint not null references public.sr_pronunciations(id),
  grapheme_id text not null references public.sr_graphemes(id),
  outcome_id text not null references public.sr_sound_outcomes(id),
  start_index integer not null check (start_index >= 0),
  end_index integer not null check (end_index > start_index),
  status text not null default 'draft' check (status in ('draft','reviewed','approved','rejected')),
  auto_generation_eligible boolean not null default false,
  ambiguity_note text,
  unique (pronunciation_id, grapheme_id, start_index, end_index)
);

create table public.sr_contrasts (
  id text primary key,
  family_id text not null,
  outcome_a_id text not null references public.sr_sound_outcomes(id),
  outcome_b_id text not null references public.sr_sound_outcomes(id),
  check (outcome_a_id <> outcome_b_id)
);

create table public.sr_exercise_items (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  contrast_id text not null references public.sr_contrasts(id),
  generator_version integer not null,
  accent text not null,
  odd_occurrence_id bigint not null references public.sr_grapheme_occurrences(id),
  content_snapshot jsonb not null,
  validation_status text not null check (validation_status in ('approved','rejected')),
  created_at timestamptz not null default now()
);

create table public.sr_exercise_item_options (
  exercise_item_id uuid not null references public.sr_exercise_items(id) on delete cascade,
  ordinal smallint not null check (ordinal between 1 and 4),
  occurrence_id bigint not null references public.sr_grapheme_occurrences(id),
  primary key (exercise_item_id, ordinal),
  unique (exercise_item_id, occurrence_id)
);

create table public.sr_student_attempts (
  id uuid primary key,
  student_id uuid not null references auth.users(id) on delete cascade,
  exercise_item_id uuid references public.sr_exercise_items(id),
  item_snapshot jsonb not null,
  family_id text not null,
  contrast_id text not null,
  mode text not null check (mode in ('odd','sort','listen','exam')),
  selected_id text not null,
  correct_id text not null,
  is_correct boolean not null,
  latency_ms integer not null check (latency_ms >= 0),
  attempted_at timestamptz not null default now()
);
create index sr_student_attempts_recent on public.sr_student_attempts(student_id, attempted_at desc);
create index sr_student_attempts_contrast on public.sr_student_attempts(student_id, contrast_id, attempted_at desc);

create table public.sr_student_pattern_mastery (
  student_id uuid not null references auth.users(id) on delete cascade,
  contrast_id text not null,
  alpha numeric not null default 1 check (alpha > 0),
  beta numeric not null default 1 check (beta > 0),
  exposures integer not null default 0 check (exposures >= 0),
  recent_accuracy boolean[] not null default '{}',
  interval_days integer not null default 0 check (interval_days >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  last_reviewed_at timestamptz,
  primary key (student_id, contrast_id)
);

create table public.sr_review_schedule (
  student_id uuid not null references auth.users(id) on delete cascade,
  contrast_id text not null,
  due_at timestamptz not null,
  interval_days integer not null check (interval_days >= 0),
  primary key (student_id, contrast_id)
);
create index sr_review_schedule_due on public.sr_review_schedule(student_id, due_at);

create table public.sr_confusion_pairs (
  student_id uuid not null references auth.users(id) on delete cascade,
  contrast_id text not null,
  expected_outcome_id text not null,
  selected_outcome_id text not null,
  count integer not null default 0 check (count >= 0),
  last_confused_at timestamptz,
  primary key (student_id, contrast_id, expected_outcome_id, selected_outcome_id),
  check (expected_outcome_id <> selected_outcome_id)
);

create table public.sr_validation_events (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  status text not null,
  reviewer_id uuid,
  note text,
  created_at timestamptz not null default now()
);

-- The source catalog is read-only to application clients. Content publishing
-- is performed by trusted editorial tooling after pronunciation review.
alter table public.sr_phonemes enable row level security;
alter table public.sr_graphemes enable row level security;
alter table public.sr_sound_outcomes enable row level security;
alter table public.sr_sound_outcome_phonemes enable row level security;
alter table public.sr_sound_patterns enable row level security;
alter table public.sr_words enable row level security;
alter table public.sr_pronunciations enable row level security;
alter table public.sr_grapheme_occurrences enable row level security;
alter table public.sr_contrasts enable row level security;
alter table public.sr_exercise_items enable row level security;
alter table public.sr_exercise_item_options enable row level security;
alter table public.sr_student_attempts enable row level security;
alter table public.sr_student_pattern_mastery enable row level security;
alter table public.sr_review_schedule enable row level security;
alter table public.sr_confusion_pairs enable row level security;
alter table public.sr_validation_events enable row level security;

create policy sr_catalog_patterns on public.sr_sound_patterns for select to authenticated using (status = 'approved');
create policy sr_catalog_pronunciations on public.sr_pronunciations for select to authenticated using (validation_status = 'approved');
create policy sr_catalog_occurrences on public.sr_grapheme_occurrences for select to authenticated using (status = 'approved' and auto_generation_eligible);
create policy sr_catalog_words on public.sr_words for select to authenticated using (exists (select 1 from public.sr_grapheme_occurrences o where o.word_id = sr_words.id and o.status = 'approved' and o.auto_generation_eligible));
create policy sr_catalog_outcomes on public.sr_sound_outcomes for select to authenticated using (true);
create policy sr_catalog_phonemes on public.sr_phonemes for select to authenticated using (true);
create policy sr_catalog_outcome_phonemes on public.sr_sound_outcome_phonemes for select to authenticated using (true);
create policy sr_catalog_graphemes on public.sr_graphemes for select to authenticated using (true);
create policy sr_catalog_contrasts on public.sr_contrasts for select to authenticated using (true);
create policy sr_catalog_items on public.sr_exercise_items for select to authenticated using (validation_status = 'approved');
create policy sr_catalog_item_options on public.sr_exercise_item_options for select to authenticated using (exists (select 1 from public.sr_exercise_items i where i.id = exercise_item_id and i.validation_status = 'approved'));

create policy sr_own_attempts on public.sr_student_attempts for all to authenticated using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy sr_own_mastery on public.sr_student_pattern_mastery for all to authenticated using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy sr_own_schedule on public.sr_review_schedule for all to authenticated using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy sr_own_confusions on public.sr_confusion_pairs for all to authenticated using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

commit;
