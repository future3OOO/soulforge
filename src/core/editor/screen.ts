// ─── Neovim Screen State ───
// Processes redraw events from nvim_ui_attach and produces
// colored segments for rendering in Ink.

export interface ScreenSegment {
  text: string;
  fg: string;
  bg: string | undefined; // undefined = default/transparent
  bold: boolean;
  italic: boolean;
}

interface HlAttr {
  fg?: number;
  bg?: number;
  bold?: boolean;
  italic?: boolean;
  reverse?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

function rgbToHex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

export class NvimScreen {
  rows: number;
  cols: number;
  private grid: string[][];
  private hlGrid: number[][];
  private hlAttrs = new Map<number, HlAttr>();
  private defaultFg = 0xc0c0c0;
  private defaultBg = 0x1a1a2e;
  cursorRow = 0;
  cursorCol = 0;
  modeName = "normal";
  dirty = false;

  // Per-row dirty tracking for incremental updates
  private dirtyRows = new Set<number>();
  private cachedLines: ScreenSegment[][] = [];
  private colorsChanged = false;

  /** Callback fired on each flush event (complete screen update). */
  onFlush: (() => void) | null = null;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.grid = Array.from({ length: rows }, () => Array<string>(cols).fill(" "));
    this.hlGrid = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
    this.cachedLines = Array.from({ length: rows }, () => []);
  }

  /** Process a batch of redraw events from neovim. */
  processEvents(events: unknown[]): void {
    for (const event of events) {
      const arr = event as unknown[];
      const name = arr[0] as string;
      for (let i = 1; i < arr.length; i++) {
        this.handleEvent(name, arr[i] as unknown[]);
      }
    }
  }

  private handleEvent(name: string, args: unknown[]): void {
    switch (name) {
      case "grid_resize":
        this.handleGridResize(args[1] as number, args[2] as number);
        break;
      case "grid_line":
        this.handleGridLine(args[1] as number, args[2] as number, args[3] as unknown[]);
        break;
      case "grid_cursor_goto":
        this.markRowDirty(this.cursorRow); // old cursor row
        this.cursorRow = args[1] as number;
        this.cursorCol = args[2] as number;
        this.markRowDirty(this.cursorRow); // new cursor row
        break;
      case "grid_clear":
        this.handleGridClear();
        break;
      case "grid_scroll":
        this.handleGridScroll(
          args[1] as number,
          args[2] as number,
          args[3] as number,
          args[4] as number,
          args[5] as number,
        );
        break;
      case "hl_attr_define":
        this.handleHlAttrDefine(args[0] as number, args[1] as Record<string, unknown>);
        break;
      case "default_colors_set":
        this.handleDefaultColors(args[0] as number, args[1] as number);
        break;
      case "mode_change":
        this.modeName = (args[0] as string) || "normal";
        break;
      case "flush":
        // Always re-render cursor row to guarantee visibility —
        // grid_cursor_goto and grid_line can arrive in separate batches
        this.markRowDirty(this.cursorRow);
        this.dirty = true;
        this.onFlush?.();
        break;
    }
  }

  private markRowDirty(row: number): void {
    if (row >= 0 && row < this.rows) {
      this.dirtyRows.add(row);
    }
  }

  private markAllDirty(): void {
    for (let r = 0; r < this.rows; r++) {
      this.dirtyRows.add(r);
    }
    this.colorsChanged = true;
  }

  private handleGridResize(width: number, height: number): void {
    const newGrid = Array.from({ length: height }, (_, r) =>
      Array.from({ length: width }, (_, c) =>
        r < this.rows && c < this.cols ? (this.grid[r]?.[c] ?? " ") : " ",
      ),
    );
    const newHlGrid = Array.from({ length: height }, (_, r) =>
      Array.from({ length: width }, (_, c) =>
        r < this.rows && c < this.cols ? (this.hlGrid[r]?.[c] ?? 0) : 0,
      ),
    );
    this.rows = height;
    this.cols = width;
    this.grid = newGrid;
    this.hlGrid = newHlGrid;
    this.cachedLines = Array.from({ length: height }, () => []);
    this.markAllDirty();
  }

  private handleGridLine(row: number, colStart: number, cells: unknown[]): void {
    if (row >= this.rows) return;
    let col = colStart;
    let lastHlId = 0;

    for (const cell of cells) {
      const arr = cell as unknown[];
      const text = (arr[0] as string) || " ";
      if (arr.length >= 2) lastHlId = arr[1] as number;
      const repeat = arr.length >= 3 ? (arr[2] as number) : 1;

      for (let r = 0; r < repeat; r++) {
        if (col < this.cols) {
          const gridRow = this.grid[row];
          const hlRow = this.hlGrid[row];
          if (gridRow && hlRow) {
            gridRow[col] = text;
            hlRow[col] = lastHlId;
          }
          col++;
        }
      }
    }
    this.markRowDirty(row);
  }

  private handleGridClear(): void {
    for (let r = 0; r < this.rows; r++) {
      const gridRow = this.grid[r];
      const hlRow = this.hlGrid[r];
      if (gridRow && hlRow) {
        gridRow.fill(" ");
        hlRow.fill(0);
      }
    }
    this.markAllDirty();
  }

  private handleGridScroll(
    top: number,
    bot: number,
    left: number,
    right: number,
    rows: number,
  ): void {
    if (rows > 0) {
      for (let r = top; r < bot - rows; r++) {
        for (let c = left; c < right; c++) {
          const src = this.grid[r + rows]?.[c];
          const srcHl = this.hlGrid[r + rows]?.[c];
          const dstRow = this.grid[r];
          const dstHlRow = this.hlGrid[r];
          if (dstRow && dstHlRow) {
            dstRow[c] = src ?? " ";
            dstHlRow[c] = srcHl ?? 0;
          }
        }
        this.markRowDirty(r);
      }
      for (let r = bot - rows; r < bot; r++) {
        for (let c = left; c < right; c++) {
          const dstRow = this.grid[r];
          const dstHlRow = this.hlGrid[r];
          if (dstRow && dstHlRow) {
            dstRow[c] = " ";
            dstHlRow[c] = 0;
          }
        }
        this.markRowDirty(r);
      }
    } else if (rows < 0) {
      const absRows = -rows;
      for (let r = bot - 1; r >= top + absRows; r--) {
        for (let c = left; c < right; c++) {
          const src = this.grid[r - absRows]?.[c];
          const srcHl = this.hlGrid[r - absRows]?.[c];
          const dstRow = this.grid[r];
          const dstHlRow = this.hlGrid[r];
          if (dstRow && dstHlRow) {
            dstRow[c] = src ?? " ";
            dstHlRow[c] = srcHl ?? 0;
          }
        }
        this.markRowDirty(r);
      }
      for (let r = top; r < top + absRows; r++) {
        for (let c = left; c < right; c++) {
          const dstRow = this.grid[r];
          const dstHlRow = this.hlGrid[r];
          if (dstRow && dstHlRow) {
            dstRow[c] = " ";
            dstHlRow[c] = 0;
          }
        }
        this.markRowDirty(r);
      }
    }
  }

  private handleHlAttrDefine(id: number, rgbAttr: Record<string, unknown>): void {
    const newAttr: HlAttr = {
      fg: typeof rgbAttr.foreground === "number" ? rgbAttr.foreground : undefined,
      bg: typeof rgbAttr.background === "number" ? rgbAttr.background : undefined,
      bold: rgbAttr.bold === true,
      italic: rgbAttr.italic === true,
      reverse: rgbAttr.reverse === true,
      underline: rgbAttr.underline === true,
      strikethrough: rgbAttr.strikethrough === true,
    };

    // Only flag colors changed if the attr actually differs
    const existing = this.hlAttrs.get(id);
    if (
      !existing ||
      existing.fg !== newAttr.fg ||
      existing.bg !== newAttr.bg ||
      existing.bold !== newAttr.bold ||
      existing.italic !== newAttr.italic ||
      existing.reverse !== newAttr.reverse ||
      existing.underline !== newAttr.underline ||
      existing.strikethrough !== newAttr.strikethrough
    ) {
      this.hlAttrs.set(id, newAttr);
      this.colorsChanged = true;
    }
  }

  private static readonly FALLBACK_FG = 0xc0c0c0;
  private static readonly FALLBACK_BG = 0x1a1a2e;

  private handleDefaultColors(fg: number, bg: number): void {
    // fg/bg of -1 means "use terminal default" — since we're an embedded UI
    // with no real terminal background, fall back to our dark defaults.
    this.defaultFg = fg >= 0 ? fg : NvimScreen.FALLBACK_FG;
    this.defaultBg = bg >= 0 ? bg : NvimScreen.FALLBACK_BG;
    this.colorsChanged = true;
  }

  /** Get the default background color as a hex string. */
  getDefaultBg(): string {
    return rgbToHex(this.defaultBg);
  }

  /** Build a single row's segments. */
  private buildRow(row: number, defaultBgHex: string): ScreenSegment[] {
    const segments: ScreenSegment[] = [];
    let current: ScreenSegment | null = null;
    const isCursorRow = row === this.cursorRow;

    for (let col = 0; col < this.cols; col++) {
      const char = this.grid[row]?.[col] ?? " ";
      const hlId = this.hlGrid[row]?.[col] ?? 0;
      const attr = this.hlAttrs.get(hlId);

      let fg = this.defaultFg;
      let bg = this.defaultBg;
      let bold = false;
      let italic = false;

      if (attr) {
        if (attr.reverse) {
          fg = attr.bg ?? this.defaultBg;
          bg = attr.fg ?? this.defaultFg;
        } else {
          if (attr.fg !== undefined) fg = attr.fg;
          if (attr.bg !== undefined) bg = attr.bg;
        }
        bold = attr.bold ?? false;
        italic = attr.italic ?? false;
      }

      // Block cursor: invert fg/bg at the cursor position
      const isCursor = isCursorRow && col === this.cursorCol;
      if (isCursor) {
        const tmp = fg;
        fg = bg;
        bg = tmp;
      }

      const fgHex = rgbToHex(fg);
      const bgHex = rgbToHex(bg);
      // Cursor cell always gets explicit bg so it's always visible
      const segBg = isCursor ? bgHex : bgHex === defaultBgHex ? undefined : bgHex;

      if (
        current &&
        current.fg === fgHex &&
        current.bg === segBg &&
        current.bold === bold &&
        current.italic === italic
      ) {
        current.text += char;
      } else {
        current = { text: char, fg: fgHex, bg: segBg, bold, italic };
        segments.push(current);
      }
    }

    return segments;
  }

  /**
   * Get segmented lines, only rebuilding rows that changed.
   * Returns the cached array with updated entries.
   * The returned array reference is always new so React detects the change.
   */
  getSegmentedLines(): ScreenSegment[][] {
    const defaultBgHex = rgbToHex(this.defaultBg);

    // If colors changed, rebuild everything
    if (this.colorsChanged) {
      this.colorsChanged = false;
      for (let row = 0; row < this.rows; row++) {
        this.cachedLines[row] = this.buildRow(row, defaultBgHex);
      }
      this.dirtyRows.clear();
      return [...this.cachedLines];
    }

    // Only rebuild dirty rows
    for (const row of this.dirtyRows) {
      if (row < this.rows) {
        this.cachedLines[row] = this.buildRow(row, defaultBgHex);
      }
    }
    this.dirtyRows.clear();

    return [...this.cachedLines];
  }
}
