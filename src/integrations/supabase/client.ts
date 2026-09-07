import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createStubClient(message: string): SupabaseClient<Database> {
  if (typeof window !== 'undefined') {
    console.warn('[Supabase] %s — autenticação e chamadas ao banco ficarão indisponíveis.', message);
  } else {
    console.warn('[Supabase SSR] %s — variáveis SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY não definidas no servidor.', message);
  }
  const noop = () => Promise.resolve({ data: null, error: new Error(message) });
  const noopAuth = () =>
    Promise.resolve({ data: { session: null, user: null }, error: null }) as any;
  return new Proxy({} as SupabaseClient<Database>, {
    get(_t, p) {
      if (p === 'auth') {
        return new Proxy({} as any, {
          get(_a, ap: any) {
            const noops = ['getSession', 'getUser', 'signOut', 'onAuthStateChange'];
            if (ap === 'onAuthStateChange') {
              return (cb: any) => { cb(null, null); return { data: { subscription: { unsubscribe: () => {} } } }; };
            }
            if (noops.includes(ap)) return noopAuth;
            return () => Promise.resolve({ data: null, error: new Error(message) });
          },
        });
      }
      if (typeof p === 'string' && ['from', 'channel', 'rpc', 'storage', 'functions'].includes(p)) {
        return () => new Proxy({} as any, {
          get(_s, sp: any) {
            if (sp === 'then') return undefined;
            return () => Promise.resolve({ data: null, error: new Error(message) });
          },
        });
      }
      if (p === 'then') return undefined;
      return () => Promise.resolve({ data: null, error: new Error(message) });
    },
  });
}

function createSupabaseClient(): SupabaseClient<Database> {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
    ].join(', ');
    const message = `Missing Supabase env vars: ${missing}`;
    return createStubClient(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
    },
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: SupabaseClient<Database> | undefined;

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});

