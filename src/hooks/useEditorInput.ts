import { useEffect } from "react";

/**
 * Raw stdin → neovim key translator.
 *
 * When the editor is focused, we bypass Ink's useInput entirely and read
 * raw terminal bytes from stdin, translating them to neovim key notation.
 * This preserves ALL key sequences (Ctrl combos, Alt, function keys, etc.)
 * so the user's full neovim config works.
 *
 * The ONLY key intercepted is Ctrl+E (0x05) which is left for Ink to
 * handle as the global editor/chat toggle.
 */

const CTRL_E = 0x05;
const ESC = "\x1b";
const MOD_ARROW_RE = new RegExp(`^${ESC}\\[1;(\\d+)([A-HPS])$`);
const MOD_TILDE_RE = new RegExp(`^${ESC}\\[(\\d+);(\\d+)~$`);

function translateRawToVim(data: Buffer): string | null {
  // Ctrl+E → return null so Ink handles it (focus toggle)
  if (data.length === 1 && data[0] === CTRL_E) return null;

  // ─── Single byte ───
  if (data.length === 1) {
    const b = data[0] as number;

    // Ctrl+A..Z (0x01–0x1A)
    if (b >= 0x01 && b <= 0x1a) {
      if (b === 0x09) return "<Tab>";
      if (b === 0x0a) return "<NL>";
      if (b === 0x0d) return "<CR>";
      if (b === 0x1b) return "<Esc>";
      return `<C-${String.fromCharCode(b + 0x60)}>`;
    }

    // DEL / Backspace
    if (b === 0x7f) return "<BS>";

    // Printable ASCII
    if (b >= 0x20 && b <= 0x7e) {
      const ch = String.fromCharCode(b);
      return ch === "<" ? "<LT>" : ch;
    }

    return String.fromCharCode(b);
  }

  // ─── Escape sequences (0x1B …) ───
  if (data[0] === 0x1b) {
    const seq = data.toString("latin1");

    // ── CSI: ESC [ … ──
    if (data[1] === 0x5b) {
      // Basic arrows / home / end
      if (seq === "\x1b[A") return "<Up>";
      if (seq === "\x1b[B") return "<Down>";
      if (seq === "\x1b[C") return "<Right>";
      if (seq === "\x1b[D") return "<Left>";
      if (seq === "\x1b[H") return "<Home>";
      if (seq === "\x1b[F") return "<End>";
      if (seq === "\x1b[Z") return "<S-Tab>";

      // Tilde keys
      if (seq === "\x1b[2~") return "<Insert>";
      if (seq === "\x1b[3~") return "<Del>";
      if (seq === "\x1b[5~") return "<PageUp>";
      if (seq === "\x1b[6~") return "<PageDown>";

      // Function keys F5–F12
      if (seq === "\x1b[15~") return "<F5>";
      if (seq === "\x1b[17~") return "<F6>";
      if (seq === "\x1b[18~") return "<F7>";
      if (seq === "\x1b[19~") return "<F8>";
      if (seq === "\x1b[20~") return "<F9>";
      if (seq === "\x1b[21~") return "<F10>";
      if (seq === "\x1b[23~") return "<F11>";
      if (seq === "\x1b[24~") return "<F12>";

      // Modified keys: ESC [ 1 ; <mod> <letter>
      const modArrow = seq.match(MOD_ARROW_RE);
      if (modArrow) {
        const mod = Number(modArrow[1]);
        const letter = modArrow[2] as string;
        const keyMap: Record<string, string> = {
          A: "Up",
          B: "Down",
          C: "Right",
          D: "Left",
          H: "Home",
          F: "End",
          P: "F1",
          Q: "F2",
          R: "F3",
          S: "F4",
        };
        const vimKey = keyMap[letter];
        if (vimKey) {
          const prefix = modPrefix(mod);
          return `<${prefix}${vimKey}>`;
        }
      }

      // Modified tilde keys: ESC [ <num> ; <mod> ~
      const modTilde = seq.match(MOD_TILDE_RE);
      if (modTilde) {
        const num = modTilde[1];
        const mod = Number(modTilde[2]);
        const tildeMap: Record<string, string> = {
          "2": "Insert",
          "3": "Del",
          "5": "PageUp",
          "6": "PageDown",
          "15": "F5",
          "17": "F6",
          "18": "F7",
          "19": "F8",
          "20": "F9",
          "21": "F10",
          "23": "F11",
          "24": "F12",
        };
        const vimKey = tildeMap[num as string];
        if (vimKey) {
          const prefix = modPrefix(mod);
          return `<${prefix}${vimKey}>`;
        }
      }
    }

    // ── SS3: ESC O … ──  (F1–F4)
    if (data[1] === 0x4f) {
      if (seq === "\x1bOP") return "<F1>";
      if (seq === "\x1bOQ") return "<F2>";
      if (seq === "\x1bOR") return "<F3>";
      if (seq === "\x1bOS") return "<F4>";
    }

    // ── Alt + single key: ESC <char> ──
    if (data.length === 2 && (data[1] as number) >= 0x20) {
      const ch = String.fromCharCode(data[1] as number);
      return `<A-${ch}>`;
    }

    // Lone ESC
    if (data.length === 1) return "<Esc>";
  }

  // ─── Multi-byte UTF-8 ───
  return data.toString("utf-8");
}

/** Map xterm modifier number → vim modifier prefix. */
function modPrefix(mod: number): string {
  // xterm: 2=Shift, 3=Alt, 4=Shift+Alt, 5=Ctrl, 6=Ctrl+Shift, 7=Ctrl+Alt, 8=Ctrl+Shift+Alt
  const parts: string[] = [];
  const m = mod - 1; // bit field: bit0=Shift, bit1=Alt, bit2=Ctrl
  if (m & 4) parts.push("C");
  if (m & 2) parts.push("A");
  if (m & 1) parts.push("S");
  return parts.length > 0 ? `${parts.join("-")}-` : "";
}

/**
 * Reads raw stdin when the editor is focused and forwards all keys
 * to neovim, except Ctrl+E which is left for Ink as the focus toggle.
 */
export function useEditorInput(sendKeys: (keys: string) => Promise<void>, isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return;

    // Ink sets stdin.setEncoding('utf8'), so data arrives as string.
    // Convert back to Buffer for byte-level key translation.
    const handler = (data: Buffer | string) => {
      const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
      const vimKeys = translateRawToVim(buf);
      if (vimKeys !== null) {
        sendKeys(vimKeys).catch(() => {});
      }
    };

    process.stdin.on("data", handler);
    return () => {
      process.stdin.removeListener("data", handler);
    };
  }, [isActive, sendKeys]);
}
