# Supabase CLI setup

Set this up once per developer machine. After that, applying a migration is a
single `npm run db:push`.

## 1. Install the CLI

The repo expects `supabase` on your `PATH`.

```bash
# macOS (Apple Silicon)
mkdir -p ~/.local/bin
curl -L https://github.com/supabase/cli/releases/latest/download/supabase_darwin_arm64.tar.gz \
  | tar -xz -C ~/.local/bin
chmod +x ~/.local/bin/supabase
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Other platforms: https://supabase.com/docs/guides/local-development/cli/getting-started
```

## 2. Generate a personal access token

1. Open https://supabase.com/dashboard/account/tokens
2. **Generate new token** → name it (e.g. `cli-laptop`) → **Generate**
3. Copy the token (`sbp_...`).

## 3. Log in & link the project

```bash
# Stores the token under ~/.supabase/access-token (NOT in the repo)
supabase login --token sbp_xxxxxxxxxxxxxxxxxxxx

# Link to this project (project_id from supabase/config.toml)
npm run db:link
```

The link writes `supabase/.temp/` (gitignored). It will prompt once for the
**database password** — you can find it under
Project → Settings → Database → Connection string. It's stored encrypted in
your OS keychain after the first prompt.

## 4. Day-to-day

```bash
npm run db:diff    # show pending local migrations vs the remote DB
npm run db:push    # apply local migrations to the remote DB
npm run db:pull    # pull schema changes made via the dashboard back into a migration file
npm run db:reset   # ⚠️ WIPE the linked DB and re-apply every migration
```

## Token safety

- The token (`sbp_...`) lives in `~/.supabase/access-token` and is **never**
  committed.
- `.env` (with `VITE_SUPABASE_*` keys) is already gitignored — only
  `.env.example` is checked in.
- `supabase/.temp/` (link metadata) is gitignored.
- If a token is ever leaked, revoke it at
  https://supabase.com/dashboard/account/tokens and generate a new one.
