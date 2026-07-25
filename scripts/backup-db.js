import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { db } from "../src/db.js";
import { config } from "../src/config.js";

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function stamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function encryptionKey(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest();
}

function encryptFile(filePath, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(readFileSync(filePath)), cipher.final()]);
  const payload = {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: encrypted.toString("base64url")
  };
  const encryptedPath = `${filePath}.enc`;
  writeFileSync(encryptedPath, JSON.stringify(payload));
  rmSync(filePath, { force: true });
  return encryptedPath;
}

const backupDir = path.resolve(process.env.BACKUP_DIR || "./backups");
mkdirSync(backupDir, { recursive: true });

const baseName = `mff-${stamp()}.sqlite`;
const targetPath = path.join(backupDir, baseName);
if (existsSync(targetPath) || existsSync(`${targetPath}.enc`)) {
  throw new Error(`Backup target already exists: ${targetPath}`);
}

db.exec(`VACUUM INTO ${sqlString(targetPath)}`);
const finalPath = process.env.BACKUP_ENCRYPTION_KEY
  ? encryptFile(targetPath, process.env.BACKUP_ENCRYPTION_KEY)
  : targetPath;

console.log(JSON.stringify({
  ok: true,
  source: path.resolve(config.SQLITE_PATH),
  backup: finalPath,
  encrypted: finalPath.endsWith(".enc")
}, null, 2));
