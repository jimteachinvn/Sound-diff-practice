# Sound Diff Practice

A Vietnamese interface for practising British English pronunciation contrasts. The live app contains 776 approved words, 799 highlighted target occurrences across 11 families, and 776 published whole-word MP3s. Students can use SEE, HEAR, SORT, CHOOSE, and RETEST in any order.

## Local checks

Use Node 22 and pnpm. Run `pnpm install`, then `pnpm test`, `pnpm typecheck`, `pnpm audio:check`, `pnpm content:check`, and `pnpm build`. `pnpm dev` starts the local app.

## Online test deployment

`netlify.toml` runs all five checks and publishes the Next.js build. Connect this repository to a Netlify site. The app works with browser-local progress while Supabase is not configured. This is suitable for an initial interface preview; browser-local progress does not transfer between devices.

For recoverable accounts, verify the intended Supabase project before applying `supabase/migrations/202609280001_sound_families.sql`. This migration aborts if any `public.sr_*` relation already exists. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Netlify, enable email sign-in, and allow the deployed origin in Supabase Auth redirect URLs. Never put a service-role or secret key in this client. Test two-account row-level isolation, email-link recovery, and two-device progress merge before inviting students.

Only approved word MP3s are published. Research catalogues and pending audio are kept outside this deployment repository.

## Family accounts and dashboards

Cloud mode supports one family phone identifier and PIN, separate student profiles, parent progress charts, and a separately authorized administrator for manual PIN resets and welcome QR links. Phone ownership is unverified; there is no SMS service. Recovery uses manual Zalo support.

Configure the variables in `.env.example` through the hosting provider. Keep `SUPABASE_SECRET_KEY` and `FAMILY_PIN_PEPPER` private; preserve the pepper across deployments. Enable `NEXT_PUBLIC_FAMILY_BACKEND=supabase` and `FAMILY_CLOUD_ENABLED=1` only with the family schema and both follow-ups applied. Do not run a blind migration push: the older 20260928 schema models a different account structure.

The weekly target remains two study days with three distinct answers per day. Independent mastery requires different correct questions at least 20 hours apart; listening and sorting alone cannot earn mastery.
