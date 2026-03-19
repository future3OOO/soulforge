import { describe, expect, test, beforeEach, spyOn } from "bun:test";
import { parseHeadlessArgs } from "../src/headless.js";

// Prevent process.exit from actually exiting during tests
let exitCode: number | undefined;
beforeEach(() => {
	exitCode = undefined;
	spyOn(process, "exit").mockImplementation((code) => {
		exitCode = (code as number) ?? 0;
		throw new Error(`EXIT:${String(exitCode)}`);
	});
	spyOn(process.stderr, "write").mockImplementation(() => true);
});

describe("parseHeadlessArgs", () => {
	test("returns null when no headless flags present", async () => {
		const result = await parseHeadlessArgs(["--session", "abc"]);
		expect(result).toBeNull();
	});

	test("parses --list-providers", async () => {
		const result = await parseHeadlessArgs(["--list-providers"]);
		expect(result).toEqual({ type: "list-providers" });
	});

	test("parses --list-models without provider", async () => {
		const result = await parseHeadlessArgs(["--list-models"]);
		expect(result).toEqual({ type: "list-models", provider: undefined });
	});

	test("parses --list-models with provider", async () => {
		const result = await parseHeadlessArgs(["--list-models", "anthropic"]);
		expect(result).toEqual({ type: "list-models", provider: "anthropic" });
	});

	test("parses --set-key", async () => {
		const result = await parseHeadlessArgs(["--set-key", "openai", "sk-123"]);
		expect(result).toEqual({ type: "set-key", provider: "openai", key: "sk-123" });
	});

	test("--set-key without args exits with error", async () => {
		try {
			await parseHeadlessArgs(["--set-key"]);
		} catch {}
		expect(exitCode).toBe(1);
	});

	test("parses --headless with prompt", async () => {
		const result = await parseHeadlessArgs(["--headless", "explain", "this", "code"]);
		expect(result).toEqual({
			type: "run",
			opts: {
				prompt: "explain this code",
				modelId: undefined,
				mode: undefined,
				json: false,
				events: false,
				quiet: false,
				maxSteps: undefined,
				timeout: undefined,
				cwd: undefined,
			},
		});
	});

	test("parses --model flag", async () => {
		const result = await parseHeadlessArgs([
			"--headless",
			"--model",
			"anthropic/claude-opus-4-6",
			"do",
			"it",
		]);
		expect(result!.type).toBe("run");
		if (result!.type === "run") {
			expect(result!.opts.modelId).toBe("anthropic/claude-opus-4-6");
			expect(result!.opts.prompt).toBe("do it");
		}
	});

	test("parses --model= syntax", async () => {
		const result = await parseHeadlessArgs([
			"--headless",
			"--model=openai/gpt-4o",
			"test",
		]);
		if (result!.type === "run") {
			expect(result!.opts.modelId).toBe("openai/gpt-4o");
		}
	});

	test("parses --json flag", async () => {
		const result = await parseHeadlessArgs(["--headless", "--json", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.json).toBe(true);
		}
	});

	test("parses --events flag", async () => {
		const result = await parseHeadlessArgs(["--headless", "--events", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.events).toBe(true);
		}
	});

	test("parses --quiet flag", async () => {
		const result = await parseHeadlessArgs(["--headless", "--quiet", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.quiet).toBe(true);
		}
	});

	test("parses -q shorthand", async () => {
		const result = await parseHeadlessArgs(["--headless", "-q", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.quiet).toBe(true);
		}
	});

	test("parses --max-steps", async () => {
		const result = await parseHeadlessArgs(["--headless", "--max-steps", "10", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.maxSteps).toBe(10);
		}
	});

	test("parses --timeout", async () => {
		const result = await parseHeadlessArgs(["--headless", "--timeout", "30000", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.timeout).toBe(30000);
		}
	});

	test("parses --cwd", async () => {
		const result = await parseHeadlessArgs(["--headless", "--cwd", "/tmp/project", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.cwd).toBe("/tmp/project");
		}
	});

	test("parses --mode default", async () => {
		const result = await parseHeadlessArgs(["--headless", "--mode", "default", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.mode).toBe("default");
		}
	});

	test("parses --mode architect", async () => {
		const result = await parseHeadlessArgs(["--headless", "--mode", "architect", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.mode).toBe("architect");
		}
	});

	test("parses --mode plan", async () => {
		const result = await parseHeadlessArgs(["--headless", "--mode", "plan", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.mode).toBe("plan");
		}
	});

	test("parses --mode auto", async () => {
		const result = await parseHeadlessArgs(["--headless", "--mode", "auto", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.mode).toBe("auto");
		}
	});

	test("invalid --mode exits with error", async () => {
		try {
			await parseHeadlessArgs(["--headless", "--mode", "invalid", "test"]);
		} catch {}
		expect(exitCode).toBe(1);
	});

	test("all flags combined", async () => {
		const result = await parseHeadlessArgs([
			"--headless",
			"--model",
			"xai/grok-3",
			"--mode",
			"architect",
			"--json",
			"--max-steps",
			"5",
			"--timeout",
			"60000",
			"--cwd",
			"/tmp",
			"analyze",
			"the",
			"code",
		]);
		if (result!.type === "run") {
			expect(result!.opts.prompt).toBe("analyze the code");
			expect(result!.opts.modelId).toBe("xai/grok-3");
			expect(result!.opts.mode).toBe("architect");
			expect(result!.opts.json).toBe(true);
			expect(result!.opts.maxSteps).toBe(5);
			expect(result!.opts.timeout).toBe(60000);
			expect(result!.opts.cwd).toBe("/tmp");
		}
	});

	test("skips --session args", async () => {
		const result = await parseHeadlessArgs(["--headless", "--session", "abc123", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.prompt).toBe("test");
		}
	});

	test("skips --resume= args", async () => {
		const result = await parseHeadlessArgs(["--headless", "--resume=abc123", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.prompt).toBe("test");
		}
	});

	test("--headless without prompt exits with usage", async () => {
		// Mock stdin as TTY so it doesn't try to read stdin
		const origIsTTY = process.stdin.isTTY;
		Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
		try {
			await parseHeadlessArgs(["--headless"]);
		} catch {}
		Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
		expect(exitCode).toBe(1);
	});

	test("management commands take precedence over --headless", async () => {
		const result = await parseHeadlessArgs(["--headless", "--list-providers"]);
		expect(result).toEqual({ type: "list-providers" });
	});

	test("--events and --json are independent flags", async () => {
		const result = await parseHeadlessArgs(["--headless", "--events", "--json", "test"]);
		if (result!.type === "run") {
			expect(result!.opts.events).toBe(true);
			expect(result!.opts.json).toBe(true);
		}
	});

	test("unknown flags are ignored (not treated as prompt parts)", async () => {
		const result = await parseHeadlessArgs(["--headless", "--unknown-flag", "test"]);
		if (result!.type === "run") {
			// --unknown-flag is skipped because it starts with --
			expect(result!.opts.prompt).toBe("test");
		}
	});
});
