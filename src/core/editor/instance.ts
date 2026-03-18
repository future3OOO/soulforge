import { readFileSync } from "node:fs";
import type { NvimInstance } from "./neovim.js";

let instance: NvimInstance | null = null;

export function setNvimInstance(nvim: NvimInstance | null): void {
  instance = nvim;
}

export function getNvimInstance(): NvimInstance | null {
  return instance;
}

const NVIM_READ_TIMEOUT = 3000;

export async function readBufferContent(filePath: string): Promise<string> {
  const nvim = instance as
    | (NvimInstance & {
        api: { executeLua: (code: string, args: unknown[]) => Promise<unknown> };
      })
    | null;
  if (nvim) {
    try {
      const result = await Promise.race([
        nvim.api.executeLua(
          `
        local path = select(1, ...)
        for _, buf in ipairs(vim.api.nvim_list_bufs()) do
          if vim.api.nvim_buf_is_loaded(buf) then
            local name = vim.api.nvim_buf_get_name(buf)
            if name == path then
              local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
              return table.concat(lines, "\\n")
            end
          end
        end
        return nil
        `,
          [filePath],
        ),
        new Promise<null>((r) => setTimeout(() => r(null), NVIM_READ_TIMEOUT)),
      ]);
      if (typeof result === "string") return result;
    } catch {
      // Fall through to disk read
    }
  }
  return readFileSync(filePath, "utf-8");
}

export function waitForNvim(timeoutMs = 5000): Promise<NvimInstance | null> {
  if (instance) return Promise.resolve(instance);
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (instance) {
        resolve(instance);
      } else if (Date.now() - start > timeoutMs) {
        resolve(null);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}
