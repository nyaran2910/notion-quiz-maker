.PHONY: deploy dev db-migrate

deploy:
	pnpm run build
	pnpm vercel deploy --prod

dev:
	pnpm run dev

db-migrate:
	pnpm db:migrate
