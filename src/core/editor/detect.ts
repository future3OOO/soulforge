import { findNvim } from "neovim";

export interface DetectedNvim {
  path: string;
  version: string;
}

/**
 * Detect a usable neovim binary on the system.
 * Returns the path and version, or throws with install instructions.
 */
export function detectNeovim(): DetectedNvim {
  const result = findNvim({ orderBy: "desc", minVersion: "0.9.0" });

  if (result.matches.length > 0) {
    const best = result.matches[0];
    if (best?.path && best.nvimVersion) {
      return { path: best.path, version: best.nvimVersion };
    }
  }

  const platform = process.platform;
  let installHint: string;

  switch (platform) {
    case "darwin":
      installHint = "  brew install neovim";
      break;
    case "linux":
      installHint = [
        "  Ubuntu/Debian: sudo apt install neovim",
        "  Fedora:        sudo dnf install neovim",
        "  Arch:          sudo pacman -S neovim",
      ].join("\n");
      break;
    case "win32":
      installHint = ["  scoop install neovim", "  choco install neovim"].join("\n");
      break;
    default:
      installHint = "  See https://github.com/neovim/neovim/blob/master/INSTALL.md";
  }

  throw new Error(
    [
      "Neovim >= 0.9.0 is required but was not found on your system.",
      "",
      "Install neovim:",
      installHint,
      "",
      "Then restart SoulForge.",
    ].join("\n"),
  );
}
