// Types for post-format.mjs, so the API worker (TypeScript) can import it.

export type PostMeta = {
  title?: string;
  date?: string;
  icon?: string;
  thumbnail?: string;
  originalUrl?: string;
  isOwnProject?: boolean;
  hasAuthor?: boolean;
  hidden?: boolean;
  [key: string]: string | boolean | undefined;
};

export type FieldDef = { key: string; type: "string" | "boolean"; required?: boolean };

export const FIELDS: FieldDef[];
export const SLUG_RE: RegExp;
export function isValidSlug(slug: unknown): slug is string;
export function parsePost(text: string): { meta: PostMeta; body: string };
export function normalizeMeta(meta: Record<string, unknown> | null | undefined): PostMeta;
export function serializePost(meta: Record<string, unknown> | null | undefined, body: string | null | undefined): string;
export function validatePost(slug: string, meta: PostMeta): string[];
export function toIndexEntry(slug: string, meta: PostMeta): Record<string, string | boolean>;
