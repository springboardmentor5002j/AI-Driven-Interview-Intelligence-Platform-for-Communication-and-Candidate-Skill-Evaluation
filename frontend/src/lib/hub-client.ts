import { authFetch } from "./client-auth";
export type CatalogItem = {
  id: string;
  kind: "course" | "path" | "event" | "job";
  author?: string;
  created?: string;
  data: {
    title: string;
    description: string;
    topic?: string;
    level?: string;
    theme?: string;
    tag?: string;
    courses?: string[];
    lessons?: { id: string; title: string; body: string; exercise: string }[];
    date?: string;
    organization?: string;
    location?: string;
    url?: string;
  };
};
export type HubAction = {
  id: string;
  kind: string;
  item: string;
  created: string;
  data: any;
};
export type Profile = {
  name: string;
  headline?: string;
  bio?: string;
  location?: string;
  skills?: string[];
  goal?: string;
  github?: string;
  linkedin?: string;
};
export type Preferences = {
  leaderboard_opt_in?: boolean;
  public_alias?: string;
  compact_cards?: boolean;
  preferred_topic?: string;
};
export type HubAccount = {
  id: string;
  profile: Profile;
  preferences: Preferences;
  actions: HubAction[];
};
export async function hubApi(path: string, method = "GET", body?: unknown) {
  const r = await authFetch("/api/hub/" + path, {
    method,
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed");
  return data;
}
