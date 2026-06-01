---
name: obi-observe
description: "Observe outbound HTTP/gRPC and TLS traffic from a running Code OSS / VS Code dev instance with zero code changes, using OBI (OpenTelemetry eBPF Instrumentation) as the producer and the Aspire Dashboard as a local OTLP viewer. Use when you want a unified, per-process view of what every VS Code child process (main, renderer, ext host, pty host, language servers, Copilot CLI subprocesses) is doing on the wire — and to correlate those wire spans with the higher-level `invoke_agent` / `chat` / `execute_tool` spans emitted by the Copilot Chat extension."
---

# OBI + Aspire for a running VS Code instance

This skill stands up two throwaway containers on Linux:

- **Aspire Dashboard** — local OTLP viewer (UI on `:18888`, OTLP gRPC on `:4317`, OTLP HTTP on `:4318`). No cloud account, no .NET install.
- **OBI** (OpenTelemetry eBPF Instrumentation) — attaches eBPF probes to every process whose executable path matches a glob (default: `*electron*`), and emits an outbound HTTP / gRPC / TCP span per request to the Aspire dashboard.

Together they give you a per-PID trace of every network call your dev VS Code makes — useful for perf-profiling chat turns, finding chatty extensions, and seeing where time goes between "user hits Enter" and "model first token".

## What you'll actually see (and what you won't)

| | OBI shows it? | Notes |
|---|---|---|
| Outbound HTTPS from ext host (Copilot LM, BYOK providers, marketplace) | ✅ method/path/status, if SSL uprobes attach | Node uses statically-linked OpenSSL. OBI's libssl uprobes work for most Node versions; if they don't attach you'll still see opaque TCP spans with timings. |
| Outbound HTTPS from renderer (Chromium fetches) | ⚠ partial | Chromium uses BoringSSL; OBI's coverage is patchier. Expect mostly TCP-level spans, sometimes decoded HTTP. |
| Outbound HTTPS from helper processes (telemetry, update, ripgrep registry, etc.) | ✅ if they're forks of electron | Matched by the same `*electron*` glob. |
| Per-PID attribution + service name | ✅ | OBI sets `service.name` from the executable name and `process.pid` on every span. Filter in the Aspire dashboard by `service.name`. |
| Renderer JS / paint / layout | ❌ | Use Chrome DevTools Performance panel on the workbench window for that. |
| IPC between renderer ↔ ext host | ❌ | That's Electron `MessagePort` / Mojo pipes, not network. Use VS Code's `--trace-channels`. |
| Chat / tool / agent **semantics** (token counts, model name, tool args) | ❌ from OBI alone | Enable the Copilot extension's own OTel exporter pointing at the **same** Aspire dashboard — see "Bonus: correlate with Copilot OTel" below. |
| WebSocket / SSE per-frame | ❌ | A streaming model response shows as one long span. Span duration ≈ stream duration. |

## Prerequisites

- Linux with kernel ≥ 5.8 (eBPF + uprobes). Check `uname -r`.
- **Kernel BTF enabled** (`CONFIG_DEBUG_INFO_BTF=y`). OBI is a CO-RE-based tool and will refuse to start without it. Verify with:
  ```bash
  ls /sys/kernel/btf/vmlinux && echo "OK: BTF present"
  ```
  Stock Ubuntu / Debian / Fedora kernels ship with BTF enabled. Custom-built kernels (e.g. `linux-surface`, some hardened distros, older WSL2 kernels) often **don't** — if `/sys/kernel/btf/vmlinux` is missing, OBI fails on startup with `kernel does not support BTF (CONFIG_DEBUG_INFO_BTF): no vmlinux BTF found` and there is no workaround short of booting a different kernel or installing a matching external BTF blob from BTFhub (which won't exist for custom builds).
- Docker installed and current user in the `docker` group (or run with `sudo`).
- A built VS Code dev checkout (`npm run watch` running, or one-shot `npm run compile`).
- The [launch](../launch/SKILL.md) skill, if you want to spin up a throwaway authenticated Code OSS instance instead of using your daily-driver Code Insiders.

## Quick start

The scripts live next to this SKILL.md under `scripts/`. Resolve the directory relative to this file — do **not** hardcode an absolute path.

```bash
# OBSERVE=<dir-of-this-SKILL.md>/scripts

# 1. Start Aspire (UI on http://localhost:18888)
"$OBSERVE/start-aspire.sh"

# 2. Start OBI scoped to electron processes
"$OBSERVE/start-obi.sh"

# 3. Launch (or reuse) your VS Code dev instance, e.g.
./scripts/code.sh                            # or use the `launch` skill
# …then trigger a chat turn, open a folder, etc.

# 4. Open http://localhost:18888 → Traces. You should see spans
#    grouped by service.name = "code-oss" (or "electron", depending
#    on your build's binary name).

# 5. When done:
"$OBSERVE/stop.sh"
```

All three scripts are idempotent (safe to re-run) and use `docker run --rm`, so nothing lingers after `stop.sh`.

## What the scripts do

### `start-aspire.sh`

```bash
docker run -d --rm \
  --name vscode-aspire \
  -p 18888:18888 \
  -p 4317:18889 \
  -p 4318:18890 \
  -e DOTNET_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS=true \
  mcr.microsoft.com/dotnet/aspire-dashboard:latest
```

- `18888` — dashboard UI.
- `4317` (host) → `18889` (container) — OTLP gRPC. Used by OBI.
- `4318` (host) → `18890` (container) — OTLP HTTP. Used by the Copilot extension's OTel exporter (its default endpoint is `http://localhost:4318`).
- `DOTNET_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS=true` — skips the per-launch login token. Fine for localhost-only.

### `start-obi.sh`

```bash
docker run -d --rm \
  --name vscode-obi \
  --privileged \
  --pid=host \
  --network=host \
  -e OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
  -e OTEL_EXPORTER_OTLP_PROTOCOL=grpc \
  -e OTEL_SERVICE_NAME=vscode-obi \
  -e OTEL_EBPF_AUTO_TARGET_EXE='*electron*' \
  -e OTEL_EBPF_TRACE_PRINTER=text \
  -e OTEL_EBPF_BPF_CONTEXT_PROPAGATION=all \
  -e OTEL_EBPF_LOG_LEVEL=info \
  -v /sys/kernel/debug:/sys/kernel/debug \
  -v /sys/fs/bpf:/sys/fs/bpf \
  otel/ebpf-instrument:v0.9.0
```

- `--privileged --pid=host --network=host` — required for eBPF attach across the host's process tree and to reach `localhost:4317`.
- `OTEL_EBPF_AUTO_TARGET_EXE='*electron*'` — match any electron-derived process (renderer, main, ext host, helpers all share the binary). Override with `OBI_TARGET_EXE` env var if your build name differs.
- `OTEL_EBPF_TRACE_PRINTER=text` — also dump a one-line per-request log to OBI's stdout, so `docker logs -f vscode-obi` gives you a live sanity check that traffic is being seen.
- `OTEL_EBPF_BPF_CONTEXT_PROPAGATION=all` — propagate W3C `traceparent` headers on the wire, which is what lets the Copilot extension's `chat` spans become parents of OBI's HTTPS spans (see correlation section below).
- `--network=host` is the simplest way to reach the Aspire OTLP endpoint on `:4317` without DNS tricks. If you'd rather use the docker bridge, replace it with `--add-host=host.docker.internal:host-gateway` and change the endpoint to `http://host.docker.internal:4317`.

### `stop.sh`

Stops and removes both containers if present. Safe to run when nothing's running.

## Bonus: correlate with Copilot OTel

OBI on its own gives you wire spans. To stitch them under the Copilot extension's `invoke_agent` → `chat` → `execute_tool` tree, enable Copilot's own OTel exporter and point it at the **same Aspire dashboard**:

```jsonc
// User settings in the launched VS Code instance
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.otlpEndpoint": "http://localhost:4318",
  "github.copilot.chat.otel.captureContent": false
}
```

When the Copilot extension wraps `chatMLFetcher` calls in a `chat` span, it injects the W3C `traceparent` header. OBI sees the matching outbound HTTPS request on the wire and (because we set `BPF_CONTEXT_PROPAGATION=all`) emits its span with the same trace context. In the Aspire dashboard, this collapses into one trace:

```
copilot-chat: invoke_agent
└── copilot-chat: chat /chat/completions
    └── vscode-obi: HTTPS POST api.githubcopilot.com   ← from OBI, attributed to ext-host PID
```

See [extensions/copilot/docs/monitoring/agent_monitoring.md](../../../extensions/copilot/docs/monitoring/agent_monitoring.md) for the full list of supported endpoints and env-var alternatives.

## Verifying it works

After both containers are up and VS Code is running:

```bash
# 1. OBI is seeing traffic
docker logs --tail 50 vscode-obi
# Look for "creating instrumentation pipeline" on startup, then per-request
# lines like:  200 POST /chat/completions [...] -> [api.githubcopilot.com:443]

# 2. Aspire is receiving spans
# Open http://localhost:18888 → Traces. You should see at least one
# row, with service.name = "code-oss" (or "electron").

# 3. Trigger a chat turn in your dev VS Code, then refresh the
# Traces page. Each model call should produce a new trace.
```

If the Traces page is empty after a chat turn:

| Symptom | Fix |
|---|---|
| OBI logs show "no targets matched the discovery criteria" | Your electron binary name doesn't match `*electron*`. Run `ps -ef \| grep -i electron` or `ps -ef \| grep code` to find the binary path, then re-run `start-obi.sh OBI_TARGET_EXE='*your-binary-name*'`. |
| OBI logs show requests but Aspire has nothing | `--network=host` not honored (rare on rootless Docker). Switch to `--add-host=host.docker.internal:host-gateway` and update the endpoint env. |
| Spans show up but are all opaque TCP, no method/path | OBI's userspace SSL uprobes didn't attach to your Node's libssl. Add `-e OTEL_EBPF_LOG_LEVEL=debug` and look for `attaching uprobe` / `failed to attach` messages. Some Node versions need explicit `OTEL_EBPF_OPEN_PORT` to nudge discovery — for outbound-only processes, set it to `0` to disable port filtering. |
| eBPF refuses to attach with "permission denied" | Your kernel locks down BPF. Check `sysctl kernel.unprivileged_bpf_disabled` and `cat /proc/sys/kernel/perf_event_paranoid`. `--privileged` should cover this, but some hardened distros need extra capabilities. |

## Cleaning up

```bash
"$OBSERVE/stop.sh"
```

Both containers are `--rm`, so this just stops them. OBI does not write any persistent state to the host; Aspire keeps spans in memory only and loses them on stop.

## Caveats specific to VS Code

1. **All electron forks share one `service.name`.** OBI groups by executable, so renderer / main / ext host all appear as `code-oss` (or whatever your binary is called). Distinguish them in the dashboard by `process.pid`, or by the destination host (`server.address`) — ext host talks to `api.githubcopilot.com`, renderer to `*.gallery.vsassets.io`, etc.
2. **Long SSE streams from model responses** look like one long span. To get per-token timing, use the Copilot extension's OTel exporter; OBI cannot see inside an encrypted streaming body.
3. **Child processes that don't link OpenSSL** (e.g. `ripgrep`, `node` extension subprocesses that use Node's HTTPS) are still covered: Node ext-host children inherit the same binary, ripgrep uses no network. Pure-Go subprocesses would need a different uprobe path — none ship in core VS Code.
4. **Throwaway profiles.** If you use the `launch` skill to spin up multiple Code OSS instances, all of them are matched by the same `*electron*` glob. Filter in Aspire by `process.pid` or by destination host to isolate one.

## Related skills

- [launch](../launch/SKILL.md) — spin up a throwaway authenticated Code OSS instance to observe.
- [code-oss-logs](../../.github/skills/code-oss-logs/SKILL.md) — find renderer / ext host / main process logs that complement what OBI shows.
