#!/usr/bin/env python3
"""Real-Seam probes for `soulforge --headless --render-map` against the built CLI.

Usage: python3 tests/render-map/probe.py <dist/bin.sh> [check...]
Each check prints its marker on failure and exits 1. Runs in throwaway repos under
an isolated HOME whose config names no usable model, so any model resolution fails."""
import json, os, sqlite3, subprocess, sys, tempfile
from pathlib import Path

BIN = os.path.abspath(sys.argv[1])
SRC = Path(__file__).resolve().parents[2]
FAIL = []


def fail(marker, detail):
    FAIL.append(marker)
    print(f"FAIL {marker}: {detail}")


def make_repo(root, files):
    root.mkdir(parents=True, exist_ok=True)
    for path, text in files.items():
        (root / path).parent.mkdir(parents=True, exist_ok=True)
        (root / path).write_text(text)
    for cmd in (["git", "init", "-q"], ["git", "config", "user.email", "t@e"], ["git", "config", "user.name", "t"],
                ["git", "add", "-A"], ["git", "commit", "-qm", "init"]):
        subprocess.run(cmd, cwd=root, check=True, capture_output=True)


def home(tmp, extra=None):
    h = tmp / "home"; (h / ".soulforge").mkdir(parents=True, exist_ok=True)
    cfg = {"defaultModel": "none", "telemetry": False, "onboardingComplete": True,
           "semanticSummaries": "synthetic", "repoMapTokenBudget": 4000, **(extra or {})}
    (h / ".soulforge" / "config.json").write_text(json.dumps(cfg))
    return h


def run(args, cwd, h, env=None, timeout=180):
    e = {**os.environ, "HOME": str(h), **(env or {})}
    e.pop("OPENAI_API_KEY", None)
    return subprocess.run([BIN, "--headless", *args], cwd=cwd, env=e, capture_output=True, text=True, timeout=timeout)


def oracle(repo, opts):
    script = f"""
import {{ RepoMap }} from "{SRC}/src/core/intelligence/repo-map.ts";
const m = new RepoMap({json.dumps(str(repo))});
await m.scan();
const r = m.render({json.dumps(opts)});
console.log(JSON.stringify({{paths: m.lastRenderedPaths, content: r, stats: m.getStats()}}));
"""
    p = subprocess.run(["bun", "-e", script], cwd=SRC, capture_output=True, text=True, timeout=180)
    if p.returncode != 0:
        raise RuntimeError(p.stderr[-800:])
    return json.loads(p.stdout.strip().splitlines()[-1])


FILES = {"src/a.py": "import src.b\nimport src.c\n\ndef a():\n    return 1\n",
         "src/b.py": "def b():\n    return 2\n", "src/c.py": "def c():\n    return 3\n",
         **{f"tools/low{i}.py": f"def low{i}():\n    return {i}\n" for i in range(12)}}


def render(repo, h, *args):
    p = run(["--render-map", *args], repo, h)
    try:
        return p, (json.loads(p.stdout) if p.returncode == 0 else {})
    except ValueError:
        return p, {}


def check_json(tmp, h, repo):
    p, out = render(repo, h)
    if p.returncode != 0 or not out.get("paths") or not all(x in out.get("content", "") for x in out["paths"]):
        return fail("RENDER_MAP_NOT_AVAILABLE", f"rc={p.returncode} stdout={p.stdout[:200]!r} stderr={p.stderr[-300:]!r}")
    db = sqlite3.connect(f"file:{repo}/.soulforge/repomap.db?mode=ro", uri=True)
    counts = {t: db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("files", "symbols")}
    if out.get("stats", {}).get("files") != counts["files"] or out["stats"].get("symbols") != counts["symbols"]:
        fail("RENDER_MAP_NOT_AVAILABLE", f"stats {out.get('stats')} != db {counts}")


def check_personalization(tmp, h, repo):
    _, base = render(repo, h)
    low = "tools/low7.py"
    for flag, key in (("--mention", "mentionedFiles"), ("--edited", "editedFiles")):
        _, cli = render(repo, h, flag, low)
        ora = oracle(repo, {key: [str(repo / low)], "tokenBudget": 4000})
        if cli.get("paths") != ora["paths"]:
            fail("RENDER_MAP_PERSONALIZATION_IGNORED", f"{flag}: cli={cli.get('paths')} oracle={ora['paths']}")
        if cli.get("paths") == base.get("paths"):
            fail("RENDER_MAP_PERSONALIZATION_IGNORED", f"{flag}: paths unchanged from unpersonalized run")


def check_budget(tmp, h, repo):
    _, base = render(repo, h)
    _, cli = render(repo, h, "--map-budget", "60")
    ora = oracle(repo, {"tokenBudget": 60})
    if cli.get("content") != ora["content"] or cli.get("paths") != ora["paths"]:
        fail("RENDER_MAP_BUDGET_IGNORED", f"budget 60: cli paths={cli.get('paths')} oracle={ora['paths']}")
    if cli.get("content") == base.get("content"):
        fail("RENDER_MAP_BUDGET_IGNORED", "budget 60 content equals budget 4000 content")


def check_cwd(tmp, h, repo):
    other = tmp / "other"; make_repo(other, {"pkg/x.py": "X = 1\n", "pkg/y.py": "import pkg.x\n"})
    p, cli = render(repo, h, "--cwd", str(other), "--mention", "pkg/y.py")
    if not (other / ".soulforge" / "repomap.db").exists() or set(cli.get("paths", [])) - {"pkg/x.py", "pkg/y.py"} or not cli.get("paths"):
        return fail("RENDER_MAP_CWD_IGNORED", f"rc={p.returncode} paths={cli.get('paths')} stderr={p.stderr[-200:]!r}")
    ora = oracle(other, {"mentionedFiles": [str(other / "pkg/y.py")], "tokenBudget": 4000})
    if cli["paths"] != ora["paths"]:
        fail("RENDER_MAP_CWD_IGNORED", f"cli={cli['paths']} oracle={ora['paths']}")


def check_disabled(tmp, h, repo):
    h2 = home(tmp / "h2", {"repoMap": False})
    for label, args, hh, env in (("config", ["--render-map"], h2, None), ("flag", ["--render-map", "--no-repomap"], h, None),
                                 ("env", ["--render-map"], h, {"SOULFORGE_NO_REPOMAP": "1"})):
        p = run(args, repo, hh, env)
        if p.returncode == 0 or p.stdout.strip() or "map" not in p.stderr.lower():
            fail("RENDER_MAP_DISABLED_NOT_REFUSED", f"{label}: rc={p.returncode} stdout={p.stdout[:100]!r} stderr={p.stderr[-200:]!r}")


def check_timeout(tmp, h, repo):
    fresh = tmp / "fresh"; make_repo(fresh, FILES)
    try:
        p = run(["--render-map", "--map-wait-ms", "1"], fresh, h, timeout=60)
        if p.returncode == 0 or p.stdout.strip() or "map" not in p.stderr.lower():
            fail("RENDER_MAP_TIMEOUT_NOT_REFUSED", f"rc={p.returncode} stdout={p.stdout[:100]!r} stderr={p.stderr[-200:]!r}")
    except subprocess.TimeoutExpired:
        fail("RENDER_MAP_TIMEOUT_NOT_REFUSED", "process did not terminate within 60 s")


def check_large(tmp, h, repo):
    """A render above the 64 KiB pipe buffer must arrive whole through a pipe."""
    big = tmp / "big"
    make_repo(big, {f"pkg{i // 20}/mod{i}.py": "".join(f"def fn{i}_{k}(arg):\n    return {k}\n\n" for k in range(12)) for i in range(700)})
    p, cli = render(big, h, "--map-budget", "400000")
    if p.returncode != 0 or not cli or len(p.stdout) <= 65536:
        fail("RENDER_MAP_TRUNCATED", f"rc={p.returncode} bytes={len(p.stdout)} parsed={bool(cli)} stderr={p.stderr[-200:]!r}")


def check_operands(tmp, h, repo):
    """A missing, flag-valued or non-numeric render-map operand is refused, never guessed."""
    for args in (["--mention", "--edited", "src/a.py"], ["--edited"], ["--map-budget", "60junk"], ["--map-budget", "abc"],
                 ["--map-budget", "0"], ["--map-wait-ms", "abc"], ["--map-wait-ms"]):
        p = run(["--render-map", *args], repo, h, timeout=60)
        if p.returncode == 0 or p.stdout.strip() or args[0] not in p.stderr:
            fail("RENDER_MAP_OPERAND_ACCEPTED", f"{args}: rc={p.returncode} stdout={p.stdout[:80]!r} stderr={p.stderr[-160:]!r}")


def check_operand_range(tmp, h, repo):
    """A numeric operand past the safe range is refused, never rounded or turned into Infinity."""
    for flag in ("--map-budget", "--map-wait-ms"):
        for value in ("9" * 400, "9007199254740993"):
            p = run(["--render-map", flag, value], repo, h, timeout=60)
            if p.returncode == 0 or p.stdout.strip() or flag not in p.stderr:
                fail("RENDER_MAP_OPERAND_OUT_OF_RANGE", f"{flag} {value[:20]}({len(value)} digits): rc={p.returncode}")


CHECKS = {"json": check_json, "large": check_large, "personalization": check_personalization, "budget": check_budget,
          "cwd": check_cwd, "disabled": check_disabled, "timeout": check_timeout, "operands": check_operands,
          "operand_range": check_operand_range}

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp); h = home(tmp); repo = tmp / "repo"; make_repo(repo, FILES)
    for name in sys.argv[2:] or CHECKS:
        CHECKS[name](tmp, h, repo)

print("OK" if not FAIL else f"FAILED {sorted(set(FAIL))}")
sys.exit(1 if FAIL else 0)
