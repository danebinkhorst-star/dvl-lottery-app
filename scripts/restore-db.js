import crypto from "node:crypto";
import dotenv from "dotenv";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

dotenv.config();

function arg(name) {
  const prefix = `${name}=`;
  const directIndex = process.argv.indexOf(name);
  if (directIndex !== -1) return process.argv[directIndex + 1] || "";
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || "";
}

function encryptionKey(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest();
}

function decryptBackup(filePath, secret) {
  const payload = JSON.parse(readFileSync(filePath, "utf8"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(payload.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64url")),
    decipher.final()
  ]);
  const tempPath = path.join(os.tmpdir(), `mff-restore-${Date.now()}.sqlite`);
  writeFileSync(tempPath, decrypted);
  return tempPath;
}

const backupPath = path.resolve(arg("--backup") || process.argv[2] || "");
const force = process.argv.includes("--force");
if (!backupPath || !existsSync(backupPath)) {
  throw new Error("Geef een bestaand backupbestand mee: node scripts/restore-db.js --backup ./backups/file.sqlite --force");
}
if (!force) {
  throw new Error("Restore is bewust geblokkeerd zonder --force.");
}

const sqlitePath = path.resolve(process.env.SQLITE_PATH || "./data/dvl-lottery.db");
mkdirSync(path.dirname(sqlitePath), { recursive: true });
if (backupPath.endsWith(".enc") && !process.env.BACKUP_ENCRYPTION_KEY) {
  throw new Error("BACKUP_ENCRYPTION_KEY is nodig om deze backup te herstellen.");
}
const sourcePath = backupPath.endsWith(".enc")
  ? decryptBackup(backupPath, process.env.BACKUP_ENCRYPTION_KEY || "")
  : backupPath;

if (existsSync(sqlitePath)) {
  renameSync(sqlitePath, `${sqlitePath}.before-restore-${Date.now()}`);
}
copyFileSync(sourcePath, sqlitePath);

console.log(JSON.stringify({
  ok: true,
  restoredTo: sqlitePath,
  source: backupPath
}, null, 2));
