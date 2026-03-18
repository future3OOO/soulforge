#!/usr/bin/env bun
/**
 * Build script that uses Bun.build() JS API to enable the React Compiler
 * plugin during production builds. The CLI `bun build` does NOT support
 * plugins — only the JS API does.
 *
 * Usage:
 *   bun scripts/build.ts              — build to dist/
 *   bun scripts/build.ts --compile    — build standalone binary
 */
import { type BunPlugin } from "bun";

// ── React Compiler Plugin ────────────────────────────────────────────
const reactCompilerPlugin: BunPlugin = {
  name: "react-compiler",
  setup(build) {
    build.onLoad({ filter: /src\/.*\.tsx?$/ }, async ({ path, loader }) => {
      const { transformSync } = await import("@babel/core");
      const source = await Bun.file(path).text();
      const result = transformSync(source, {
        filename: path,
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
        parserOpts: { plugins: ["typescript", "jsx"] },
      });
      return { contents: result?.code ?? source, loader };
    });
  },
};

// ── Parse args ───────────────────────────────────────────────────────
const isCompile = process.argv.includes("--compile");

// ── Build ────────────────────────────────────────────────────────────
const start = performance.now();

const result = await Bun.build({
  entrypoints: ["src/boot.tsx"],
  outdir: isCompile ? undefined : "dist",
  target: "bun",
  external: ["react-devtools-core"],
  naming: "[dir]/index.[ext]",
  plugins: [reactCompilerPlugin],
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const elapsed = (performance.now() - start).toFixed(0);
const count = result.outputs.length;
console.log(
  `✓ Built ${count} artifact${count === 1 ? "" : "s"} with React Compiler in ${elapsed}ms`
);
