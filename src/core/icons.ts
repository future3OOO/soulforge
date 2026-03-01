// ─── Nerd Font Glyphs ───

export const PROVIDER_ICONS: Record<string, string> = {
  anthropic: "󱜙",
  openai: "󰧑",
  xai: "",
  google: "󰊭",
  ollama: "🦙",
};

export const UI_ICONS = {
  ghost: "󰊠",
  editor: "",
  chat: "󰭹",
  folder: "",
  brain: "󰘦",
  user: "",
  ai: "󰚩",
  system: "",
  tokens: "󰑖",
  sparkle: "",
  arrow: "",
  clock: "",
  git: "󰊢", // nf-md-source_branch (U+F02A2) — widely supported
} as const;

export function providerIcon(providerId: string): string {
  return PROVIDER_ICONS[providerId] ?? "●";
}
