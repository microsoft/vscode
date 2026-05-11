/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { Command, Option } from 'commander';
import { SECRET_KEYS } from 'son-of-anton-core/dist/credentials/credentialDetection';
import { isClaudeCodeAvailable } from 'son-of-anton-core/dist/llm/claudeCodeRunner';
import { isCodexAvailable } from 'son-of-anton-core/dist/llm/codexRunner';
import { buildCliHost } from '../cliHost';
import { SOTA_EXIT_CODES } from '../headless';

/**
 * Subscription-delegation auth surface for the CLI. Mirrors the IDE pattern
 * implemented as `runSubscriptionSignIn` in
 * `extensions/son-of-anton/src/extension.ts`: rather than reimplementing
 * OAuth, we shell out to Anthropic's `claude` or OpenAI's `codex` CLI and
 * let their `login` subcommand drive the browser flow. They persist tokens
 * under `~/.claude/` and `~/.codex/`; the core runners reuse those tokens
 * automatically when `isClaudeCodeAvailable` / `isCodexAvailable` return
 * true and the API key is absent from the environment.
 */

/**
 * Providers supported by `sota auth login`. Keep this aligned with the IDE's
 * `sota.signInClaude` / `sota.signInOpenAI` commands.
 */
const PROVIDERS = ['claude', 'codex'] as const;
type ProviderId = typeof PROVIDERS[number];

interface ProviderDescriptor {
	readonly id: ProviderId;
	readonly displayName: string;
	readonly cliBinary: string;
	readonly cliInstallUrl: string;
	readonly tokenDir: string;
	readonly apiKeyEnvVars: ReadonlyArray<string>;
	readonly apiKeySecretKeys: ReadonlyArray<string>;
}

const PROVIDER_DESCRIPTORS: Record<ProviderId, ProviderDescriptor> = {
	claude: {
		id: 'claude',
		displayName: 'Claude (Anthropic)',
		cliBinary: 'claude',
		cliInstallUrl: 'https://docs.anthropic.com/en/docs/claude-code',
		tokenDir: '.claude',
		apiKeyEnvVars: ['ANTHROPIC_API_KEY'],
		apiKeySecretKeys: [SECRET_KEYS.anthropic],
	},
	codex: {
		id: 'codex',
		displayName: 'ChatGPT / Codex (OpenAI)',
		cliBinary: 'codex',
		cliInstallUrl: 'https://github.com/openai/codex',
		tokenDir: '.codex',
		apiKeyEnvVars: ['OPENAI_API_KEY'],
		apiKeySecretKeys: [SECRET_KEYS.openai],
	},
};

/**
 * Detect installation by reusing the same probe helpers the IDE harness
 * status-bar uses. Centralised here so `auth login` and `auth status` are
 * guaranteed to agree.
 */
function isProviderInstalled(provider: ProviderId): boolean {
	return provider === 'claude' ? isClaudeCodeAvailable() : isCodexAvailable();
}

/**
 * Sign-in heuristic taken from the IDE's `HarnessStatusBarItem`: the official
 * CLIs persist OAuth tokens under their home-directory dotfiles. Directory
 * presence is a strong signal without parsing token formats; false positives
 * (folder exists but tokens stale) re-prompt cleanly on the next login.
 */
function isProviderSignedIn(provider: ProviderId): boolean {
	const descriptor = PROVIDER_DESCRIPTORS[provider];
	if (!isProviderInstalled(provider)) {
		return false;
	}
	try {
		return fs.existsSync(path.join(os.homedir(), descriptor.tokenDir));
	} catch {
		return false;
	}
}

/**
 * Resolve an API key for the provider, checking process env first and then
 * the file-backed secret store written by `bootstrapCredentials` and the
 * IDE-side mirror. The actual value is never returned — only whether one
 * exists — so `auth status` can report key presence without leaking secrets.
 */
async function hasApiKey(provider: ProviderId): Promise<boolean> {
	const descriptor = PROVIDER_DESCRIPTORS[provider];
	for (const envVar of descriptor.apiKeyEnvVars) {
		const value = process.env[envVar];
		if (value && value.trim()) {
			return true;
		}
	}
	const host = buildCliHost();
	for (const key of descriptor.apiKeySecretKeys) {
		const stored = await host.secrets.get(key);
		if (stored && stored.trim()) {
			return true;
		}
	}
	return false;
}

/**
 * Prompt the user via plain readline (matching the existing CLI's UX style —
 * we don't pull in an Ink picker for a one-off pre-TUI selection) to pick
 * between the supported providers.
 */
async function promptProvider(): Promise<ProviderId | undefined> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
	try {
		process.stderr.write('Select a provider to sign in to:\n');
		PROVIDERS.forEach((id, index) => {
			const descriptor = PROVIDER_DESCRIPTORS[id];
			const installed = isProviderInstalled(id);
			const marker = installed ? ' (CLI detected)' : ' (CLI not installed)';
			process.stderr.write(`  ${index + 1}) ${descriptor.displayName}${marker}\n`);
		});
		const answer: string = await new Promise(resolve => {
			rl.question('Choice [1]: ', value => resolve(value));
		});
		const trimmed = answer.trim();
		if (trimmed.length === 0) {
			return PROVIDERS[0];
		}
		const asNumber = Number.parseInt(trimmed, 10);
		if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= PROVIDERS.length) {
			return PROVIDERS[asNumber - 1];
		}
		const lower = trimmed.toLowerCase();
		if ((PROVIDERS as ReadonlyArray<string>).includes(lower)) {
			return lower as ProviderId;
		}
		process.stderr.write(`error: '${trimmed}' is not a valid choice\n`);
		return undefined;
	} finally {
		rl.close();
	}
}

/**
 * Spawn `<binary> login` attached to the user's TTY (`stdio: 'inherit'`) so
 * the upstream CLI can drive its browser-based OAuth flow with full
 * interactive control. Resolves with the child's exit code; the caller maps
 * a non-zero code onto `SOTA_EXIT_CODES.HARD_FAIL`.
 */
function runProviderLogin(binary: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const child = spawn(binary, ['login'], { stdio: 'inherit' });
		child.once('error', err => reject(err));
		child.once('exit', (code, signal) => {
			if (signal) {
				reject(new Error(`${binary} login terminated by signal ${signal}`));
				return;
			}
			resolve(code ?? 0);
		});
	});
}

function printInstallHint(provider: ProviderId): void {
	const descriptor = PROVIDER_DESCRIPTORS[provider];
	process.stderr.write(
		`error: ${descriptor.cliBinary} CLI not found on PATH.\n`
		+ `       Install it from ${descriptor.cliInstallUrl} and re-run \`sota auth login ${provider}\`.\n`,
	);
}

async function runAuthLogin(providerArg: string | undefined): Promise<void> {
	let provider: ProviderId | undefined;
	if (providerArg) {
		const normalised = providerArg.trim().toLowerCase();
		if (!(PROVIDERS as ReadonlyArray<string>).includes(normalised)) {
			process.stderr.write(
				`error: unknown provider '${providerArg}'. Expected one of: ${PROVIDERS.join(', ')}.\n`,
			);
			process.exit(SOTA_EXIT_CODES.HARD_FAIL);
		}
		provider = normalised as ProviderId;
	} else {
		provider = await promptProvider();
		if (!provider) {
			process.exit(SOTA_EXIT_CODES.HARD_FAIL);
		}
	}

	const descriptor = PROVIDER_DESCRIPTORS[provider];
	if (!isProviderInstalled(provider)) {
		printInstallHint(provider);
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}

	process.stderr.write(
		`Running \`${descriptor.cliBinary} login\` — complete sign-in in your browser, then return here.\n`,
	);
	let exitCode: number;
	try {
		exitCode = await runProviderLogin(descriptor.cliBinary);
	} catch (err) {
		process.stderr.write(
			`error: failed to launch ${descriptor.cliBinary}: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}
	if (exitCode !== 0) {
		process.stderr.write(
			`${descriptor.cliBinary} login exited with code ${exitCode}.\n`,
		);
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}
	process.stderr.write(
		`Signed in to ${descriptor.displayName} via ${descriptor.cliBinary}.\n`,
	);
}

interface AuthStatusOptions {
	output?: 'text' | 'json';
}

interface ProviderStatus {
	readonly id: ProviderId;
	readonly displayName: string;
	readonly cliBinary: string;
	readonly cliInstalled: boolean;
	readonly signedIn: boolean;
	readonly apiKeyConfigured: boolean;
	readonly installHint?: string;
}

async function collectStatus(): Promise<ProviderStatus[]> {
	const out: ProviderStatus[] = [];
	for (const id of PROVIDERS) {
		const descriptor = PROVIDER_DESCRIPTORS[id];
		const installed = isProviderInstalled(id);
		out.push({
			id,
			displayName: descriptor.displayName,
			cliBinary: descriptor.cliBinary,
			cliInstalled: installed,
			signedIn: isProviderSignedIn(id),
			apiKeyConfigured: await hasApiKey(id),
			installHint: installed ? undefined : descriptor.cliInstallUrl,
		});
	}
	return out;
}

/**
 * Render a single provider's status as a multi-line text block. The glyphs
 * match the IDE harness status-bar (●/○) so users seeing both surfaces don't
 * have to remember two notations.
 */
function formatStatusLines(status: ProviderStatus): string[] {
	const glyph = status.signedIn ? '●' : '○';
	const cliState = status.cliInstalled
		? (status.signedIn ? 'installed, signed in' : 'installed, not signed in')
		: 'not installed';
	const lines: string[] = [
		`${glyph} ${status.displayName} (${status.cliBinary})`,
		`    CLI:     ${cliState}`,
		`    API key: ${status.apiKeyConfigured ? 'configured' : 'not configured'}`,
	];
	if (status.installHint) {
		lines.push(`    Install: ${status.installHint}`);
	}
	return lines;
}

async function runAuthStatus(opts: AuthStatusOptions): Promise<void> {
	const reports = await collectStatus();
	if (opts.output === 'json') {
		process.stdout.write(JSON.stringify(reports, null, 2) + '\n');
		return;
	}
	const blocks: string[][] = reports.map(formatStatusLines);
	for (let i = 0; i < blocks.length; i++) {
		for (const line of blocks[i]) {
			process.stdout.write(line + '\n');
		}
		if (i < blocks.length - 1) {
			process.stdout.write('\n');
		}
	}
}

export function authCommand(): Command {
	const cmd = new Command('auth');
	cmd.description('Manage provider sign-in (Claude / Codex subscriptions, API keys).');

	cmd.command('login [provider]')
		.description('Delegate sign-in to the upstream `claude` or `codex` CLI. Prompts when no provider is given.')
		.action(async (provider: string | undefined) => {
			await runAuthLogin(provider);
		});

	cmd.command('status')
		.description('Report which providers are installed, signed in, or have API keys configured.')
		.addOption(new Option('--output <mode>', 'Output mode: text or json').choices(['text', 'json']).default('text'))
		.action(async (opts: AuthStatusOptions) => {
			await runAuthStatus(opts);
		});

	return cmd;
}
