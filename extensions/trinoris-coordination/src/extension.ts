/*---------------------------------------------------------------------------------------------
 *  Trinoris Coordination built-in extension
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'node:child_process';
import * as path from 'node:path';
import * as vscode from 'vscode';

const VIEW_ID = 'trinoris-coordination.overview';
const REFRESH_COMMAND = 'trinoris-coordination.refresh';
const WORKSPACE_STATE_KEY = 'trinoris-coordination.workspace';
const REFRESH_INTERVAL_MS = 15_000;
const MAX_OUTPUT_BYTES = 512 * 1024;
let outputChannel: vscode.LogOutputChannel | undefined;

type JsonObject = Record<string, unknown>;

interface CoordinationNode {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly tooltip?: string;
	readonly icon?: vscode.ThemeIcon;
	readonly children?: readonly CoordinationNode[];
	readonly command?: vscode.Command;
}

interface Snapshot {
	readonly cliVersion?: string;
	readonly runtimeDiagnostic?: RuntimeDiagnostic;
	readonly runtimeDiagnosticError?: string;
	readonly capabilities?: ReadonlySet<string>;
	readonly cliError?: string;
	readonly scopes: readonly JsonObject[];
	readonly handoffs: readonly JsonObject[];
	readonly journal: readonly JsonObject[];
	readonly incidents: readonly JsonObject[];
	readonly diagnostics: readonly JsonObject[];
	readonly errors: Readonly<Record<string, string>>;
	readonly identityConfigured: boolean;
	readonly observedAt?: string;
}

interface RuntimeDiagnostic {
	readonly status: 'no-known-critical' | 'blocked' | 'unknown';
	readonly nodeVersion: string;
	readonly supportedMinimum: string;
	readonly catalogUpdatedAt: string;
	readonly criticalAdvisories: readonly JsonObject[];
}

class CoordinationTreeProvider implements vscode.TreeDataProvider<CoordinationNode> {
	private readonly changeEmitter = new vscode.EventEmitter<CoordinationNode | undefined | void>();
	readonly onDidChangeTreeData = this.changeEmitter.event;

	private snapshot: Snapshot = {
		scopes: [], handoffs: [], journal: [], incidents: [], diagnostics: [], errors: {}, identityConfigured: false,
	};
	private workspaceLabel = 'Workspace not selected';
	private workspaceError: string | undefined;

	setWorkspace(label: string, error?: string): void {
		this.workspaceLabel = label;
		this.workspaceError = error;
		this.changeEmitter.fire();
	}

	setSnapshot(snapshot: Snapshot): void {
		this.snapshot = snapshot;
		this.changeEmitter.fire();
	}

	getTreeItem(node: CoordinationNode): vscode.TreeItem {
		const item = new vscode.TreeItem(node.label, node.children?.length
			? vscode.TreeItemCollapsibleState.Expanded
			: vscode.TreeItemCollapsibleState.None);
		item.id = node.id;
		item.description = node.description;
		item.tooltip = node.tooltip;
		item.iconPath = node.icon;
		item.command = node.command;
		return item;
	}

	getChildren(node?: CoordinationNode): CoordinationNode[] {
		if (node?.children) {
			return [...node.children];
		}
		if (node) {
			return [];
		}

		const snapshot = this.snapshot;
		if (this.workspaceError) {
			return [this.messageNode('workspace', this.workspaceError, 'warning')];
		}

		if (snapshot.cliError) {
			return [
				this.messageNode('cli-error', snapshot.cliError, 'warning'),
				this.messageNode('cli-install', 'Install Trinoris Agent CLI with npm', 'cloud-download', {
					command: 'trinoris-coordination.installCli', title: 'Install Trinoris Agent CLI'
				}),
				this.messageNode('cli-setting', 'Configure CLI path or add trinoris-agent to PATH', 'gear', {
					command: 'trinoris-coordination.openCliSettings', title: 'Configure Trinoris Agent CLI'
				}),
			];
		}

		const sections: CoordinationNode[] = [
			this.section('connection', `CLI ${snapshot.cliVersion ?? 'unknown'}`, [
				this.messageNode('workspace-root', this.workspaceLabel, 'folder'),
				this.messageNode('last-read', snapshot.observedAt ? `Last read ${snapshot.observedAt}` : 'Not read yet', 'history'),
				this.runtimeDiagnosticNode(snapshot),
				this.messageNode('run-cli-diagnostics', 'Run CLI Diagnostics', 'pulse', {
					command: 'trinoris-coordination.runCliDiagnostics', title: 'Run Trinoris Agent CLI diagnostics'
				}),
			]),
			this.section('scopes', `Scopes (${snapshot.scopes.length})`, this.scopeNodes(snapshot)),
			this.section('handoffs', `Handoffs (${snapshot.handoffs.length})`, this.handoffNodes(snapshot)),
			this.section('activity', `Recent activity (${snapshot.journal.length})`, this.journalNodes(snapshot)),
			this.section('incidents', `Incidents (${snapshot.incidents.length})`, this.recordNodes('incident', snapshot.incidents, snapshot.errors['incidents'])),
			this.section('diagnostics', `Diagnostics (${snapshot.diagnostics.length})`, this.recordNodes('diagnostic', snapshot.diagnostics, snapshot.errors['diagnostics'])),
		];
		return sections;
	}

	private runtimeDiagnosticNode(snapshot: Snapshot): CoordinationNode {
		if (snapshot.runtimeDiagnosticError) {
			return this.messageNode('runtime-diagnostic', `Runtime diagnostic unavailable: ${snapshot.runtimeDiagnosticError}`, 'warning');
		}
		const diagnostic = snapshot.runtimeDiagnostic;
		if (!diagnostic) {
			return this.messageNode('runtime-diagnostic', 'Runtime diagnostic not run yet.', 'info');
		}
		const status = diagnostic.status === 'no-known-critical' ? 'No known critical advisory' : diagnostic.status === 'blocked' ? 'Blocked by critical advisory' : 'Runtime status unknown';
		const details = `${status} · Node ${diagnostic.nodeVersion} · catalog ${diagnostic.catalogUpdatedAt}`;
		const advisories = diagnostic.criticalAdvisories.map((advisory, index) => ({
			id: `runtime-advisory-${index}`,
			label: safeText(advisory['title'], safeText(advisory['id'], `Advisory ${index + 1}`)),
			description: typeof advisory['fixedVersion'] === 'string' ? `Fixed in Node.js ${safeText(advisory['fixedVersion'], 'unknown')}` : undefined,
			icon: new vscode.ThemeIcon('warning'),
		}));
		return {
			id: 'runtime-diagnostic',
			label: details,
			description: `Supported minimum Node.js ${safeText(diagnostic.supportedMinimum, 'unknown')}`,
			icon: new vscode.ThemeIcon(diagnostic.status === 'no-known-critical' ? 'check' : 'warning'),
			children: advisories.length ? advisories : undefined,
		};
	}

	private section(id: string, label: string, children: readonly CoordinationNode[]): CoordinationNode {
		const unavailable = !!this.snapshot.errors[id];
		return {
			id,
			label: unavailable ? label.replace(/ \(\d+\)$/, ' (unavailable)') : label,
			description: unavailable ? 'Unavailable' : undefined,
			children
		};
	}

	private scopeNodes(snapshot: Snapshot): readonly CoordinationNode[] {
		const error = snapshot.errors['scopes'];
		if (error) {
			return [this.messageNode('scope-error', error, 'warning')];
		}
		const rows = snapshot.scopes.map((scope, index) => {
			const name = safeText(scope['scope'], `Scope ${index + 1}`);
			const state = safeText(scope['state'], 'unknown');
			const holder = isObject(scope['holder']) ? scope['holder'] : {};
			const owner = safeText(holder['agent_class'], '') || safeText(holder['agent_instance'], '');
			const task = safeText(holder['task'], '');
			const lease = safeText(holder['expires_at'], '');
			const detail = [owner, task, lease].filter(Boolean).join(' · ');
			return {
				id: `scope-${index}-${name}`,
				label: name,
				description: [state, detail].filter(Boolean).join(' · '),
				icon: new vscode.ThemeIcon(state === 'held' ? 'lock' : state === 'free' ? 'circle-outline' : 'warning'),
			};
		});
		if (!snapshot.capabilities?.has('scope.registry')) {
			return [this.messageNode('scope-partial', 'Partial: this CLI reports observed lock files, not every configured scope.', 'info'), ...rows];
		}
		return rows.length ? rows : [this.messageNode('scope-empty', 'No scopes reported by the CLI.', 'info')];
	}

	private handoffNodes(snapshot: Snapshot): readonly CoordinationNode[] {
		const error = snapshot.errors['handoffs'];
		if (error) {
			return [this.messageNode('handoff-error', error, 'warning')];
		}
		if (!snapshot.capabilities?.has('handoff.inboxActive')) {
			return [this.messageNode('handoff-unsupported', 'This CLI version does not expose handoff listing.', 'warning')];
		}
		if (!snapshot.identityConfigured) {
			return [this.messageNode('handoff-identity', 'Set an agent class and instance to inspect its inbox and active handoffs.', 'info', {
				command: 'trinoris-coordination.openAgentIdentitySettings', title: 'Configure Trinoris Agent Identity'
			})];
		}
		if (!snapshot.handoffs.length) {
			return [this.messageNode('handoff-empty', 'No handoffs returned for the selected identity.', 'info')];
		}
		return snapshot.handoffs.map((handoff, index) => {
			const title = safeText(handoff['title'], safeText(handoff['filename'], `Handoff ${index + 1}`));
			const location = safeText(handoff['location'], 'unknown');
			const status = safeText(handoff['status'], handoff['valid'] === false ? 'invalid' : '');
			return {
				id: `handoff-${index}-${title}`,
				label: title,
				description: [location, status].filter(Boolean).join(' · '),
				icon: new vscode.ThemeIcon('arrow-swap'),
			};
		});
	}

	private journalNodes(snapshot: Snapshot): readonly CoordinationNode[] {
		const error = snapshot.errors['activity'];
		if (error) {
			return [this.messageNode('activity-error', error, 'warning')];
		}
		if (!snapshot.journal.length) {
			return [this.messageNode('activity-empty', 'No journey log entries for this workspace yet. Run a coordination action, then refresh.', 'info')];
		}
		return snapshot.journal.slice(0, 30).map((record, index) => {
			const actor = safeText(record['agent_instance'], safeText(record['agent_class'], 'agent'));
			const op = safeText(record['operation'], 'operation');
			const scopes = Array.isArray(record['scopes']) ? record['scopes'].map(value => safeText(value, '')).filter(Boolean).join(', ') : '';
			const outcome = safeText(record['outcome'], 'unknown');
			const at = safeText(record['at'], '');
			return {
				id: `journal-${index}-${at}`,
				label: `${actor} · ${op}`,
				description: [at, scopes, outcome].filter(Boolean).join(' · '),
				icon: new vscode.ThemeIcon(outcome === 'ok' ? 'check' : 'warning'),
			};
		});
	}

	private recordNodes(prefix: string, records: readonly JsonObject[], error?: string): readonly CoordinationNode[] {
		if (error) {
			return [this.messageNode(`${prefix}-error`, error, 'warning')];
		}
		if (!records.length) {
			return [this.messageNode(`${prefix}-empty`, `No ${prefix} records returned.`, 'info')];
		}
		return records.slice(0, 30).map((record, index) => ({
			id: `${prefix}-${index}`,
			label: safeText(record['action'], safeText(record['operation'], `${prefix} ${index + 1}`)),
			description: [safeText(record['timestamp'], safeText(record['at'], '')), safeText(record['scope'], ''), safeText(record['reason'], '')].filter(Boolean).join(' · '),
			icon: new vscode.ThemeIcon(prefix === 'incident' ? 'warning' : 'info'),
		}));
	}

	private messageNode(id: string, label: string, icon: string, command?: vscode.Command): CoordinationNode {
		return { id, label, icon: new vscode.ThemeIcon(icon), command };
	}
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	outputChannel = vscode.window.createOutputChannel('Trinoris Coordination', { log: true });
	context.subscriptions.push(outputChannel);
	outputChannel.info('Trinoris Coordination activated.');
	const provider = new CoordinationTreeProvider();
	const tree = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: provider, showCollapseAll: true });
	context.subscriptions.push(tree);

	let selectedWorkspace = context.workspaceState.get<string>(WORKSPACE_STATE_KEY);
	let refreshInFlight: Promise<void> | undefined;
	let refreshTimer: ReturnType<typeof setInterval> | undefined;
	let cachedRuntimeDiagnostic: { command: string; version: string; result?: RuntimeDiagnostic; error?: string } | undefined;

	const resolveWorkspace = (): vscode.WorkspaceFolder | undefined => {
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (folders.length === 1) {
			return folders[0];
		}
		return selectedWorkspace ? folders.find(folder => folder.uri.toString() === selectedWorkspace) : undefined;
	};

	const refresh = async (forceRuntimeDiagnostic = false): Promise<void> => {
		if (refreshInFlight) {
			return refreshInFlight;
		}
		refreshInFlight = refreshSnapshot(forceRuntimeDiagnostic);
		try {
			await refreshInFlight;
		} finally {
			refreshInFlight = undefined;
		}
	};

	const refreshSnapshot = async (forceRuntimeDiagnostic: boolean): Promise<void> => {
		if (!vscode.workspace.isTrusted) {
			provider.setWorkspace('Workspace trust is required.', 'Trust this workspace before the panel can run the Trinoris CLI.');
			provider.setSnapshot(emptySnapshot());
			return;
		}

		const folder = resolveWorkspace();
		if (!folder) {
			const folders = vscode.workspace.workspaceFolders ?? [];
			const message = folders.length > 1
				? 'Select one workspace folder for coordination data; the panel never merges repositories.'
				: 'Open a folder containing a Trinoris-enabled checkout.';
			provider.setWorkspace('Workspace not selected', message);
			provider.setSnapshot(emptySnapshot());
			return;
		}

		provider.setWorkspace(folder.name);
		let cliPath: string;
		try {
			cliPath = resolveCliPath();
		} catch (error) {
			cachedRuntimeDiagnostic = undefined;
			provider.setSnapshot({ ...emptySnapshot(), cliError: shortError(error) });
			return;
		}
		let version: string;
		try {
			version = await runCommand(cliPath, ['--version'], folder.uri.fsPath);
		} catch (error) {
			cachedRuntimeDiagnostic = undefined;
			provider.setSnapshot({ ...emptySnapshot(), cliError: formatCliError(error, cliPath) });
			return;
		}
		if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
			cachedRuntimeDiagnostic = undefined;
			provider.setSnapshot({ ...emptySnapshot(), cliError: `Trinoris Agent CLI returned an unrecognized version (${safeText(version, 'empty output')}).` });
			return;
		}
		if (forceRuntimeDiagnostic) {
			try {
				cachedRuntimeDiagnostic = { command: cliPath, version, result: await runRuntimeDiagnostic(cliPath, folder.uri.fsPath) };
			} catch (error) {
				cachedRuntimeDiagnostic = { command: cliPath, version, error: shortError(error) };
			}
		} else if (cachedRuntimeDiagnostic?.command !== cliPath || cachedRuntimeDiagnostic.version !== version) {
			cachedRuntimeDiagnostic = undefined;
		}

		const capabilities = await discoverCapabilities(cliPath, folder.uri.fsPath, version);
		const identity = getAgentIdentity();
		const errors: Record<string, string> = {};
		if (identity?.error) {
			errors['handoffs'] = identity.error;
		}
		for (const [section, capability] of [
			['scopes', 'scope.status'],
			['activity', 'history.journal'],
			['incidents', 'history.incidents'],
			['diagnostics', 'history.diagnose'],
		] as const) {
			if (!capabilities.has(capability)) {
				errors[section] = `The installed CLI does not report ${capability}. Upgrade it to enable this section.`;
			}
		}
		if (identity && !identity.error && !capabilities.has('handoff.inboxActive')) {
			errors['handoffs'] = 'The installed CLI does not report handoff.inboxActive. Upgrade it to enable handoff listing.';
		}
		const runJson = async (key: string, args: string[]): Promise<unknown> => {
			try {
				const result: unknown = JSON.parse(await runCommand(cliPath, [...args, '--work-dir', folder.uri.fsPath, '--json'], folder.uri.fsPath));
				if (isObject(result) && isObject(result['error'])) {
					throw new Error(safeText(result['error']['message'], 'The Trinoris CLI reported an error.'));
				}
				if (!Array.isArray(result) || result.some(value => !isObject(value))) {
					throw new Error('CLI returned malformed JSON; expected an array of records.');
				}
				return result;
			} catch (error) {
				errors[key] = shortError(error);
				return [];
			}
		};

		const results = await Promise.all([
			capabilities.has('scope.status') ? runJson('scopes', ['status']) : Promise.resolve([]),
			capabilities.has('history.journal') ? runJson('activity', ['log']) : Promise.resolve([]),
			capabilities.has('history.incidents') ? runJson('incidents', ['incidents', 'list']) : Promise.resolve([]),
			capabilities.has('history.diagnose') ? runJson('diagnostics', ['diagnose']) : Promise.resolve([]),
			identity && !identity.error && capabilities.has('handoff.inboxActive')
				? runJson('handoffs', ['handoff', 'list', '--agent-class', identity.agentClass, '--instance', identity.agentInstance])
				: Promise.resolve([]),
		]);

		provider.setSnapshot({
			cliVersion: safeText(version, 'unknown'),
			runtimeDiagnostic: cachedRuntimeDiagnostic?.result,
			runtimeDiagnosticError: cachedRuntimeDiagnostic?.error,
			capabilities,
			scopes: asObjectArray(results[0]),
			journal: asObjectArray(results[1]),
			incidents: asObjectArray(results[2]),
			diagnostics: asObjectArray(results[3]),
			handoffs: asObjectArray(results[4]),
			errors,
			observedAt: new Date().toLocaleTimeString(),
			identityConfigured: !!identity && !identity.error,
		});
	};

	const selectWorkspace = async (): Promise<void> => {
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (!folders.length) {
			void vscode.window.showInformationMessage('Open a workspace folder first.');
			return;
		}
		const selected = await vscode.window.showQuickPick(folders.map(folder => ({ label: folder.name, description: folder.uri.fsPath, folder })), {
			placeHolder: 'Select one coordination workspace. Repository data is never merged.'
		});
		if (!selected) {
			return;
		}
		selectedWorkspace = selected.folder.uri.toString();
		await context.workspaceState.update(WORKSPACE_STATE_KEY, selectedWorkspace);
		await refresh();
	};

	const installCli = async (): Promise<void> => {
		const confirm = await vscode.window.showWarningMessage(
			'Install @trinoris/agent-cli globally using npm? This runs npm in a new integrated terminal.',
			{ modal: true },
			'Open Install Terminal'
		);
		if (confirm !== 'Open Install Terminal') {
			return;
		}
		const terminal = vscode.window.createTerminal({ name: 'Install Trinoris Agent CLI' });
		terminal.show();
		terminal.sendText('npm i -g @trinoris/agent-cli && trinoris-agent doctor --runtime --json');
	};

	const toggleVerboseLogging = async (): Promise<void> => {
		const configuration = vscode.workspace.getConfiguration('trinoris');
		const enabled = !configuration.get<boolean>('agentCli.verboseLogging', false);
		await configuration.update('agentCli.verboseLogging', enabled, vscode.ConfigurationTarget.Global);
		void vscode.window.showInformationMessage(`Trinoris CLI verbose logging ${enabled ? 'enabled' : 'disabled'}.`);
	};

	context.subscriptions.push(
		vscode.commands.registerCommand(REFRESH_COMMAND, refresh),
		vscode.commands.registerCommand('trinoris-coordination.runCliDiagnostics', () => refresh(true)),
		vscode.commands.registerCommand('trinoris-coordination.showOutput', () => outputChannel?.show(true)),
		vscode.commands.registerCommand('trinoris-coordination.installCli', installCli),
		vscode.commands.registerCommand('trinoris-coordination.toggleVerboseLogging', toggleVerboseLogging),
		vscode.commands.registerCommand('trinoris-coordination.selectWorkspace', selectWorkspace),
		vscode.commands.registerCommand('trinoris-coordination.openCliSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', 'trinoris.agentCli.path')),
		vscode.commands.registerCommand('trinoris-coordination.openAgentIdentitySettings', () => vscode.commands.executeCommand('workbench.action.openSettings', 'trinoris.agentClass trinoris.agentInstance')),
		vscode.workspace.onDidChangeWorkspaceFolders(() => { void refresh(); }),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('trinoris')) {
				void refresh();
			}
		}),
		tree.onDidChangeVisibility(event => {
			if (event.visible) {
				void refresh();
				refreshTimer ??= setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
			} else if (refreshTimer) {
				clearInterval(refreshTimer);
				refreshTimer = undefined;
			}
		}),
		new vscode.Disposable(() => {
			if (refreshTimer) {
				clearInterval(refreshTimer);
			}
		}),
	);

	await refresh();
}

function emptySnapshot(): Snapshot {
	return { scopes: [], handoffs: [], journal: [], incidents: [], diagnostics: [], errors: {}, identityConfigured: false };
}

function resolveCliPath(): string {
	const configured = vscode.workspace.getConfiguration('trinoris').get<string>('agentCli.path', '').trim();
	if (!configured) {
		return 'trinoris-agent';
	}
	if (!path.isAbsolute(configured)) {
		throw new Error('trinoris.agentCli.path must be an absolute executable path.');
	}
	return configured;
}

function getAgentIdentity(): { agentClass: string; agentInstance: string; error?: string } | undefined {
	const configuration = vscode.workspace.getConfiguration('trinoris');
	const agentClass = configuration.get<string>('agentClass', '').trim();
	const agentInstance = configuration.get<string>('agentInstance', '').trim();
	if (!agentClass && !agentInstance) {
		return undefined;
	}
	const validIdentityPart = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
	if (!validIdentityPart(agentClass) || !validIdentityPart(agentInstance)) {
		return { agentClass, agentInstance, error: 'Agent class and instance must be valid Trinoris identifiers (1–64 letters, numbers, dots, underscores, or hyphens).' };
	}
	return { agentClass, agentInstance };
}

function runCommand(command: string, args: readonly string[], cwd: string, acceptNonZeroOutput = false): Promise<string> {
	const label = commandLabel(args);
	const startedAt = Date.now();
	const verbose = vscode.workspace.getConfiguration('trinoris').get<boolean>('agentCli.verboseLogging', false);
	outputChannel?.info(`Running CLI command: ${label}`);
	return new Promise((resolve, reject) => {
		execFile(command, [...args], { cwd, timeout: 8_000, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true }, (error, stdout, stderr) => {
			if (error) {
				if (acceptNonZeroOutput && stdout.trim()) {
					const code = typeof error.code === 'string' ? error.code : 'unknown';
					outputChannel?.warn(`CLI diagnostic returned status ${code}; parsing its report.`);
					if (verbose) {
						logVerboseCliOutput(label, stdout, stderr);
					}
					resolve(stdout.trim());
					return;
				}
				const detail = typeof stderr === 'string' && stderr.trim() ? stderr : error.message;
				const safeDetail = safeText(detail, 'Trinoris CLI command failed.');
				const code = typeof error.code === 'string' ? error.code : 'unknown';
				outputChannel?.error(`CLI command failed (${label}, ${Date.now() - startedAt} ms, code: ${code}).`);
				if (verbose) {
					logVerboseCliOutput(label, stdout, stderr);
				}
				(error as NodeJS.ErrnoException & { detail?: string }).detail = safeDetail;
				reject(error);
				return;
			}
			outputChannel?.info(`CLI command completed (${label}, ${Date.now() - startedAt} ms).`);
			if (verbose) {
				logVerboseCliOutput(label, stdout, stderr);
			}
			resolve(stdout.trim());
		});
	});
}

async function runRuntimeDiagnostic(command: string, cwd: string): Promise<RuntimeDiagnostic> {
	const value: unknown = JSON.parse(await runCommand(command, ['doctor', '--runtime', '--json'], cwd, true));
	if (!isObject(value)
		|| !['no-known-critical', 'blocked', 'unknown'].includes(String(value['status']))
		|| typeof value['nodeVersion'] !== 'string'
		|| typeof value['supportedMinimum'] !== 'string'
		|| typeof value['catalogUpdatedAt'] !== 'string'
		|| !Array.isArray(value['criticalAdvisories'])
		|| value['criticalAdvisories'].some(advisory => !isObject(advisory))) {
		throw new Error('CLI runtime diagnostic returned an unsupported JSON report.');
	}
	return {
		status: value['status'] as RuntimeDiagnostic['status'],
		nodeVersion: value['nodeVersion'],
		supportedMinimum: value['supportedMinimum'],
		catalogUpdatedAt: value['catalogUpdatedAt'],
		criticalAdvisories: value['criticalAdvisories'] as JsonObject[],
	};
}

function logVerboseCliOutput(label: string, stdout: string, stderr: string): void {
	if (stdout.trim()) {
		outputChannel?.info(`CLI stdout (${label}):\n${stdout.trimEnd()}`);
	}
	if (stderr.trim()) {
		outputChannel?.warn(`CLI stderr (${label}):\n${stderr.trimEnd()}`);
	}
}

function commandLabel(args: readonly string[]): string {
	const firstOption = args.findIndex(argument => argument.startsWith('--'));
	const safeArgs = firstOption === -1 ? args : args.slice(0, firstOption);
	return safeArgs.slice(0, 2).join(' ') || 'version';
}

async function discoverCapabilities(command: string, cwd: string, version: string): Promise<ReadonlySet<string>> {
	try {
		const result: unknown = JSON.parse(await runCommand(command, ['capabilities', '--json'], cwd));
		if (isObject(result) && result['schema_version'] === 1 && Array.isArray(result['capabilities']) && result['capabilities'].every(value => typeof value === 'string')) {
			outputChannel?.info(`CLI capability manifest loaded (${result['capabilities'].length} capabilities).`);
			return new Set(result['capabilities'] as string[]);
		}
	} catch {
		// The current 0.3.0 CLI predates the capability manifest. Use only its documented baseline.
	}

	if (/^0\.3\.\d+(?:[-+].*)?$/.test(version)) {
		outputChannel?.warn('CLI capability manifest unavailable; using the documented 0.3.x capability baseline.');
		return new Set(['scope.status', 'handoff.inboxActive', 'history.journal', 'history.incidents', 'history.diagnose', 'readiness.verify']);
	}
	outputChannel?.warn('CLI capability manifest unavailable; optional sections will be marked unavailable.');
	return new Set();
}

function asObjectArray(value: unknown): JsonObject[] {
	return Array.isArray(value) ? value.filter(isObject) : [];
}

function isObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, fallback: string): string {
	if (typeof value !== 'string') {
		return fallback;
	}
	const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
	return clean ? clean.slice(0, 180) : fallback;
}

function shortError(error: unknown): string {
	const detail = isObject(error) && typeof error['detail'] === 'string' ? error['detail'] : undefined;
	return safeText(detail ?? (error instanceof Error ? error.message : String(error)), 'CLI command failed.');
}

function formatCliError(error: unknown, command: string): string {
	if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
		return `Trinoris Agent CLI not found (${command}). Configure trinoris.agentCli.path or add trinoris-agent to PATH.`;
	}
	const message = shortError(error);
	return message.includes('trinoris.agentCli.path') ? message : `Unable to inspect Trinoris CLI: ${message}`;
}
