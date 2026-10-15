#!/usr/bin/env python3
"""
DI safety check for unwiring workbench contributions.

For each entry point, compute the transitive import closure of src/ (current
working tree) and of a baseline git ref. Any service that was registered with
registerSingleton() in the baseline closure but is no longer registered in the
current closure is "lost". If a file that is still loaded injects a lost
service (constructor @IFoo or accessor.get(IFoo)), the workbench would fail at
runtime when that file is instantiated -> report it.

usage: di_check.py <repo> <baseline-ref> <entry.ts> [<entry.ts> ...]
"""
import os, re, subprocess, sys
from functools import lru_cache

repo, base_ref, entries = sys.argv[1], sys.argv[2], sys.argv[3:]
os.chdir(repo)

IMPORT_RE = re.compile(r"""(?:^|\n)\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]""")
DYN_RE = re.compile(r"""import\(\s*['"](\.[^'"]+)['"]\s*\)""")
REG_RE = re.compile(r"registerSingleton\(\s*(I[A-Za-z0-9_]+)")
INJ_RE = re.compile(r"@(I[A-Za-z0-9_]+)\b|\.get\(\s*(I[A-Za-z0-9_]+)\s*\)")

def reader(ref):
    if ref is None:
        def read(p):
            try:
                return open(p, encoding='utf8').read()
            except FileNotFoundError:
                return None
        return read
    def read(p):
        try:
            return subprocess.run(['git', 'show', f'{ref}:{p}'], capture_output=True, check=True, text=True).stdout
        except subprocess.CalledProcessError:
            return None
    return lru_cache(maxsize=None)(read)

def resolve(frm, spec):
    p = os.path.normpath(os.path.join(os.path.dirname(frm), spec))
    if p.endswith('.js'):
        p = p[:-3] + '.ts'
    return p

def closure(read, entry):
    seen, stack = set(), [entry]
    while stack:
        f = stack.pop()
        if f in seen:
            continue
        src = read(f)
        if src is None:
            continue
        seen.add(f)
        for spec in IMPORT_RE.findall(src) + DYN_RE.findall(src):
            stack.append(resolve(f, spec))
    return seen

def registered(read, files):
    out = {}
    for f in files:
        for sid in REG_RE.findall(read(f) or ''):
            out.setdefault(sid, []).append(f)
    return out

cur, base = reader(None), reader(base_ref)
bad = 0
for entry in entries:
    cb, cc = closure(base, entry), closure(cur, entry)
    rb, rc = registered(base, cb), registered(cur, cc)
    lost = set(rb) - set(rc)
    print(f'== {entry}: {len(cb)} -> {len(cc)} files, {len(rb)} -> {len(rc)} services, {len(lost)} lost')
    for f in sorted(cc):
        src = cur(f) or ''
        for a, b in INJ_RE.findall(src):
            sid = a or b
            if sid in lost:
                bad += 1
                print(f'  MISSING {sid} (was in {rb[sid][0]}) <- {f}')
print('OK' if bad == 0 else f'{bad} unresolved injections')
sys.exit(1 if bad else 0)
