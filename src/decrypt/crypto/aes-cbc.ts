import { createDecipheriv } from "node:crypto";

import { decodeBase64Binary } from "./base64.js";

function aesAlgorithm(keyLen: number): string {
  if (keyLen === 16) return "aes-128-cbc";
  if (keyLen === 24) return "aes-192-cbc";
  if (keyLen === 32) return "aes-256-cbc";
  throw new Error(`unsupported AES key length ${keyLen}`);
}

export function aesCbcDecrypt(cipherB64: string, keyB64: string, ivB64: string): string {
  const ciphertext = decodeBase64Binary(cipherB64);
  const key = decodeBase64Binary(keyB64);
  const iv = decodeBase64Binary(ivB64);
  const decipher = createDecipheriv(aesAlgorithm(key.length), key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
