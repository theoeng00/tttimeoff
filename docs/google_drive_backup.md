# Google Drive backup

The backup command detects the active database and uploads a compressed backup to the configured Google Apps Script web app:

- SQLite: a verified snapshot named `timeoff-YYYY-MM-DD_HHMMSS.sqlite.gz`
- PostgreSQL/Supabase: a consistent `pg_dump` named `timeoff-YYYY-MM-DD_HHMMSS.sql.gz`

Add these settings to the existing `config/app.local.json` object. Keep the token identical to the `BACKUP_TOKEN` Script Property in Apps Script.

```json
"google_drive_backup_url": "https://script.google.com/macros/s/AKfycbw2kB225d7ni8eu0BDpu-QkfXYDGn6IuvQZ9bemUx14CBTgu3o3tPgFEbtSBu5vUoV-9Q/exec",
"google_drive_backup_token": "replace-with-your-secret-token"
```

Run a manual backup:

```powershell
npm run backup-google-drive
```

After the manual run succeeds, create a daily Windows Task Scheduler task:

- Program: the full path to `npm.cmd`
- Arguments: `run backup-google-drive`
- Start in: `X:\timeoff-management\timeoff-management`
- Select **Run whether user is logged on or not**.
- Configure retries for network failures.

The Apps Script receiver must allow both `.sqlite.gz` and `.sql.gz` filenames. If it removes old files by filename pattern, update that pattern to include both extensions.

## PostgreSQL prerequisites

Set `DATABASE_URL` and `DATABASE_SSL_CA`. The command uses `pg_dump` when it is installed. Otherwise it uses Docker image `postgres:17-alpine`, so Docker Desktop must be running. The Docker image is downloaded on first use.

The production Dockerfile installs `postgresql-client`, so backups do not need Docker inside the deployed container. PostgreSQL backups include the `public` schema and its data but exclude old `Sessions` table data.

To restore a SQLite backup, download it, decompress the `.gz` file, stop TimeOff.Management, replace `db.development.sqlite`, and start the application again.

Administrators can instead use **Settings > Restore**:

1. Upload a downloaded `.sqlite.gz` backup.
2. Review the company, employee, and leave counts shown after validation.
3. Confirm the restore.
4. Stop the server and run `start.bat` again. The pending database is applied before migrations run.

The replaced database is retained as `db.before-restore-YYYYMMDDHHMMSS.sqlite` for rollback. Restore access is restricted to administrators even when a non-admin employee can run backups.

PostgreSQL restore is intentionally not available in the web UI. Restore a `.sql.gz` with `psql` during a maintenance window, preferably into a new Supabase project first, and verify record counts before switching `DATABASE_URL`.
