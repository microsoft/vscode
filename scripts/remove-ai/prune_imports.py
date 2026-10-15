#!/usr/bin/env python3
"""
Remove unused import specifiers reported by tsc (TS6133 / TS6192 / TS6196)
in the given files. Reads raw tsc output (with line,col) from stdin.

usage: tsc ... | prune_imports.py <file> [<file> ...]
Only touches import declarations; anything else is reported and left alone.
"""
import re, sys
from collections import defaultdict

targets = set(sys.argv[1:])
ERR = re.compile(r"^(?P<f>[^(]+)\((?P<l>\d+),(?P<c>\d+)\): error (?P<code>TS6133|TS6192|TS6196): (?P<msg>.*)$")
hits = defaultdict(list)
for line in sys.stdin:
    m = ERR.match(line.strip())
    if m and m['f'] in targets:
        name = re.search(r"'([^']+)'", m['msg'])
        hits[m['f']].append((int(m['l']), m['code'], name.group(1) if name else None))

IMPORT = re.compile(r"^import\s+(type\s+)?\{(?P<names>[^}]*)\}\s+from\s+(?P<src>'[^']+'|\"[^\"]+\");?\s*$", re.S)
DEFAULT_OR_NS = re.compile(r"^import\s+(type\s+)?(\*\s+as\s+)?[A-Za-z0-9_$]+\s+from\s+('[^']+'|\"[^\"]+\");?\s*$", re.S)

for f, errs in hits.items():
    lines = open(f, encoding='utf8').read().split('\n')
    # map each line -> (start, end) of the import statement covering it
    stmts = []
    i = 0
    while i < len(lines):
        if lines[i].startswith('import '):
            j = i
            while not re.search(r"from\s+['\"][^'\"]+['\"];?\s*$|^import\s+['\"][^'\"]+['\"];?\s*$", lines[j]):
                j += 1
            stmts.append((i, j))
            i = j + 1
        else:
            i += 1
    def stmt_for(lineno):
        for s, e in stmts:
            if s <= lineno - 1 <= e:
                return s, e
        return None
    unused = defaultdict(set)
    whole = set()
    for l, code, name in errs:
        st = stmt_for(l)
        if not st:
            print(f'  skip (not an import): {f}:{l} {name}')
            continue
        if code == 'TS6192' or name is None:
            whole.add(st)
        else:
            unused[st].add(name)
    edits = {}
    for st in set(unused) | whole:
        s, e = st
        text = '\n'.join(lines[s:e + 1])
        if st in whole or DEFAULT_OR_NS.match(text):
            edits[st] = None
            continue
        m = IMPORT.match(text)
        if not m:
            print(f'  skip (unparsed import): {f}:{s+1}')
            continue
        specs = [x.strip() for x in m['names'].split(',') if x.strip()]
        def local(spec):
            return re.split(r"\s+as\s+", spec.replace('type ', '', 1))[-1].strip()
        keep = [x for x in specs if local(x) not in unused[st]]
        if not keep:
            edits[st] = None
        else:
            edits[st] = f"import {m.group(1) or ''}{{ {', '.join(keep)} }} from {m['src']};"
    for (s, e) in sorted(edits, reverse=True):
        rep = edits[(s, e)]
        lines[s:e + 1] = [] if rep is None else [rep]
    open(f, 'w', encoding='utf8').write('\n'.join(lines))
    print(f'{f}: {sum(1 for v in edits.values() if v is None)} imports removed, {sum(1 for v in edits.values() if v)} trimmed')
