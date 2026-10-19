import { createHash, randomBytes } from 'node:crypto';

/**
 * Gera um token para links (convite, portal da família).
 * Só o hash SHA-256 vai para o banco; o token aparece apenas no link entregue.
 */
export function createLinkToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Hash do IP com sal: identifica abuso sem armazenar o IP (minimização, LGPD art. 6º). */
export function hashIp(ip: string | undefined, salt: string): string | null {
  return ip ? sha256(`${salt}:${ip}`).slice(0, 32) : null;
}

export const toIso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : d);
export const toIsoOrNull = (d: Date | string | null): string | null => (d ? toIso(d) : null);
