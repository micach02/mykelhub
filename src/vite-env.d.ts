/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional: bake a Supabase project into the build instead of entering it in Settings. */
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
