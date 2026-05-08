/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, Option } from 'commander';
import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';
import { McpServerConnection } from 'son-of-anton-core/dist/mcp/McpServerConnection';
import { McpStdioTransport } from 'son-of-anton-core/dist/mcp/McpStdioTransport';
import { buildCliHost } from '../cliHost';
import { SOTA_EXIT_CODES } from '../headless';

interface McpStdioServerEntry {
	readonly name: string;
	readonly transport?: 'stdio';
	readonly command: string;
	readonly args: ReadonlyArray<string>;
	readonly env?: Readonly<Record<string, string>>;
	readonly cwd?: string;
}

interface McpHttpServerEntry {
	readonly name: string;
	readonly transport: 'http';
	readonly url: string;
	readonly headers?: Readonly<Record<string, string>>;
}

type McpServerEntry = McpStdioServerEntry | McpHttpServerEntry;

/**
 * Legacy key used by the original `mcp add / list / remove` subcommands. Kept
 * untouched so existing config files continue to round-trip; the new commands
 * (`claude-add`, `add-http`, `doctor`) all live under `sota.mcp.servers` so
 * they line up with the agent stack's runtime read in `agentStackBuilder.ts`.
 */
const MCP_SERVERS_KEY = 'mcp.servers';
const SOTA_MCP_SERVERS_KEY = 'sota.mcp.servers';

const HTTP_PROBE_TIMEOUT_MS = 5_000;
const STDIO_PROBE_TIMEOUT_MS = 8_000;

/**
 * Parse a `KEY=VALUE` flag value into a tuple. Throws when the input is
 * malformed so the user gets a clear error rather than a silent drop.
 */
function parseKeyValue(input: string, kind: 'env' | 'header'): [string, string] {
	const idx = input.indexOf('=');
	if (idx <= 0) {
		throw new Error(`Invalid --${kind} value '${input}': expected KEY=VALUE`);
	}
	const key = input.slice(0, idx).trim();
	const value = input.slice(idx + 1);
	if (!key) {
		throw new Error(`Invalid --${kind} value '${input}': empty key`);
	}
	return [key, value];
}

/**
 * Collector for repeatable `--env KEY=VALUE` / `--header KEY=VALUE` flags.
 * Returned as a closure so each command can bind the right error label.
 */
function collectKeyValue(kind: 'env' | 'header'): (value: string, previous: Record<string, string>) => Record<string, string> {
	return (value, previous) => {
		const [k, v] = parseKeyValue(value, kind);
		return { ...previous, [k]: v };
	};
}

/**
 * Read the unified `sota.mcp.servers` list from config, normalising entries to
 * the discriminated-union {@link McpServerEntry} shape. Entries without an
 * explicit `transport` are treated as stdio for backwards compatibility with
 * the legacy `mcp add` writes.
 */
function readSotaServers(host: ReturnType<typeof buildCliHost>): McpServerEntry[] {
	const raw = host.config.get<ReadonlyArray<Record<string, unknown>>>(SOTA_MCP_SERVERS_KEY, []) ?? [];
	const out: McpServerEntry[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		const name = typeof entry.name === 'string' ? entry.name : '';
		if (!name) {
			continue;
		}
		const transport = entry.transport === 'http' ? 'http' : 'stdio';
		if (transport === 'http') {
			const url = typeof entry.url === 'string' ? entry.url : '';
			if (!url) {
				continue;
			}
			const headers = entry.headers && typeof entry.headers === 'object'
				? coerceStringRecord(entry.headers as Record<string, unknown>)
				: undefined;
			out.push({ name, transport: 'http', url, headers });
			continue;
		}
		const command = typeof entry.command === 'string' ? entry.command : '';
		if (!command) {
			continue;
		}
		const args = Array.isArray(entry.args)
			? entry.args.filter((a): a is string => typeof a === 'string')
			: [];
		const env = entry.env && typeof entry.env === 'object'
			? coerceStringRecord(entry.env as Record<string, unknown>)
			: undefined;
		const cwd = typeof entry.cwd === 'string' && entry.cwd.length > 0 ? entry.cwd : undefined;
		out.push({ name, transport: 'stdio', command, args, env, cwd });
	}
	return out;
}

function coerceStringRecord(input: Record<string, unknown>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(input)) {
		if (typeof v === 'string') {
			out[k] = v;
		}
	}
	return out;
}

async function writeSotaServers(host: ReturnType<typeof buildCliHost>, entries: ReadonlyArray<McpServerEntry>): Promise<void> {
	await host.config.update?.(SOTA_MCP_SERVERS_KEY, entries);
}

/**
 * Replace any existing entry with the same name and append the new one. Keeps
 * `claude-add` / `add-http` idempotent so users can re-run with adjusted args
 * without manual cleanup.
 */
function upsertServer(existing: ReadonlyArray<McpServerEntry>, entry: McpServerEntry): McpServerEntry[] {
	return [...existing.filter(s => s.name !== entry.name), entry];
}

interface DoctorReport {
	readonly name: string;
	readonly transport: 'stdio' | 'http';
	readonly ok: boolean;
	readonly tools?: ReadonlyArray<string>;
	readonly warnings?: ReadonlyArray<string>;
	readonly error?: string;
}

/**
 * Probe a single stdio MCP server by spawning it, performing the initialize
 * handshake, listing tools, then disposing. Always resolves — failures are
 * captured in the returned {@link DoctorReport.error}.
 */
async function probeStdioServer(entry: McpStdioServerEntry, cwdFallback: string | undefined): Promise<DoctorReport> {
	const transport = new McpStdioTransport({
		command: entry.command,
		args: [...entry.args],
		env: entry.env ? { ...entry.env } : undefined,
		cwd: entry.cwd ?? cwdFallback,
	});
	const connection = new McpServerConnection({ name: entry.name, transport });
	const timer = new Promise<DoctorReport>(resolve => {
		setTimeout(() => {
			resolve({
				name: entry.name,
				transport: 'stdio',
				ok: false,
				error: `probe timed out after ${STDIO_PROBE_TIMEOUT_MS}ms`,
			});
		}, STDIO_PROBE_TIMEOUT_MS).unref();
	});
	const probe = (async (): Promise<DoctorReport> => {
		try {
			await connection.connect();
			const tools = await connection.listTools(true);
			const warnings: string[] = [];
			const toolNames: string[] = [];
			for (const tool of tools) {
				toolNames.push(tool.name);
				if (!tool.inputSchema) {
					warnings.push(`tool '${tool.name}' is missing inputSchema`);
				}
			}
			return {
				name: entry.name,
				transport: 'stdio',
				ok: true,
				tools: toolNames,
				warnings: warnings.length > 0 ? warnings : undefined,
			};
		} catch (err) {
			return {
				name: entry.name,
				transport: 'stdio',
				ok: false,
				error: err instanceof Error ? err.message : String(err),
			};
		} finally {
			try { connection.dispose(); } catch { /* swallow on shutdown */ }
		}
	})();
	return Promise.race([probe, timer]);
}

/**
 * Probe an HTTP MCP server with a HEAD-then-GET fallback. We don't speak the
 * MCP-over-HTTP RPC dialect from the CLI yet, so reachability + status code
 * is the most we can verify; tool enumeration is left as a known gap and
 * surfaced as a warning so users aren't misled.
 */
async function probeHttpServer(entry: McpHttpServerEntry): Promise<DoctorReport> {
	let parsed: URL;
	try {
		parsed = new URL(entry.url);
	} catch {
		return {
			name: entry.name,
			transport: 'http',
			ok: false,
			error: `invalid URL '${entry.url}'`,
		};
	}
	const lib = parsed.protocol === 'https:' ? https : http;
	return new Promise<DoctorReport>(resolve => {
		const req = lib.request(parsed, {
			method: 'GET',
			headers: entry.headers ? { ...entry.headers } : undefined,
			timeout: HTTP_PROBE_TIMEOUT_MS,
		}, res => {
			res.resume();
			const status = res.statusCode ?? 0;
			if (status >= 200 && status < 400) {
				resolve({
					name: entry.name,
					transport: 'http',
					ok: true,
					tools: [],
					warnings: ['HTTP MCP tool listing not implemented — reachability only'],
				});
				return;
			}
			resolve({
				name: entry.name,
				transport: 'http',
				ok: false,
				error: `${status} ${res.statusMessage ?? 'error'}`.trim(),
			});
		});
		req.on('timeout', () => {
			req.destroy(new Error(`probe timed out after ${HTTP_PROBE_TIMEOUT_MS}ms`));
		});
		req.on('error', err => {
			resolve({
				name: entry.name,
				transport: 'http',
				ok: false,
				error: err instanceof Error ? err.message : String(err),
			});
		});
		req.end();
	});
}

function formatReport(report: DoctorReport): string {
	if (!report.ok) {
		return `✗ ${report.name} — ${report.error ?? 'unreachable'}`;
	}
	const toolCount = report.tools?.length ?? 0;
	const base = `✓ ${report.name} — ${toolCount} tool${toolCount === 1 ? '' : 's'}`;
	if (report.warnings && report.warnings.length > 0) {
		return `${base} (warnings: ${report.warnings.join('; ')})`;
	}
	return base;
}

export function mcpCommand(): Command {
	const cmd = new Command('mcp');
	cmd.description('Manage MCP servers.');

	cmd.command('add <name> <command> [args...]')
		.option('-c, --cwd <path>', 'Working directory for the server')
		.description('Add an MCP server.')
		.action(async (name: string, command: string, args: string[], opts: { cwd?: string }) => {
			const host = buildCliHost();
			const existing = host.config.get<ReadonlyArray<McpStdioServerEntry>>(MCP_SERVERS_KEY, []) ?? [];
			const newServer: McpStdioServerEntry = { name, command, args, cwd: opts.cwd };
			const filtered = existing.filter(s => s.name !== name);
			const updated = [...filtered, newServer];
			await host.config.update?.(MCP_SERVERS_KEY, updated);
			process.stdout.write(`Added MCP server '${name}' (${command} ${args.join(' ')}).\n`);
		});

	cmd.command('remove <name>')
		.description('Remove an MCP server.')
		.action(async (name: string) => {
			const host = buildCliHost();
			const existing = host.config.get<ReadonlyArray<McpStdioServerEntry>>(MCP_SERVERS_KEY, []) ?? [];
			const filtered = existing.filter(s => s.name !== name);
			await host.config.update?.(MCP_SERVERS_KEY, filtered);
			process.stdout.write(`Removed MCP server '${name}'.\n`);
		});

	cmd.command('list')
		.description('List configured MCP servers.')
		.action(async () => {
			const host = buildCliHost();
			const servers = host.config.get<ReadonlyArray<McpStdioServerEntry>>(MCP_SERVERS_KEY, []) ?? [];
			const sotaServers = readSotaServers(host);
			if (servers.length === 0 && sotaServers.length === 0) {
				process.stdout.write('No MCP servers configured.\n');
				return;
			}
			for (const s of servers) {
				const argString = s.args && s.args.length > 0 ? ' ' + s.args.join(' ') : '';
				process.stdout.write(`  ${s.name}: ${s.command}${argString}\n`);
			}
			for (const s of sotaServers) {
				if (s.transport === 'http') {
					process.stdout.write(`  ${s.name} [http]: ${s.url}\n`);
					continue;
				}
				const argString = s.args && s.args.length > 0 ? ' ' + s.args.join(' ') : '';
				process.stdout.write(`  ${s.name} [stdio]: ${s.command}${argString}\n`);
			}
		});

	cmd.command('claude-add <name> [command...]')
		.alias('add-stdio')
		.description('Add a stdio MCP server using Claude Code\'s syntax (`sota mcp claude-add <name> -- <command...>`).')
		.option('--env <kv>', 'Environment variable for the server (KEY=VALUE; repeatable)', collectKeyValue('env'), {})
		.option('--cwd <path>', 'Working directory for the server process')
		.action(async (name: string, commandTokens: string[], opts: { env: Record<string, string>; cwd?: string }) => {
			if (!commandTokens || commandTokens.length === 0) {
				process.stderr.write('error: a command is required (use `--` to separate it from sota flags)\n');
				process.exit(SOTA_EXIT_CODES.HARD_FAIL);
			}
			const [command, ...args] = commandTokens;
			const env = Object.keys(opts.env).length > 0 ? opts.env : undefined;
			const entry: McpStdioServerEntry = {
				name,
				transport: 'stdio',
				command,
				args,
				env,
				cwd: opts.cwd,
			};
			const host = buildCliHost();
			const existing = readSotaServers(host);
			await writeSotaServers(host, upsertServer(existing, entry));
			process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
		});

	cmd.command('add-http <name> <url>')
		.description('Add an HTTP-transport MCP server.')
		.option('--header <kv>', 'Auth header for the server (KEY=VALUE; repeatable)', collectKeyValue('header'), {})
		.action(async (name: string, url: string, opts: { header: Record<string, string> }) => {
			try {
				// Eager validation so misuse fails fast rather than at probe time.
				new URL(url);
			} catch {
				process.stderr.write(`error: invalid URL '${url}'\n`);
				process.exit(SOTA_EXIT_CODES.HARD_FAIL);
			}
			const headers = Object.keys(opts.header).length > 0 ? opts.header : undefined;
			const entry: McpHttpServerEntry = {
				name,
				transport: 'http',
				url,
				headers,
			};
			const host = buildCliHost();
			const existing = readSotaServers(host);
			await writeSotaServers(host, upsertServer(existing, entry));
			process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
		});

	cmd.command('doctor')
		.description('Validate configured MCP servers — pings each, lists exposed tools, surfaces schema mismatches.')
		.addOption(new Option('--output <mode>', 'Output mode: text or json').choices(['text', 'json']).default('text'))
		.action(async (opts: { output: 'text' | 'json' }) => {
			const host = buildCliHost();
			const sotaServers = readSotaServers(host);
			const cwdFallback = host.workspace.folders[0]?.fsPath;
			if (sotaServers.length === 0) {
				if (opts.output === 'json') {
					process.stdout.write('[]\n');
					return;
				}
				process.stdout.write('No MCP servers configured under `sota.mcp.servers`.\n');
				return;
			}
			const reports = await Promise.all(sotaServers.map(s => {
				return s.transport === 'http'
					? probeHttpServer(s)
					: probeStdioServer(s, cwdFallback);
			}));
			if (opts.output === 'json') {
				process.stdout.write(JSON.stringify(reports, null, 2) + '\n');
			} else {
				for (const report of reports) {
					process.stdout.write(formatReport(report) + '\n');
				}
			}
			if (reports.some(r => !r.ok)) {
				process.exitCode = SOTA_EXIT_CODES.HARD_FAIL;
			}
		});

	cmd.command('logs <name>')
		.description('Tail recent stderr from a stdio MCP server (not yet implemented — runtime does not retain stderr).')
		.action((name: string) => {
			process.stderr.write(`logs: not implemented yet — stdio stderr is forwarded live to the host console rather than retained.\n`);
			process.stderr.write(`hint: re-run the agent with the '${name}' server enabled and watch stderr directly.\n`);
			process.exit(SOTA_EXIT_CODES.HARD_FAIL);
		});

	return cmd;
}
