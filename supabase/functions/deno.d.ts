/**
 * Declaraciones de tipos globales para Supabase Edge Functions (Deno Runtime).
 * Resuelve los tipos de Deno y módulos remotos de esm.sh en el editor.
 */

declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): Record<string, string>;
  }

  export const env: Env;

  export function serve(
    handler: (request: Request) => Promise<Response> | Response
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}

declare module "https://esm.sh/*" {
  const content: any;
  export default content;
}
