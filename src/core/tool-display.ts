// ─── Tool Categories ───
// Displayed as a dim tag before the tool label, e.g. [lsp] Definition

export type ToolCategory =
  | "file"
  | "shell"
  | "git"
  | "lsp"
  | "tree-sitter"
  | "web"
  | "memory"
  | "agent"
  | "ui"
  | "editor"
  | "execution";

export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // File tools
  read_file: "file",
  edit_file: "file",
  grep: "file",
  glob: "file",

  // Shell
  shell: "shell",

  // Git tools
  git_status: "git",
  git_diff: "git",
  git_log: "git",
  git_commit: "git",
  git_push: "git",
  git_pull: "git",
  git_stash: "git",

  // Static analysis — tree-sitter / ts-morph
  navigate: "tree-sitter",
  read_code: "tree-sitter",
  analyze: "tree-sitter",
  refactor: "tree-sitter",

  // Editor core (neovim buffer ops)
  editor_read: "editor",
  editor_edit: "editor",
  editor_navigate: "editor",
  editor_panel: "editor",

  // LSP (neovim language server)
  editor_diagnostics: "lsp",
  editor_symbols: "lsp",
  editor_hover: "lsp",
  editor_references: "lsp",
  editor_definition: "lsp",
  editor_actions: "lsp",
  editor_rename: "lsp",
  editor_lsp_status: "lsp",
  editor_format: "lsp",

  // Web
  web_search: "web",

  // Memory
  memory_write: "memory",

  // Agent / subagent
  dispatch: "agent",

  // Interactive UI
  plan: "ui",
  update_plan_step: "ui",
  ask_user: "ui",
  write_plan: "ui",

  // Code execution (sandboxed)
  code_execution: "execution",
};

export const CATEGORY_COLORS: Record<ToolCategory, string> = {
  file: "#5C9FD6",
  shell: "#FF0040",
  git: "#2d5",
  lsp: "#c678dd",
  "tree-sitter": "#e5c07b",
  web: "#5CBBF6",
  memory: "#FF8C00",
  agent: "#FF00FF",
  ui: "#00BFFF",
  editor: "#5C9FD6",
  execution: "#FF0040",
};

// ─── Tool Icons (nerdfonts) ───

export const TOOL_ICONS: Record<string, string> = {
  read_file: "\uDB80\uDCCB", // 󰂋
  edit_file: "\uF040", //
  shell: "\uF120", //
  grep: "\uF002", //
  glob: "\uF07C", //
  dispatch: "\uDB80\uDE29", // 󰚩 nf-md-robot
  web_search: "\uF0AC", // globe
  memory_write: "\uF02E", // bookmark
  editor_read: "\uDB80\uDCCB", // 󰂋
  editor_edit: "\uF040", //
  editor_navigate: "\uF0A9", //
  editor_diagnostics: "\uF071", //
  editor_symbols: "\uF0CB", //
  editor_hover: "\uDB80\uDE26", // 󰘦
  editor_references: "\uDB80\uDD39", // 󰌹
  editor_definition: "\uDB80\uDC6E", // 󰈮
  editor_actions: "\uDB80\uDC68", // 󰁨
  editor_rename: "󰑕",
  editor_lsp_status: "",
  editor_format: "󰉣",
  git_status: "󰊢",
  git_diff: "󰊢",
  git_log: "󰊢",
  git_commit: "󰊢",
  git_push: "󰊢",
  git_pull: "󰊢",
  git_stash: "󰊢",
  read_code: "\uDB80\uDD69", // 󰅩 nf-md-code-braces
  navigate: "\uF0A9", // nf-fa-arrow_circle_right
  analyze: "\uF002", // nf-fa-search
  refactor: "\uF0AD", // nf-fa-wrench
  editor_panel: "\uF044", //
  plan: "\uF0CB", // nf-fa-list_ol
  update_plan_step: "\uF058", // nf-fa-check_circle
  ask_user: "\uF059", // nf-fa-question_circle
  write_plan: "\uF0CB", // nf-fa-list_ol
  code_execution: "\uDB80\uDD69", // 󰅩 nf-md-code-braces
};

// ─── Tool Labels ───

export const TOOL_LABELS: Record<string, string> = {
  read_file: "Reading",
  edit_file: "Editing",
  shell: "Running",
  grep: "Searching",
  glob: "Globbing",
  dispatch: "Dispatching",
  web_search: "Searching web",
  memory_write: "Recording",
  editor_read: "Reading buffer",
  editor_edit: "Editing buffer",
  editor_navigate: "Navigating",
  editor_diagnostics: "Diagnostics",
  editor_symbols: "Symbols",
  editor_hover: "Hover",
  editor_references: "References",
  editor_definition: "Definition",
  editor_actions: "Code actions",
  editor_rename: "Renaming",
  editor_lsp_status: "LSP status",
  editor_format: "Formatting",
  git_status: "Git status",
  git_diff: "Git diff",
  git_log: "Git log",
  git_commit: "Committing",
  git_push: "Pushing",
  git_pull: "Pulling",
  git_stash: "Stashing",
  read_code: "Reading code",
  navigate: "Navigating",
  analyze: "Analyzing",
  refactor: "Refactoring",
  editor_panel: "Opening editor",
  plan: "Planning",
  update_plan_step: "Updating plan",
  ask_user: "Asking",
  write_plan: "Writing plan",
  code_execution: "Executing",
};

// ─── Tool Icon Colors ───

export const TOOL_ICON_COLORS: Record<string, string> = {
  read_file: "#5C9FD6",
  edit_file: "#FF8C00",
  shell: "#FF0040",
  grep: "#FFDD57",
  glob: "#5C9FD6",
  dispatch: "#9B30FF",
  web_search: "#5CBBF6",
  memory_write: "#FF8C00",
  editor_read: "#5C9FD6",
  editor_edit: "#FF8C00",
  editor_navigate: "#5C9FD6",
  editor_diagnostics: "#FFDD57",
  editor_symbols: "#8B5CF6",
  editor_hover: "#8B5CF6",
  editor_references: "#8B5CF6",
  editor_definition: "#8B5CF6",
  editor_actions: "#8B5CF6",
  editor_rename: "#FF8C00",
  editor_lsp_status: "#8B5CF6",
  editor_format: "#8B5CF6",
  git_status: "#2d5",
  git_diff: "#2d5",
  git_log: "#2d5",
  git_commit: "#FF8C00",
  git_push: "#FF8C00",
  git_pull: "#2d5",
  git_stash: "#2d5",
  read_code: "#8B5CF6",
  navigate: "#8B5CF6",
  analyze: "#8B5CF6",
  refactor: "#FF8C00",
  plan: "#00BFFF",
  update_plan_step: "#00BFFF",
  ask_user: "#FF8C00",
  write_plan: "#00BFFF",
  editor_panel: "#5C9FD6",
  code_execution: "#FF0040",
};
