import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const expected = {
  "bird.glb": "a3d7680483a57df2f7ea13bd43a393987e4925cf8388e77f69a314d0c4aaf5c7",
  "og.jpg": "9104447391b58908013d35dcb313d8096aa54af5913626cee4bfe5497e1ef9a1",
};

function parts(name) {
  const dir = join(root, "public/encoded");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.startsWith(`${name}.b64.`))
    .sort()
    .map((file) => join(dir, file));
}

function materialize(name, destRel) {
  const chunks = parts(name);
  if (chunks.length === 0) return;
  const b64 = chunks.map((file) => readFileSync(file, "utf8")).join("").replace(/\s+/g, "");
  const buf = Buffer.from(b64, "base64");
  const digest = createHash("sha256").update(buf).digest("hex");
  if (digest !== expected[name]) {
    throw new Error(`${name} sha256 mismatch: got ${digest}`);
  }
  const dest = join(root, destRel);
  if (existsSync(dest)) {
    const current = createHash("sha256").update(readFileSync(dest)).digest("hex");
    if (current === digest) return;
  }
  writeFileSync(dest, buf);
}

materialize("bird.glb", "public/bird.glb");
materialize("og.jpg", "public/og.jpg");
