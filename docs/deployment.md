# Deployment

## Current production

- Project: `notion-quiz-maker`
- Production URL: `https://notion-quiz-maker.vercel.app`
- GitHub repository: `https://github.com/nyaran2910/notion-quiz-maker`

## Current setup

- Hosting is Vercel.
- The repository is connected to the Vercel project, so pushes to `main` trigger automatic deployments.
- The project is linked locally through `.vercel/project.json`.
- [vercel.json](/Users/nyaran/Workspace/myapp/my-notion-app/vercel.json) forces `framework: "nextjs"` so Vercel does not treat this app as a generic static project.

## Why `vercel.json` exists

This repository uses Next.js 16. Without an explicit framework preset, Vercel created the project as `Other` and tried to use `public` as the output directory. That caused production deploys to fail with:

```text
Error: The Output Directory "public" is empty.
```

The fix is this file:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

## Deploy flow

1. Push changes to `main`.
2. Vercel detects the GitHub push and starts a production deployment automatically.
3. If needed, trigger a manual production deploy from the repo root:

```bash
npx vercel deploy --prod --yes
```

## Useful commands

Check linked project:

```bash
sed -n '1,40p' .vercel/project.json
```

Inspect project settings:

```bash
npx vercel project inspect notion-quiz-maker
```

Reconnect the GitHub repository to the current linked Vercel project:

```bash
npx vercel git connect https://github.com/nyaran2910/notion-quiz-maker.git
```

Inspect a deployment with logs:

```bash
npx vercel inspect <deployment-url-or-id> --logs
```

## Operational notes

- Local `npm run build` succeeds and should be used as the first check before pushing.
- `.env.local` is ignored by Git. Do not commit secrets there.
- The current app stores the user-provided Notion token in an HttpOnly cookie, so this deployment does not depend on Vercel environment variables for the basic flow.
- If Vercel project settings still show `Other`, keep `vercel.json` in the repo. The repo-level config is what makes the build work.
