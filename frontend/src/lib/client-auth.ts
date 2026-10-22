"use client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
let promise: Promise<{
  client: SupabaseClient | null;
  configured: boolean;
}> | null = null;
export function authClient() {
  if (!promise)
    promise = fetch("/api/config")
      .then((r) => r.json())
      .then((c: any) => ({
        client: c.configured
          ? createClient(c.supabaseUrl, c.supabaseKey, {
              auth: {
                flowType: "pkce",
                detectSessionInUrl: true,
                persistSession: true,
                autoRefreshToken: true,
              },
            })
          : null,
        configured: c.configured,
      }));
  return promise;
}
export async function authFetch(url: string, options: RequestInit = {}) {
  const { client } = await authClient();
  const headers = new Headers(options.headers);
  if (client) {
    const { data } = await client.auth.getSession();
    if (data.session)
      headers.set("Authorization", "Bearer " + data.session.access_token);
  }
  return fetch(url, { ...options, headers });
}
export async function logout() {
  const { client } = await authClient();
  if (client) {
    await client.auth.signOut();
    location.href = "/login";
  } else location.href = "/login";
}
