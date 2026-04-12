deploy:
	pnpm run build
	pnpm vercel deploy --prod

dev:
	pnpm run dev
