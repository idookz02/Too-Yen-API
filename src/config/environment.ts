/**
 * Environment variables — single access point (DESIGN_PATTERN.md).
 * Lazy getters: only the vars actually used get validated, so e.g. the
 * healthz test runs without a full .env.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  get DATABASE_URL(): string {
    return required("DATABASE_URL");
  },
  get SUPABASE_URL(): string {
    return required("SUPABASE_URL");
  },
  get SUPABASE_SERVICE_ROLE_KEY(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get JWT_SECRET(): string {
    return required("JWT_SECRET");
  },
  get PORT(): number {
    return Number(process.env.PORT ?? 3000);
  },
};
