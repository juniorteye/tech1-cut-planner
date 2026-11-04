# Workshop Cut Planner

Tell the system what pieces you need. It tells you how many boards to buy, exactly where to cut each one, and what the wood will cost.

Built with Next.js, TypeScript and Tailwind CSS.

## Run it

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill it in, then open http://localhost:3000.

Database changes are in `supabase/migrations/`. Apply new ones with `npm run db:migrate`.

## Where the flow lives

| Step | Route |
| --- | --- |
| 1. Set up your workshop | `/setup` |
| 2. Start a new job | `/jobs/new` |
| 3. List the pieces | `/jobs/[jobId]` |
| 4–5. Plan and review | `/jobs/[jobId]/plan` |
| 6. Cut sheet | `/jobs/[jobId]/cut-sheet` |
| 6. Cost summary | `/jobs/[jobId]/cost-summary` |
| 7. Leftover store | `/leftovers` |
| Log in (no public sign-ups) | `/login` |
| Change password, manage the team | `/account` |
| First-time workshop name | `/welcome` |

Shared data shapes are in `src/lib/types.ts` and default settings in `src/lib/defaults.ts`.

## Testing

- `npm test` runs the planner and unit tests.
- `npm run test:client` builds the app and plays a full workshop week in a real browser against the live Supabase project. It creates a throwaway workshop and logins, removes them afterwards, and checks that real workshops were not touched. Screenshots and PDFs land in `e2e/output/`.
