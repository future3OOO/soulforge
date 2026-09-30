#!/usr/bin/env python3
"""Python import edges: this fork's map vs Empryo 3.8.7-beta's (upstream #210 fix).

Usage: python_imports_probe.py <fork dist/bin.sh> <empryo-3.8.7 binary> <pre-port dist/bin.sh> [check...]
checks: oracle (default: 3.8.7's import-derived .py pairs on three Python repos plus exactly the
`from pkg import submodule` pairs 3.8.7 omits), lifecycle (a
pre-port map is re-indexed once, then converges; removing an import drops its pair), others
(every non-.py reference pair unchanged from the pre-port build on two TypeScript repos), bindings
(each import reference in a generated repo binds to the expected file).
3.8.7 runs with an isolated HOME so its ~/.soulforge migration cannot touch the real one. The oracle,
lifecycle and others checks require the local checkouts pinned below; bindings needs neither."""
import ast, json, os, sqlite3, subprocess, sys, tempfile
from pathlib import Path

FORK, E387, PREPORT = map(os.path.abspath, sys.argv[1:4])
CHECKS = sys.argv[4:] or ["oracle"]
REPOS = [("repo-context-forge", "/home/prop_/projects/repo-context-forge", "f2252a4a2b60d0845c55e60d9af3cbe968ed6689"),
         ("codex-skills", "/home/prop_/projects/.worktrees/codex-skills-issue107", "35a6c698"),
         ("sqlite-utils", "/home/prop_/dswe-run-issue95/armX7R2/app", "8d74ffc9")]
FAIL = []


def clone(tmp, name, src, rev):
    dst = tmp / f"{name}-{len(list(tmp.iterdir()))}"
    subprocess.run(["git", "clone", "-q", "--shared", "--no-checkout", src, str(dst)], check=True)
    subprocess.run(["git", "-C", str(dst), "checkout", "-q", "-B", "probe", rev], check=True)
    return dst


def submodule_pairs(repo):
    """(importer, submodule file) for every `from pkg import m` naming a repository package's submodule."""
    out = set()
    for f in subprocess.run(["git", "-C", str(repo), "ls-files", "*.py"], capture_output=True, text=True, check=True).stdout.split():
        for node in ast.walk(ast.parse((repo / f).read_bytes())):
            if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                rel = node.module.replace(".", "/")
                pkg = next((d for d in (repo / rel, (repo / f).parent / rel) if (d / "__init__.py").exists()), None)
                for alias in node.names if pkg else ():
                    sub = next((p for p in (pkg / f"{alias.name}.py", pkg / alias.name / "__init__.py") if p.exists()), None)
                    if sub:
                        out.add((f, str(sub.relative_to(repo))))
    return out


BINDINGS = {
    ("pkg/a_first.py", "z_last"): "pkg/z_last.py", ("pkg/a_first.py", "pkg"): "pkg/__init__.py",
    ("tests/test_z.py", "z_last"): "pkg/z_last.py", ("tests/test_z.py", "pkg"): "pkg/__init__.py",
    ("app/main.py", "helper"): "pkg/__init__.py", ("app/main.py", "pkg"): "pkg/__init__.py",
    ("app/main.py", "z_last"): "pkg/z_last.py", ("app/main.py", "sub"): "pkg/sub/__init__.py",
    ("app/main.py", "shadow"): "pkg/shadow.py",
    ("pkg/rel.py", "z_last"): "pkg/z_last.py", ("pkg/rel.py", "zz"): "pkg/z_last.py",
    ("app/self.py", "mylib"): "mylib/__init__.py", ("app/self_ab.py", "b"): "a/b/__init__.py",
    ("app/self_from.py", "mylib"): {"mylib/__init__.py", "mylib/mylib.py"},
    ("app/unicode.py", "child"): "café/child.py",
    ("app/unicode.py", "モジュール"): "app/モジュール.py",
}
BINDINGS_REPO = {
    "pkg/__init__.py": "def helper():\n    return 1\n\n\ndef shadow():\n    return 2\n",
    "pkg/a_first.py": "from pkg import z_last\n\nZ = z_last.zz\n",
    "pkg/z_last.py": "def zz():\n    return 3\n",
    "pkg/shadow.py": "S = 4\n",
    "pkg/sub/__init__.py": "def inner():\n    return 5\n",
    "pkg/rel.py": "from . import z_last\nfrom .z_last import zz\n",
    "app/main.py": "from pkg import helper, z_last\nfrom pkg import z_last as aliased\nfrom pkg import sub\nfrom pkg import shadow\n",
    "tests/test_z.py": "from pkg import z_last\n",
    "mylib/__init__.py": "from .other import go\n\n\ndef helper():\n    return 6\n", "mylib/mylib.py": "M = 7\n",
    "mylib/other.py": "def go():\n    return 10\n",
    "a/__init__.py": "", "a/b/__init__.py": "def leaf():\n    return 8\n", "a/b/b.py": "B = 9\n",
    "app/self.py": "import mylib\n\nmylib.go()\n", "app/self_helper.py": "from mylib import helper\n",
    "app/self_ab.py": "import a.b\nfrom a.b import leaf\n",
    "app/self_from.py": "from mylib import mylib\n",
    "café/__init__.py": "", "café/child.py": "VALUE = 11\n", "app/unicode.py": "from café import child\nimport モジュール\n",
    "app/モジュール.py": "V = 12\n",
}


def fork_map(repo, home, binary=None):
    """Map `repo` with `binary` (the fork by default); returns (repomap.db path, rendered content)."""
    env = {**os.environ, "HOME": str(home)}
    p = subprocess.run([binary or FORK, "--headless", "--render-map"], cwd=repo, env=env, capture_output=True, text=True, timeout=900)
    if p.returncode != 0:
        raise RuntimeError(f"fork map failed: {p.stderr[-300:]}")
    return repo / ".soulforge" / "repomap.db", json.loads(p.stdout)["content"]


def e387_map(repo, home):
    (home / ".empryo").mkdir(parents=True, exist_ok=True)
    (home / ".empryo" / "config.json").write_text(json.dumps({"defaultModel": "codex/gpt-5.6-sol", "telemetry": False}))
    subprocess.run([E387, "--headless", "--quiet", "--timeout", "1", "x"], cwd=repo,
                   env={**os.environ, "HOME": str(home)}, capture_output=True, timeout=900)
    db = repo / ".empryo" / "genome.db"
    if not db.exists():
        raise RuntimeError("3.8.7 produced no genome.db")
    return db


with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp); home = tmp / "home"; (home / ".soulforge").mkdir(parents=True)
    (home / ".soulforge" / "config.json").write_text(json.dumps({"defaultModel": "none", "telemetry": False}))
    def pairs(db, keep, imports_only=True):
        c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        q = ("select distinct a.path, b.path from refs r join files a on a.id=r.file_id "
             "join files b on b.id=r.source_file_id where a.path != b.path"
             + (" and r.import_source is not null" if imports_only else ""))
        return {(s, t) for s, t in c.execute(q) if keep(s)}

    def is_py(path):
        return path.endswith(".py")

    if "oracle" in CHECKS:
        for name, src, rev in REPOS:
            repo = clone(tmp, name, src, rev)
            ours = pairs(fork_map(repo, home)[0], is_py)
            theirs = pairs(e387_map(clone(tmp, name, src, rev), tmp / "e387home"), is_py)
            submodules = submodule_pairs(repo)
            print(f"{name}: fork {len(ours)} .py import pairs, 3.8.7 {len(theirs)}, submodule pairs {len(submodules & ours)}/{len(submodules)}")
            if submodules - ours:
                FAIL.append(f"PY_SUBMODULE_PAIR_MISSING {name}: {sorted(submodules - ours)[:6]}")
            if theirs - ours or ours - theirs - submodules or not theirs:
                FAIL.append(f"PYTHON_IMPORT_EDGES_DIFFER {name}: missing {sorted(theirs - ours)[:6]} extra {sorted(ours - theirs - submodules)[:6]}")
    if "lifecycle" in CHECKS:
        name, src, rev = REPOS[0]
        cold = pairs(fork_map(clone(tmp, name, src, rev), home)[0], is_py)
        warm_repo = clone(tmp, name, src, rev)
        fork_map(warm_repo, home, PREPORT)
        db, warm_content = fork_map(warm_repo, home)
        warm = pairs(db, is_py)
        if warm != cold or not warm:
            FAIL.append(f"PREPORT_MAP_NOT_REINDEXED: warm {len(warm)} vs cold {len(cold)} pairs; missing {sorted(cold - warm)[:4]}")

        def ids():
            c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            return set(r[0] for r in c.execute("select id from symbols")), c.execute("select value from meta where key='index_schema_version'").fetchone()
        before = ids()
        with sqlite3.connect(db) as c:
            c.execute("delete from meta where key like 'rendered_map%'")
        if fork_map(warm_repo, home)[1] != warm_content:
            FAIL.append("PREPORT_MAP_NOT_REINDEXED: the pre-port map's cached render was served")
        if ids() != before:
            FAIL.append("PREPORT_MAP_NOT_REINDEXED: an unchanged repeat scan re-created symbol rows or changed the schema version")
        target = warm_repo / "repo_context_forge.py"
        target.write_text("\n".join(l for l in target.read_text().splitlines() if l.strip() != "import workflow_index") + "\n")
        fork_map(warm_repo, home)
        if ("repo_context_forge.py", "workflow_index.py") in pairs(db, is_py):
            FAIL.append("PREPORT_MAP_NOT_REINDEXED: removed import still recorded")
    if "others" in CHECKS:
        for name, src, rev in (("empryo", str(Path(__file__).resolve().parents[2]), "669ff919"), ("gitnexus", "/home/prop_/projects/wt-gitnexus-212", "04768061")):
            base = pairs(fork_map(clone(tmp, name, src, rev), home, PREPORT)[0], lambda p: not is_py(p), False)
            cand = pairs(fork_map(clone(tmp, name, src, rev), home)[0], lambda p: not is_py(p), False)
            print(f"{name}: non-.py reference pairs pre-port {len(base)}, candidate {len(cand)}")
            if base != cand or not base:
                FAIL.append(f"OTHER_LANG_IMPORT_EDGES_CHANGED {name}: lost {sorted(base - cand)[:4]} gained {sorted(cand - base)[:4]}")
    if "bindings" in CHECKS:
        repo = tmp / "bindings"
        for path, text in BINDINGS_REPO.items():
            (repo / path).parent.mkdir(parents=True, exist_ok=True); (repo / path).write_text(text)
        subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
        subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
        subprocess.run(["git", "-c", "user.email=t@e", "-c", "user.name=t", "commit", "-qm", "init"], cwd=repo, check=True)
        c = sqlite3.connect(f"file:{fork_map(repo, home)[0]}?mode=ro", uri=True)
        got = {}
        for importer, ref, target in c.execute("select a.path, r.name, b.path from refs r join files a on a.id=r.file_id "
                                               "left join files b on b.id=r.source_file_id where r.import_source is not null"):
            got.setdefault((importer, ref), set()).add(target)
        wrong = {k: got.get(k) for k, v in BINDINGS.items() if got.get(k) != (v if isinstance(v, set) else {v})}
        print(f"bindings: {len(BINDINGS) - len(wrong)}/{len(BINDINGS)} as expected")
        if wrong:
            FAIL.append(f"PY_IMPORT_BINDING_WRONG: {sorted(wrong.items())}")
        targets = {row[0] for row in c.execute("select b.path from edges e join files a on a.id=e.source_file_id "
                                               "join files b on b.id=e.target_file_id where a.path='app/self.py'")}
        if not {"mylib/__init__.py", "mylib/other.py"} <= targets:
            FAIL.append(f"PACKAGE_EXPORT_EDGE_MISSING: {sorted(targets)}")
for f in FAIL:
    print("FAIL", f)
print("OK" if not FAIL else "FAILED")
sys.exit(1 if FAIL else 0)
