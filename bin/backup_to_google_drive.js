'use strict';

const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const util = require('util');
const zlib = require('zlib');
const sqlite3 = require('sqlite3');
const {closeDatabase, openDatabase, verifyDatabase} = require('../lib/util/sqlite_database');

const gzip = util.promisify(zlib.gzip);
const MAX_BACKUP_BYTES = 30 * 1024 * 1024;
const MAX_SQL_BYTES = 100 * 1024 * 1024;

const snapshotDatabase = async (source, destination) => {
  const database = await openDatabase(source, sqlite3.OPEN_READONLY);

  try {
    await new Promise((resolve, reject) => {
      const backup = database.backup(destination, error => {
        if (error) return reject(error);

        backup.step(-1, (stepError, completed) => {
          if (stepError) return reject(stepError);
          if (!completed) return reject(new Error('SQLite backup did not complete'));
          resolve();
        });
      });
    });
  } finally {
    await closeDatabase(database);
  }
};

const backupFilename = now => `timeoff-${now.toISOString().slice(0, 10)}_${now.toISOString().slice(11, 19).replace(/:/g, '')}.sqlite.gz`;
const postgresBackupFilename = now => `timeoff-${now.toISOString().slice(0, 10)}_${now.toISOString().slice(11, 19).replace(/:/g, '')}.sql.gz`;

const createBackupPayload = async ({databasePath, now=new Date()}) => {
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'timeoff-backup-'));
  const snapshotPath = path.join(temporaryDirectory, 'snapshot.sqlite');

  try {
    await snapshotDatabase(databasePath, snapshotPath);
    await verifyDatabase(snapshotPath);

    const compressed = await gzip(await fs.promises.readFile(snapshotPath));

    // ponytail: เก็บไฟล์บีบอัดในหน่วยความจำเพื่อให้โค้ดสั้นและตรวจ checksum ง่าย หากเกิน 30 MB ให้เปลี่ยนเป็น streaming upload
    if (compressed.length > MAX_BACKUP_BYTES) throw new Error('Compressed backup exceeds 30 MB');

    return {
      filename: backupFilename(now),
      data: compressed.toString('base64'),
      sha256: crypto.createHash('sha256').update(compressed).digest('hex'),
    };
  } finally {
    await fs.promises.unlink(snapshotPath).catch(() => {});
    await fs.promises.rmdir(temporaryDirectory).catch(() => {});
  }
};

const commandAvailable = command => new Promise(resolve => {
  const child = childProcess.spawn(command, ['--version'], {windowsHide: true, stdio: 'ignore'});
  child.once('error', () => resolve(false));
  child.once('close', () => resolve(true));
});

const runCommandToFile = ({command, args, environment, destination}) => {
  const child = childProcess.spawn(command, args, {
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const errors = [];
  let errorBytes = 0;

  child.stderr.on('data', chunk => {
    errorBytes += chunk.length;
    if (errorBytes <= 1024 * 1024) errors.push(chunk);
  });

  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0
      ? resolve()
      : reject(new Error(Buffer.concat(errors).toString('utf8').trim() || `${command} exited with code ${code}`)));
  });

  return Promise.all([
    util.promisify(require('stream').pipeline)(child.stdout, fs.createWriteStream(destination)),
    exited,
  ]);
};

const validatePostgresUrl = databaseUrl => {
  if (typeof databaseUrl !== 'string' || /[\r\n]/.test(databaseUrl)) throw new Error('DATABASE_URL is not a valid URL');
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch (_error) {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.username || !parsed.password) {
    throw new Error('DATABASE_URL must contain a PostgreSQL host, username, and password');
  }
  return parsed;
};

const dumpPostgres = async ({databaseUrl, certificate, destination, temporaryDirectory}) => {
  const parsed = validatePostgresUrl(databaseUrl);
  const connection = {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'postgres'),
  };
  if (Object.values(connection).some(value => /[\r\n]/.test(value))) {
    throw new Error('DATABASE_URL contains an invalid newline');
  }
  const ca = (certificate || '').replace(/\\n/g, '\n').trim();
  if (!ca.startsWith('-----BEGIN CERTIFICATE-----') || !ca.endsWith('-----END CERTIFICATE-----')) {
    throw new Error('DATABASE_SSL_CA must contain the Supabase PEM certificate');
  }

  const certificatePath = path.join(temporaryDirectory, 'supabase-ca.crt');
  await fs.promises.writeFile(certificatePath, ca, {mode: 0o600});
  const dumpArgs = [
    '--format=plain',
    '--no-owner',
    '--no-privileges',
    '--serializable-deferrable',
    '--schema=public',
    '--exclude-table-data=public."Sessions"',
  ];
  const environment = {
    ...process.env,
    ...connection,
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: certificatePath,
    PGCONNECT_TIMEOUT: '30',
  };
  const pgDump = process.env.PG_DUMP_PATH || 'pg_dump';

  try {
    if (await commandAvailable(pgDump)) {
      await runCommandToFile({command: pgDump, args: dumpArgs, environment, destination});
      return;
    }

    const dockerEnvironmentPath = path.join(temporaryDirectory, 'docker.env');
    await fs.promises.writeFile(dockerEnvironmentPath, [
      `PGHOST=${connection.PGHOST}`,
      `PGPORT=${connection.PGPORT}`,
      `PGUSER=${connection.PGUSER}`,
      `PGPASSWORD=${connection.PGPASSWORD}`,
      `PGDATABASE=${connection.PGDATABASE}`,
      'PGSSLMODE=verify-full',
      'PGSSLROOTCERT=/backup/supabase-ca.crt',
      'PGCONNECT_TIMEOUT=30',
      '',
    ].join('\n'), {mode: 0o600});
    await runCommandToFile({
      command: 'docker',
      args: [
        'run', '--rm', '-i',
        '--env-file', dockerEnvironmentPath,
        '-v', `${temporaryDirectory}:/backup:ro`,
        process.env.PG_DUMP_DOCKER_IMAGE || 'postgres:17-alpine',
        'pg_dump', ...dumpArgs,
      ],
      environment: process.env,
      destination,
    });
  } catch (error) {
    throw new Error(error.message.replace(databaseUrl, '[DATABASE_URL]').replace(connection.PGPASSWORD, '[PASSWORD]'));
  }
};

const createPostgresBackupPayload = async ({
  databaseUrl,
  certificate,
  now=new Date(),
  dump=dumpPostgres,
}) => {
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'timeoff-postgres-backup-'));
  const sqlPath = path.join(temporaryDirectory, 'timeoff.sql');

  try {
    await dump({databaseUrl, certificate, destination: sqlPath, temporaryDirectory});
    const stat = await fs.promises.stat(sqlPath);
    if (!stat.size) throw new Error('pg_dump produced an empty backup');
    // ponytail: อ่าน SQL เข้า memory ได้สูงสุด 100 MB; ถ้าฐานโตเกินนี้ให้อัปเกรดเป็น streaming gzip/upload
    if (stat.size > MAX_SQL_BYTES) throw new Error('SQL backup exceeds 100 MB');

    const sql = await fs.promises.readFile(sqlPath);
    if (!sql.includes(Buffer.from('PostgreSQL database dump')) || !sql.includes(Buffer.from('CREATE TABLE'))) {
      throw new Error('pg_dump output does not look like a PostgreSQL database backup');
    }
    const compressed = await gzip(sql);
    if (compressed.length > MAX_BACKUP_BYTES) throw new Error('Compressed backup exceeds 30 MB');

    return {
      filename: postgresBackupFilename(now),
      data: compressed.toString('base64'),
      sha256: crypto.createHash('sha256').update(compressed).digest('hex'),
    };
  } finally {
    for (const filename of await fs.promises.readdir(temporaryDirectory).catch(() => [])) {
      await fs.promises.unlink(path.join(temporaryDirectory, filename)).catch(() => {});
    }
    await fs.promises.rmdir(temporaryDirectory).catch(() => {});
  }
};

const postJson = ({url, payload, redirects=0}) => new Promise((resolve, reject) => {
  if (redirects > 5) return reject(new Error('Too many redirects from backup endpoint'));

  const target = new URL(url);
  const body = payload === null ? null : Buffer.from(JSON.stringify(payload));
  const transport = target.protocol === 'https:' ? https : http;
  const request = transport.request(target, {
    method: body ? 'POST' : 'GET',
    headers: body ? {
      'Content-Type': 'application/json',
      'Content-Length': body.length,
    } : {},
  }, response => {
    if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
      response.resume();
      const preserveBody = response.statusCode === 307 || response.statusCode === 308;
      return resolve(postJson({
        url: new URL(response.headers.location, target).toString(),
        payload: preserveBody ? payload : null,
        redirects: redirects + 1,
      }));
    }

    const chunks = [];
    let responseBytes = 0;

    response.on('data', chunk => {
      responseBytes += chunk.length;
      if (responseBytes > 1024 * 1024) request.destroy(new Error('Backup endpoint response is too large'));
      else chunks.push(chunk);
    });
    response.on('end', () => {
      const content = Buffer.concat(chunks).toString('utf8');
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return reject(new Error(`Backup endpoint returned HTTP ${response.statusCode}`));
      }

      try {
        resolve(JSON.parse(content));
      } catch (_error) {
        reject(new Error(`Backup endpoint returned invalid JSON: ${content.replace(/\s+/g, ' ').slice(0, 160)}`));
      }
    });
  });

  request.setTimeout(60000, () => request.destroy(new Error('Backup upload timed out')));
  request.on('error', reject);
  if (body) request.write(body);
  request.end();
});

const uploadBackup = async ({url, token, databasePath, now}) => {
  if (!url || !token) throw new Error('Missing google_drive_backup_url or google_drive_backup_token in config/app.local.json');
  if (!fs.existsSync(databasePath)) throw new Error(`SQLite database was not found: ${databasePath}`);

  const payload = await createBackupPayload({databasePath, now});
  const result = await postJson({url, payload: {...payload, token}});

  if (!result || result.ok !== true) throw new Error(`Google Drive backup failed: ${result && result.error ? result.error : 'unknown error'}`);
  return result;
};

const uploadPostgresBackup = async ({url, token, databaseUrl, certificate, now}) => {
  if (!url || !token) throw new Error('Missing google_drive_backup_url or google_drive_backup_token in config/app.local.json');
  const payload = await createPostgresBackupPayload({databaseUrl, certificate, now});
  const result = await postJson({url, payload: {...payload, token}});
  if (!result || result.ok !== true) throw new Error(`Google Drive backup failed: ${result && result.error ? result.error : 'unknown error'}`);
  return result;
};

const main = async () => {
  const environment = process.env.NODE_ENV || 'development';
  const databaseConfig = require('../config/db.js')[environment];
  const appConfig = require('../lib/config');

  if (!databaseConfig) throw new Error(`Database configuration is missing for NODE_ENV ${environment}`);

  const common = {
    url: appConfig.get('google_drive_backup_url'),
    token: appConfig.get('google_drive_backup_token'),
  };
  let result;
  if (databaseConfig.dialect === 'postgres') {
    result = await uploadPostgresBackup({
      ...common,
      databaseUrl: process.env[databaseConfig.use_env_variable || 'DATABASE_URL'],
      certificate: process.env.DATABASE_SSL_CA,
    });
  } else if (databaseConfig.dialect === 'sqlite' && databaseConfig.storage) {
    result = await uploadBackup({
      ...common,
      databasePath: path.resolve(__dirname, '..', databaseConfig.storage),
    });
  } else {
    throw new Error(`Google Drive backup does not support database dialect ${databaseConfig.dialect || 'unknown'}`);
  }

  console.log(`Backup uploaded successfully: ${result.filename} (${result.fileId})`);
};

if (require.main === module) {
  main().catch(error => {
    console.error(`Backup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  backupFilename,
  postgresBackupFilename,
  createBackupPayload,
  createPostgresBackupPayload,
  dumpPostgres,
  postJson,
  uploadBackup,
  uploadPostgresBackup,
  verifyDatabase,
};
