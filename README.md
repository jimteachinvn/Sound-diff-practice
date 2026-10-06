# Sound Diff Practice

A Vietnamese interface for practising British English pronunciation contrasts. The live app contains 776 approved words, 799 highlighted target occurrences across 11 families, and 776 published whole-word MP3s. Students can use SEE, HEAR, SORT, CHOOSE, and RETEST in any order.

## Local checks

Use Node 22 and pnpm. Run `pnpm install`, then `pnpm test`, `pnpm typecheck`, `pnpm audio:check`, `pnpm content:check`, and `pnpm build`. `pnpm dev` starts the local app.

## Online test deployment

`netlify.toml` runs all five checks and publishes the Next.js build. Connect this repository to a Netlify site. The app works with browser-local progress while Supabase is not configured. This is suitable for an initial interface preview; browser-local progress does not transfer between devices.

For recoverable accounts, verify the intended Supabase project before applying `supabase/migrations/202609280001_sound_families.sql`. This migration aborts if any `public.sr_*` relation already exists. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Netlify, enable email sign-in, and allow the deployed origin in Supabase Auth redirect URLs. Never put a service-role or secret key in this client. Test two-account row-level isolation, email-link recovery, and two-device progress merge before inviting students.

Only approved word MP3s are published. Research catalogues and pending audio are kept outside this deployment repository.
