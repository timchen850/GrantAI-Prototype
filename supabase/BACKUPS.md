# Database backups

Supabase's free plan doesn't back up the database. `.github/workflows/supabase-backup.yml` does it
instead: every night at 07:41 UTC it dumps the roles, schema and data with the Supabase CLI, encrypts
the dump with AES-256, and keeps it for 14 days under **Actions > Supabase nightly backup**.

The repository is public, so anyone signed in to GitHub can download those files. They are useless
without the passphrase, which is why it has to be long and random. Uploaded files in Supabase Storage
(logos, 990 PDFs) are not part of the dump.

## One-time setup (about 5 minutes)

1. **Connection string.** In the Supabase dashboard, open the project and click **Connect**. Under
   **Session pooler**, copy the URI. It looks like
   `postgresql://postgres.xewrvmqyzeiziimcmenj:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Put the database password in place of `[YOUR-PASSWORD]`. If you don't know it, reset it under
   **Project Settings > Database**; the app doesn't use it, so resetting breaks nothing. If the
   password has symbols such as `@` or `#`, percent-encode them (`@` is `%40`, `#` is `%23`).
   Use the session pooler, not the direct connection: GitHub's runners can't reach the direct one.
2. **Passphrase.** Generate at least 32 random characters, for example with a password manager or
   `openssl rand -base64 32`, and save it in your password manager. Without it, no backup can be opened.
3. **Secrets.** In GitHub: **Settings > Secrets and variables > Actions > New repository secret**.
   Add `SUPABASE_DB_URL` (step 1) and `BACKUP_PASSPHRASE` (step 2).
4. **Test.** **Actions > Supabase nightly backup > Run workflow**. A green run with a
   `grange-db-YYYY-MM-DD` artifact means it works. Until the secrets exist, runs pass with a
   "Backup skipped" notice.

## Restoring

1. Download the artifact from the run you want (it arrives as a `.zip`) and unzip it.
2. Decrypt and unpack:
   ```bash
   gpg --decrypt grange-db-YYYY-MM-DD.tar.gz.gpg > backup.tar.gz   # asks for the passphrase
   mkdir backup && tar -xzf backup.tar.gz -C backup                 # roles.sql, schema.sql, data.sql
   ```
3. Restore into a new, empty Supabase project (its Session pooler string as `NEW_DB_URL`):
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file backup/roles.sql --file backup/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file backup/data.sql --dbname "$NEW_DB_URL"
   ```
4. Point `config.js` at the new project, redeploy the edge functions in `supabase/functions/`, and set
   their secrets again (Gemini and Groq keys).
