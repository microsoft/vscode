#!/usr/bin/env python3
"""Analyze Chrome/Electron memory-infra dumps in a JSON trace.

Modes:
  rank      - rank processes by private footprint and break each one down by the
              major allocator pools (malloc, v8, partition_alloc, blink_gc, cc,
              gpu, ...). A process with v8/blink keeps memory in SEVERAL separate
              pools; `malloc` alone badly undercounts it.
  breakdown - full per-pool breakdown for one process, including the v8 isolate
              heaps and partition_alloc / blink_gc sub-dumps.
  heap      - aggregate native heap-profiler (heaps_v2) allocations for one
              process by call stack, so you can see where allocations come from.

Works on the raw trace and on a trace already symbolized by catapult's
`symbolize_trace` (the only difference is whether stack frames read as
`pc:<addr>` or real function names).

Usage:
  analyze_memory.py rank      <trace.json>
  analyze_memory.py breakdown <trace.json> [--pid N]
  analyze_memory.py heap      <trace.json> [--pid N] [--top 40] [--by stack|leaf]
"""
import argparse
import collections
import json


def load(path):
    with open(path) as f:
        data = json.load(f)
    return data['traceEvents'] if isinstance(data, dict) else data


def hex_or_int(v):
    if v is None:
        return 0
    if isinstance(v, int):
        return v
    try:
        return int(v, 16)
    except ValueError:
        return int(v)


def pid_names(events):
    names = {}
    for e in events:
        if e.get('ph') == 'M' and e.get('name') == 'process_name':
            names[e.get('pid')] = e.get('args', {}).get('name')
    return names


def iter_dumps(events):
    """Yield (pid, dumps) for every memory dump that carries a 'dumps' object."""
    for e in events:
        a = e.get('args', {})
        dumps = a.get('dumps') if isinstance(a, dict) else None
        if dumps:
            yield e.get('pid'), dumps


def mb(n):
    return n / 1048576.0


def attr_bytes(node, name):
    v = (node.get('attrs') or {}).get(name)
    if isinstance(v, dict):
        return hex_or_int(v.get('value'))
    return 0


def footprint(dump):
    return hex_or_int((dump.get('process_totals') or {}).get('private_footprint_bytes'))


def peak_resident(dump):
    return hex_or_int((dump.get('process_totals') or {}).get('peak_resident_set_size'))


def dumps_by_pid(events):
    """pid -> list of ALL dumps (light + detailed)."""
    out = collections.defaultdict(list)
    for pid, d in iter_dumps(events):
        out[pid].append(d)
    return out


def peak_footprint(dumps):
    return max((footprint(d) for d in dumps), default=0)


def peak_rss(dumps):
    return max((peak_resident(d) for d in dumps), default=0)


def richest_alloc_dump(dumps):
    """The detailed dump with the largest total tracked allocation.

    footprint lives in frequent light dumps; the full allocator tree lives in
    periodic detailed dumps (whose process_totals may read 0). So the pool
    breakdown is taken from the detailed dump with the most tracked bytes,
    independent of which dump carries the peak footprint.
    """
    detailed = [d for d in dumps if d.get('allocators')]
    if not detailed:
        return None
    return max(detailed, key=lambda d: sum(sz for sz, _ in pools(d).values()))


def pools(dump):
    """Top-level allocator pools: name -> (size, effective_size).

    Each top-level allocator is a SEPARATE pool of memory. malloc, partition_alloc
    and the v8 heap do not overlap, so summing only `malloc` misses most of a
    renderer's memory.
    """
    allocs = dump.get('allocators') or {}
    out = {}
    for k, node in allocs.items():
        if '/' in k:
            continue
        out[k] = (attr_bytes(node, 'size'), attr_bytes(node, 'effective_size'))
    return out


def sub(dump, prefix, maxdepth):
    """Return {path: size} for allocator paths under `prefix` up to maxdepth slashes."""
    allocs = dump.get('allocators') or {}
    out = {}
    for k, node in allocs.items():
        if (k == prefix or k.startswith(prefix + '/')) and k.count('/') <= maxdepth:
            out[k] = attr_bytes(node, 'size')
    return out


# Pools shown as columns in `rank` (others still counted in breakdown).
RANK_POOLS = ['malloc', 'v8', 'partition_alloc', 'blink_gc', 'cc', 'gpu']


def rank(events):
    names = pid_names(events)
    by_pid = dumps_by_pid(events)

    rows = []
    for pid, dumps in by_pid.items():
        d = richest_alloc_dump(dumps)
        p = pools(d) if d else {}
        rows.append((peak_footprint(dumps), pid, p))
    rows.sort(reverse=True)

    hdr = '%-8s %-26s %10s' % ('pid', 'name', 'footprint')
    for name in RANK_POOLS:
        hdr += ' %10s' % name
    print(hdr + '   (MB)')
    for foot, pid, p in rows:
        line = '%-8s %-26s %10.1f' % (pid, (names.get(pid, '?') or '?')[:26], mb(foot))
        for name in RANK_POOLS:
            line += ' %10.1f' % mb(p.get(name, (0, 0))[0])
        print(line)

    if rows:
        top = rows[0]
        print('\nMax-memory process: pid=%s (%s), footprint %.1f MB' % (
            top[1], names.get(top[1], '?'), mb(top[0])))
        print('Run `breakdown --pid %s` for the full per-pool view.' % top[1])
        return top[1]
    return None


def breakdown(events, pid):
    names = pid_names(events)
    by_pid = dumps_by_pid(events)
    if pid is None:
        pid = rank(events)
        print()
    dumps = by_pid.get(pid)
    d = richest_alloc_dump(dumps) if dumps else None
    if not d:
        print('No detailed memory dump for pid', pid)
        return

    print('pid=%s (%s)' % (pid, names.get(pid, '?')))
    rss = peak_rss(dumps)
    line = '  private_footprint = %.1f MB' % mb(peak_footprint(dumps))
    if rss:
        line += '   peak_RSS = %.1f MB' % mb(rss)
    print(line)

    p = pools(d)
    tracked = sum(sz for sz, _ in p.values())
    print('\n  Allocator pools (separate memory pools; sizes overlap via ownership,')
    print('  so they do NOT sum to footprint):\n')
    print('    %-20s %12s %12s' % ('pool', 'size_MB', 'effective_MB'))
    for name, (sz, eff) in sorted(p.items(), key=lambda kv: -kv[1][0]):
        if sz == 0 and eff == 0:
            continue
        print('    %-20s %12.1f %12.1f' % (name, mb(sz), mb(eff)))
    print('    %-20s %12.1f' % ('(sum of pools)', mb(tracked)))

    # V8 isolate heaps — the part `malloc` never sees.
    v8 = sub(d, 'v8', 2)
    if v8:
        print('\n  V8 heaps:')
        for k in sorted(v8):
            if k.endswith('/heap') or k.endswith('/read_only_space') or k in ('v8/main', 'v8/workers', 'v8/shared'):
                print('    %-40s %10.1f MB' % (k, mb(v8[k])))

    # PartitionAlloc partitions.
    pa = sub(d, 'partition_alloc/partitions', 2) or sub(d, 'partition_alloc', 1)
    if pa:
        print('\n  PartitionAlloc:')
        for k in sorted(pa, key=lambda x: -pa[x]):
            if pa[k]:
                print('    %-40s %10.1f MB' % (k, mb(pa[k])))

    # Blink GC (Oilpan).
    bg = sub(d, 'blink_gc', 2)
    if bg:
        print('\n  Blink GC (Oilpan):')
        for k in sorted(bg, key=lambda x: -bg[x]):
            if bg[k] and k.count('/') <= 2:
                print('    %-40s %10.1f MB' % (k, mb(bg[k])))



def collect_heap(events, pid):
    """Collect a pid's heaps_v2 data.

    Chrome emits the maps (nodes/strings/types) INCREMENTALLY: the first detailed
    dump carries the full dictionary and later dumps reuse those ids with empty
    maps. So we merge nodes/strings across every dump (ascending ts) and pick the
    richest allocator snapshot to aggregate.
    """
    dumps = []
    for p, d in iter_dumps(events):
        if (pid is None or p == pid) and d.get('heaps_v2'):
            dumps.append((d, p))
    if not dumps:
        return None, None, pid

    merged_nodes = {}
    merged_strings = {}
    best_alloc = None
    best_n = -1
    found_pid = pid
    for d, p in dumps:
        hv2 = d['heaps_v2']
        maps = hv2.get('maps') or {}
        for s in maps.get('strings') or []:
            merged_strings[s['id']] = s['string']
        for n in maps.get('nodes') or []:
            merged_nodes[n['id']] = n
        m = (hv2.get('allocators') or {}).get('malloc') or {}
        n = len(m.get('sizes') or [])
        if n > best_n:
            best_alloc, best_n, found_pid = m, n, p

    return (merged_nodes, merged_strings), best_alloc, (pid if pid is not None else found_pid)


def build_stack_resolver(nodes, strings):
    cache = {}

    def stack_for(node_id):
        if node_id in cache:
            return cache[node_id]
        frames = []
        cur = node_id
        seen = set()
        while cur is not None and cur in nodes and cur not in seen:
            seen.add(cur)
            n = nodes[cur]
            frames.append(strings.get(n.get('name_sid'), '??'))
            cur = n.get('parent')
        cache[node_id] = frames  # leaf -> root
        return frames

    return stack_for


# Leaf frames that are pure allocator / heap-sampler plumbing. They are the same
# on every sampled stack, so we strip them to surface the real allocation site.
_PLUMBING = (
    'SamplingHeapProfiler', 'PoissonAllocationSampler', 'allocator::dispatcher',
    'AllocFn', 'ReallocFn', 'operator new', 'MallocZoneMalloc', 'malloc_zone',
    'partition_alloc', 'PartitionAlloc', 'base::internal::',
)


def strip_plumbing(frames):
    i = 0
    while i < len(frames) and any(p in frames[i] for p in _PLUMBING):
        i += 1
    return frames[i:] if i < len(frames) else frames


def heap(events, pid, top, by):
    maps, m, pid = collect_heap(events, pid)
    if not m:
        print('No heaps_v2 data for pid', pid)
        return
    nodes, strings = maps
    names = pid_names(events)
    sizes = m['sizes']
    counts = m.get('counts', [0] * len(sizes))
    leaf_nodes = m['nodes']
    stack_for = build_stack_resolver(nodes, strings)

    total = sum(sizes)
    print('Process pid=%s (%s): %d malloc samples, %.1f MB sampled\n' % (
        pid, names.get(pid, '?'), len(sizes), total / 1048576.0))

    by_size = collections.Counter()
    by_cnt = collections.Counter()
    for i, node_id in enumerate(leaf_nodes):
        frames = strip_plumbing(stack_for(node_id))
        if by == 'leaf':
            key = frames[0] if frames else '??'
        else:
            # Top frames (allocation site -> caller) after stripping plumbing.
            key = ' <- '.join(frames[:6]) if frames else '??'
        by_size[key] += sizes[i]
        by_cnt[key] += counts[i]

    print('Top %d allocation sites by sampled bytes (%s, allocator plumbing stripped):\n' % (top, by))
    for key, sz in by_size.most_common(top):
        print('%9.2f MB  x%-8d  %s' % (sz / 1048576.0, by_cnt[key], key))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('mode', choices=['rank', 'breakdown', 'heap'])
    ap.add_argument('trace')
    ap.add_argument('--pid', type=int, default=None)
    ap.add_argument('--top', type=int, default=40)
    ap.add_argument('--by', choices=['stack', 'leaf'], default='stack')
    args = ap.parse_args()

    events = load(args.trace)
    if args.mode == 'rank':
        rank(events)
    elif args.mode == 'breakdown':
        breakdown(events, args.pid)
    else:
        pid = args.pid
        if pid is None:
            pid = rank(events)
            print()
        heap(events, pid, args.top, args.by)


if __name__ == '__main__':
    main()
