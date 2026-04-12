This is a Next.js app for running Notion-backed quizzes with app-side quiz state stored in Postgres.

## Getting Started

Copy `.env.example` to `.env.local` and set `DATABASE_URL`.

Recommended production setup:

- App: Vercel
- Database: Supabase Postgres

This app already uses `pg` directly, so no Supabase SDK is required for the current backend.

Apply migrations:

```bash
npm run db:migrate
```

Example local Postgres URL:

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5432/my_notion_app"
```

Example Supabase URL:

```bash
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres?sslmode=require"
```

Recommended release flow with Supabase:

1. Create a Supabase project.
2. Copy the Postgres connection string into `DATABASE_URL`.
3. Run `npm run db:migrate` against that database.
4. Set the same `DATABASE_URL` and `NOTION_TOKEN_ENCRYPTION_KEY` in your deployment environment.
5. Deploy the app.

Notes:

- Use a strong `NOTION_TOKEN_ENCRYPTION_KEY` in production.
- The current app stores quiz state in Postgres and keeps using the user Notion session for live access.
- If you later want auth, storage, or row-level security, Supabase can still be extended from this base.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
