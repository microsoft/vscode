/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { isClaudeCodeAvailable } from 'son-of-anton-core/llm/claudeCodeRunner';
import { isCodexAvailable } from 'son-of-anton-core/llm/codexRunner';

const STATUS_COMMAND = 'sota.harness.openMenu';

/**
 * Per-handle ↔ default model mapping for the pinned-vs-default check. Must
 * stay in lockstep with `son-of-anton-core/src/agents/AgentStackFactory.ts`'s
 * AGENT_CONFIGS — a setting matching the default value is treated as "not
 * pinned" because reverting an override to the default has no effect.
 */
const DEFAULT_MODELS: ReadonlyArray<{ handle: string; model: string }> = [
	{ handle: 'anton', model: 'opus' },
	{ handle: 'anton-code', model: 'sonnet' },
	{ handle: 'anton-test', model: 'sonnet' },
	{ handle: 'anton-e2e', model: 'sonnet' },
	{ handle: 'anton-security', model: 'sonnet' },
	{ handle: 'anton-docs', model: 'haiku' },
	{ handle: 'anton-ci', model: 'sonnet' },
	{ handle: 'anton-pr', model: 'sonnet' },
	{ handle: 'anton-moderniser', model: 'sonnet' },
	{ handle: 'anton-review', model: 'sonnet' },
];

interface HarnessSnapshot {
	codexInstalled: boolean;
	codexSignedIn: boolean;
	claudeInstalled: boolean;
	claudeSignedIn: boolean;
	pinnedSpecialists: ReadonlyArray<{ handle: string; model: string; defaultModel: string }>;
}

/**
 * Status-bar entry surfacing harness-level state at a glance:
 *   - Codex / Claude CLI install + sign-in status
 *   - How many specialists have a pinned `sota.agents.<handle>.model`
 *     override vs the hardcoded default
 *
 * Distinct from `CliStatusBarItem` (which surfaces the bundled `sota`
 * CLI install state) because the concerns are different — this one exists
 * even on installs that never touch the CLI, and click reveals harness-
 * specific actions (sign in to Codex / Claude, open Specialist Models
 * settings, show harness stats).
 *
 * Sign-in detection uses a home-directory probe: the official Codex and
 * Claude Code CLIs persist OAuth tokens under `~/.codex/` and `~/.claude/`
 * respectively. The probe is intentionally loose — directory presence
 * implies the CLI has run at least once, which is a strong heuristic for
 * "user has signed in" without parsing token files. False positives (user
 * ran `codex --version` without ever logging in) are acceptable: the worst
 * case is a slightly-too-confident pill, and the actual sign-in command
 * (re-)runs `codex login` which is idempotent.
 */
export class HarnessStatusBarItem implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly disposables: vscode.Disposable[] = [];
	private snapshot: HarnessSnapshot | undefined;

	constructor() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 94);
		this.item.command = STATUS_COMMAND;
		this.item.text = '$(rocket) harness';
		this.item.tooltip = 'Son of Anton — harness state. Click for sign-in / model overrides / harness stats.';
		this.item.show();

		this.refreshSnapshot();
		this.render();

		this.disposables.push(
			vscode.commands.registerCommand(STATUS_COMMAND, () => this.handleClick()),
		);
		// Listen for setting changes so a `sota.agents.<handle>.model` flip
		// updates the pinned-count without requiring a click. CLI install /
		// sign-in changes don't fire VS Code config events, so the home
		// directory probe still re-runs on every click.
		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('sota.agents')) {
					this.refreshSnapshot();
					this.render();
				}
			}),
		);
	}

	private refreshSnapshot(): void {
		const home = os.homedir();
		const codexInstalled = isCodexAvailable();
		const claudeInstalled = isClaudeCodeAvailable();
		// Sign-in heuristic: the official CLIs persist tokens under their
		// home-directory dotfiles. Directory presence is a strong signal
		// without parsing token formats.
		const codexSignedIn = codexInstalled && fs.existsSync(path.join(home, '.codex'));
		const claudeSignedIn = claudeInstalled && fs.existsSync(path.join(home, '.claude'));

		const cfg = vscode.workspace.getConfiguration();
		const pinnedSpecialists = DEFAULT_MODELS
			.map(({ handle, model: defaultModel }) => {
				const override = cfg.get<string>(`sota.agents.${handle}.model`);
				const trimmed = typeof override === 'string' ? override.trim() : '';
				if (!trimmed || trimmed === defaultModel) {
					return undefined;
				}
				return { handle, model: trimmed, defaultModel };
			})
			.filter((entry): entry is { handle: string; model: string; defaultModel: string } => entry !== undefined);

		this.snapshot = {
			codexInstalled,
			codexSignedIn,
			claudeInstalled,
			claudeSignedIn,
			pinnedSpecialists,
		};
	}

	private render(): void {
		if (!this.snapshot) {
			return;
		}
		const { codexSignedIn, claudeSignedIn, pinnedSpecialists } = this.snapshot;
		// Bullet glyphs: filled when signed in / has overrides, hollow when
		// not. Keeps the bar readable at a glance without colour coding.
		const codexGlyph = codexSignedIn ? '●' : '○';
		const claudeGlyph = claudeSignedIn ? '●' : '○';
		const pinSegment = pinnedSpecialists.length > 0
			? `${pinnedSpecialists.length} pinned`
			: 'default models';
		this.item.text = `$(rocket) Codex ${codexGlyph} · Claude ${claudeGlyph} · ${pinSegment}`;

		const lines: string[] = ['Son of Anton — harness state'];
		lines.push('');
		lines.push(`Codex CLI: ${this.describeAuth(this.snapshot.codexInstalled, codexSignedIn)}`);
		lines.push(`Claude CLI: ${this.describeAuth(this.snapshot.claudeInstalled, claudeSignedIn)}`);
		lines.push('');
		if (pinnedSpecialists.length === 0) {
			lines.push('All specialists using default models.');
		} else {
			lines.push(`Pinned specialists (${pinnedSpecialists.length}):`);
			for (const entry of pinnedSpecialists) {
				lines.push(`  @${entry.handle} → ${entry.model} (default: ${entry.defaultModel})`);
			}
		}
		lines.push('');
		lines.push('Click for actions.');
		this.item.tooltip = lines.join('\n');
	}

	private describeAuth(installed: boolean, signedIn: boolean): string {
		if (!installed) {
			return 'not installed';
		}
		if (signedIn) {
			return 'signed in';
		}
		return 'installed (not signed in)';
	}

	private async handleClick(): Promise<void> {
		this.refreshSnapshot();
		this.render();
		if (!this.snapshot) {
			return;
		}
		const { codexInstalled, codexSignedIn, claudeInstalled, claudeSignedIn, pinnedSpecialists } = this.snapshot;

		interface PickItem extends vscode.QuickPickItem {
			readonly id: 'sign-in-codex' | 'sign-in-claude' | 'open-specialists' | 'open-traces' | 'docs';
		}

		const items: PickItem[] = [];
		items.push({
			id: 'sign-in-codex',
			label: codexSignedIn
				? '$(check) Codex CLI: signed in'
				: codexInstalled
					? '$(sign-in) Sign in to ChatGPT / Codex'
					: '$(cloud-download) Install Codex CLI',
			description: codexSignedIn
				? 'Click to re-run codex login or switch accounts'
				: codexInstalled
					? 'Opens a terminal and runs `codex login`'
					: 'Opens github.com/openai/codex',
		});
		items.push({
			id: 'sign-in-claude',
			label: claudeSignedIn
				? '$(check) Claude CLI: signed in'
				: claudeInstalled
					? '$(sign-in) Sign in to Claude'
					: '$(cloud-download) Install Claude CLI',
			description: claudeSignedIn
				? 'Click to re-run claude login or switch accounts'
				: claudeInstalled
					? 'Opens a terminal and runs `claude login`'
					: 'Opens docs.claude.com/quickstart',
		});
		items.push({
			id: 'open-specialists',
			label: pinnedSpecialists.length > 0
				? `$(person) Specialist models — ${pinnedSpecialists.length} pinned`
				: '$(person) Specialist models — all default',
			description: 'Open Settings → search "sota.agents" for per-agent model overrides',
		});
		items.push({
			id: 'open-traces',
			label: '$(graph) Show harness stats',
			description: 'Cache hit rates, routing decisions, per-agent metrics',
		});
		items.push({
			id: 'docs',
			label: '$(book) Open harness review',
			description: 'docs/agent-harness-review.md',
		});

		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: 'Son of Anton — harness state',
			title: 'Harness',
		});
		if (!picked) {
			return;
		}
		switch (picked.id) {
			case 'sign-in-codex':
				await vscode.commands.executeCommand('sota.signInOpenAI');
				break;
			case 'sign-in-claude':
				await vscode.commands.executeCommand('sota.signInClaude');
				break;
			case 'open-specialists':
				await vscode.commands.executeCommand('workbench.action.openSettings', 'sota.agents');
				break;
			case 'open-traces':
				await vscode.commands.executeCommand('sota.showHarnessStats');
				break;
			case 'docs': {
				const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
				await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(`${root}/docs/agent-harness-review.md`));
				break;
			}
		}
		// After any action, re-snapshot so the bar shows the new state on
		// next render (e.g. user just signed in to Codex via the terminal —
		// the directory now exists).
		this.refreshSnapshot();
		this.render();
	}

	dispose(): void {
		this.item.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
