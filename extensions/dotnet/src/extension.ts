/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import {
	classifyCsproj,
	firstHttpUrl,
	isRunnableKind,
	parseSlnProjects,
	parseSlnxProjects,
	resolveProfiles,
	splitCommandLineArgs,
	targetFrameworkOf,
	assemblyNameOf,
	LaunchProfile,
	ProjectKind,
} from './logic.js';

const NETCOREDBG_VERSION = '3.2.0-1092';
const SKIP_DIRS = new Set(['bin', 'obj', 'node_modules', '.git', '.vs']);

const STARTUP_KEY = 'dotnet.startupProject';
const PROFILE_KEY_PREFIX = 'dotnet.lastProfile.';
const SOLUTION_KEY = 'dotnet.activeSolution';

interface DotnetProject {
	name: string;
	csproj: string;
	dir: string;
	folder: vscode.WorkspaceFolder;
	kind: ProjectKind;
}

let context: vscode.ExtensionContext;
let statusBarItem: vscode.StatusBarItem;
/** .sln/.slnx paths we already prompted about this session (avoids nagging on every editor switch). */
const promptedSolutions = new Set<string>();

export function activate(ctx: vscode.ExtensionContext): void {
	context = ctx;

	context.subscriptions.push(
		vscode.commands.registerCommand('dotnet.selectStartupProject', () => selectStartupProjectCommand()),
		vscode.commands.registerCommand('dotnet.selectLaunchProfile', () => selectLaunchProfileCommand()),
		vscode.commands.registerCommand('dotnet.selectSolution', () => selectSolutionCommand()),
		vscode.commands.registerCommand('dotnet.run', (arg?: { fsPath?: string }) => runOrDebug('run', arg)),
		vscode.commands.registerCommand('dotnet.debug', (arg?: { fsPath?: string }) => runOrDebug('debug', arg)),
		vscode.commands.registerCommand('dotnet.fetchNetcoredbg', () => fetchNetcoredbgCommand()),
		vscode.debug.registerDebugConfigurationProvider('dotnet', {
			provideDebugConfigurations: () => [{
				name: '.NET: Launch Startup Project',
				type: 'dotnet',
				request: 'launch',
			}],
			resolveDebugConfiguration: (folder, config) => resolveDebugConfiguration(folder, config),
		}),
		vscode.debug.registerDebugAdapterDescriptorFactory('dotnet', {
			createDebugAdapterDescriptor: () => {
				const exe = netcoredbgPath();
				if (!exe) {
					throw new Error('netcoredbg was not found. Run ".NET: Download Debug Adapter (netcoredbg)" first.');
				}
				return new vscode.DebugAdapterExecutable(exe, ['--interpreter=vscode']);
			},
		}),
	);

	// Rider-style solution switcher in the status bar.
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
	statusBarItem.command = 'dotnet.statusMenu';
	context.subscriptions.push(statusBarItem);
	context.subscriptions.push(vscode.commands.registerCommand('dotnet.statusMenu', () => statusMenu()));
	refreshStatusBar();

	// Opening a .sln/.slnx file in an editor offers to make it the active solution.
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
		void maybeOfferActiveSolution(editor);
	}));
	setTimeout(() => {
		void maybeOfferActiveSolution(vscode.window.activeTextEditor);
	}, 3000);
}

// ---------- Detection ----------

interface WorkspaceScan {
	projects: DotnetProject[];
	solutions: string[];
}

async function scanWorkspace(): Promise<WorkspaceScan> {
	const projects = new Map<string, DotnetProject>();
	const solutions: string[] = [];

	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		const root = folder.uri.fsPath;
		await walk(root, root, file => {
			const ext = path.extname(file).toLowerCase();
			if (ext === '.csproj') {
				projects.set(file, makeProject(file, folder));
			} else if (ext === '.sln' || ext === '.slnx') {
				solutions.push(file);
			}
		});
	}

	return { projects: [...projects.values()].sort((a, b) => a.name.localeCompare(b.name)), solutions };
}

function makeProject(csproj: string, folder: vscode.WorkspaceFolder): DotnetProject {
	let kind: ProjectKind = 'LIBRARY';
	try {
		kind = classifyCsproj(fs.readFileSync(csproj, 'utf8'));
	} catch {
		// Unreadable csproj: classified as Library, which is the safe default.
	}
	return { name: path.basename(csproj, '.csproj'), csproj, dir: path.dirname(csproj), folder, kind };
}

/** Walk a directory tree, visiting .csproj/.sln/.slnx files (skipping build-output folders). */
async function walk(_root: string, dir: string, onFile: (file: string) => void | Promise<void>): Promise<void> {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) {
				continue;
			}
			await walk(_root, full, onFile);
		} else if (entry.isFile() && (/\.csproj$/i.test(entry.name) || /\.slnx?$/i.test(entry.name))) {
			await onFile(full);
		}
	}
}

/** The project list is solution-centric: when an Active Solution is set, its projects are the workspace.
 *
 * If the Active Solution cannot be read (deleted, renamed, inaccessible), discovery falls back to
 * the direct csproj scan so the workspace stays usable.
 */
async function getProjects(): Promise<{ projects: DotnetProject[]; solution: string | undefined }> {
	const scan = await scanWorkspace();
	const solution = await getActiveSolution(scan.solutions);

	if (!solution) {
		return { projects: scan.projects, solution: undefined };
	}

	const solutionDir = path.dirname(solution);
	const slnText = fs.readFileSync(solution, 'utf8');
	const relProjects = solution.toLowerCase().endsWith('.slnx')
		? parseSlnxProjects(slnText)
		: parseSlnProjects(slnText);

	const projects: DotnetProject[] = [];
	const fallbackFolder = vscode.workspace.workspaceFolders?.[0];
	for (const rel of relProjects) {
		const abs = path.normalize(path.join(solutionDir, rel));
		if (!fs.existsSync(abs)) {
			continue;
		}
		const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(abs)) ?? fallbackFolder;
		if (folder) {
			projects.push(makeProject(abs, folder));
		}
	}
	if (projects.length === 0) {
		return { projects: scan.projects, solution: undefined };
	}
	projects.sort((a, b) => a.name.localeCompare(b.name));
	return { projects, solution };
}

// ---------- Active solution ----------

async function getActiveSolution(found: string[]): Promise<string | undefined> {
	const stored = context.workspaceState.get<string>(SOLUTION_KEY);
	if (stored) {
		if (fs.existsSync(stored)) {
			return stored;
		}
		context.workspaceState.update(SOLUTION_KEY, undefined);
	}
	if (found.length === 1) {
		context.workspaceState.update(SOLUTION_KEY, found[0]);
		return found[0];
	}
	return undefined;
}

async function setActiveSolution(solutionPath: string | undefined): Promise<void> {
	await context.workspaceState.update(SOLUTION_KEY, solutionPath);
	// The Startup Project may not belong to the newly chosen solution.
	const startup = context.workspaceState.get<string>(STARTUP_KEY);
	if (startup && solutionPath) {
		const solutionDir = path.dirname(solutionPath);
		const inSolution = (solutionPath.toLowerCase().endsWith('.slnx')
			? parseSlnxProjects(fs.readFileSync(solutionPath, 'utf8'))
			: parseSlnProjects(fs.readFileSync(solutionPath, 'utf8'))
		).some(rel => path.normalize(path.join(solutionDir, rel)) === startup);
		if (!inSolution) {
			context.workspaceState.update(STARTUP_KEY, undefined);
		}
	}
	refreshStatusBar();
}

async function maybeOfferActiveSolution(editor: vscode.TextEditor | undefined): Promise<void> {
	const file = editor?.document.uri.fsPath;
	if (!file || !/\.(sln|slnx)$/i.test(file) || promptedSolutions.has(file)) {
		return;
	}
	promptedSolutions.add(file);
	const current = context.workspaceState.get<string>(SOLUTION_KEY);
	if (current === file) {
		return;
	}
	const choice = await vscode.window.showInformationMessage(
		`Use ${path.basename(file)} as the active solution?`,
		'Yes',
		'No',
	);
	if (choice === 'Yes') {
		await setActiveSolution(file);
		vscode.window.showInformationMessage(`Active solution: ${path.basename(file)}.`);
	}
}

async function selectSolutionCommand(): Promise<void> {
	const scan = await scanWorkspace();
	if (scan.solutions.length === 0) {
		vscode.window.showErrorMessage('No .sln or .slnx file found in this workspace.');
		return;
	}
	const current = context.workspaceState.get<string>(SOLUTION_KEY);
	const pick = await vscode.window.showQuickPick(
		scan.solutions.map(s => ({
			label: path.basename(s),
			description: s,
			active: s === current,
			path: s,
		})),
		{ placeHolder: 'Select the active solution' },
	);
	if (pick) {
		await setActiveSolution(pick.path);
		vscode.window.showInformationMessage(`Active solution: ${pick.label}.`);
	}
}

// ---------- Startup project + launch profile selection ----------

async function getProjectsForSelection(): Promise<DotnetProject[]> {
	const { projects } = await getProjects();
	if (projects.length === 0) {
		vscode.window.showErrorMessage('No .NET projects found in this workspace.');
	}
	return projects;
}

async function ensureStartupProject(projects: DotnetProject[], options?: { silent?: boolean }): Promise<DotnetProject | undefined> {
	const stored = storedStartupPath();
	const storedMatch = stored && projects.find(p => p.csproj === stored && isRunnableKind(p.kind));
	if (storedMatch) {
		return storedMatch;
	}
	const runnable = projects.filter(p => isRunnableKind(p.kind));
	if (runnable.length === 1) {
		context.workspaceState.update(STARTUP_KEY, runnable[0].csproj);
		refreshStatusBar();
		return runnable[0];
	}
	if (runnable.length === 0 || options?.silent) {
		return undefined;
	}
	return pickStartupProject(runnable);
}

function storedStartupPath(): string | undefined {
	return context.workspaceState.get<string>(STARTUP_KEY);
}

async function pickStartupProject(runnable: DotnetProject[]): Promise<DotnetProject | undefined> {
	const pick = await vscode.window.showQuickPick(
		runnable.map(p => ({
			label: p.name,
			description: p.kind === 'WEB' ? 'Web Project' : 'Console Project',
			detail: p.csproj,
			project: p,
		})),
		{ placeHolder: 'Select the Startup Project' },
	);
	if (pick) {
		context.workspaceState.update(STARTUP_KEY, pick.project.csproj);
		refreshStatusBar();
		return pick.project;
	}
	return undefined;
}

async function selectStartupProjectCommand(): Promise<void> {
	const projects = await getProjectsForSelection();
	const runnable = projects.filter(p => isRunnableKind(p.kind));
	if (runnable.length === 0) {
		vscode.window.showErrorMessage('No runnable .NET projects found (Library Projects cannot be started).');
		return;
	}
	await pickStartupProject(runnable);
}

async function getProfile(project: DotnetProject): Promise<LaunchProfile | undefined> {
	const lsPath = path.join(project.dir, 'Properties', 'launchSettings.json');
	let text: string | undefined;
	try {
		text = fs.readFileSync(lsPath, 'utf8');
	} catch {
		text = undefined;
	}
	const resolved = resolveProfiles(text, project.kind);

	const remembered = context.workspaceState.get<string>(PROFILE_KEY_PREFIX + project.csproj);
	const rememberedMatch = remembered && resolved.profiles.find(p => p.name === remembered);
	if (rememberedMatch) {
		return rememberedMatch;
	}
	if (resolved.profiles.length === 1) {
		return resolved.profiles[0];
	}
	const pick = await vscode.window.showQuickPick(
		resolved.profiles.map(p => ({
			label: p.name,
			description: p.synthesized ? 'synthesized' : p.applicationUrl,
			profile: p,
		})),
		{ placeHolder: 'Select a Launch Profile' },
	);
	if (pick) {
		context.workspaceState.update(PROFILE_KEY_PREFIX + project.csproj, pick.profile.name);
		return pick.profile;
	}
	return undefined;
}

async function selectLaunchProfileCommand(): Promise<void> {
	const projects = await getProjectsForSelection();
	const project = await ensureStartupProject(projects);
	if (!project) {
		return;
	}
	context.workspaceState.update(PROFILE_KEY_PREFIX + project.csproj, undefined);
	const profile = await getProfile(project);
	if (profile) {
		vscode.window.showInformationMessage(`Launch Profile for ${project.name}: ${profile.name}.`);
	}
}

// ---------- Status bar ----------

function refreshStatusBar(): void {
	if (!statusBarItem) {
		return;
	}
	const startup = storedStartupPath();
	const solution = context.workspaceState.get<string>(SOLUTION_KEY);
	if (startup) {
		const parts = [`$(play) ${path.basename(startup, '.csproj')}`];
		if (solution) {
			parts.push(`$(file-directory) ${path.basename(solution)}`);
		}
		statusBarItem.text = parts.join('  ');
		statusBarItem.tooltip = new vscode.MarkdownString(
			`**Startup Project:** ${path.basename(startup, '.csproj')}` +
			(solution ? `\n\n**Active Solution:** ${path.basename(solution)}` : '') +
			'\n\nClick for .NET actions.',
		);
	} else {
		statusBarItem.text = '$(circle-slash) .NET: no startup project';
		statusBarItem.tooltip = 'Click to select a startup project / solution.';
	}
	statusBarItem.show();
}

async function statusMenu(): Promise<void> {
	const pick = await vscode.window.showQuickPick([
		{ label: '$(play) Run Startup Project', action: 'dotnet.run' },
		{ label: '$(debug-alt) Debug Startup Project', action: 'dotnet.debug' },
		{ label: '$(file-submodule) Select Startup Project', action: 'dotnet.selectStartupProject' },
		{ label: '$(list-ordered) Select Launch Profile', action: 'dotnet.selectLaunchProfile' },
		{ label: '$(folder-active) Select Solution', action: 'dotnet.selectSolution' },
	], { placeHolder: '.NET' });
	if (pick) {
		await vscode.commands.executeCommand(pick.action);
	}
}

// ---------- SDK + build ----------

async function ensureSdk(): Promise<boolean> {
	try {
		await new Promise<string>((resolve, reject) => {
			cp.exec('dotnet --version', { timeout: 10_000 }, (err, stdout) => err ? reject(err) : resolve(stdout));
		});
		return true;
	} catch {
		const choice = await vscode.window.showErrorMessage(
			'The .NET SDK was not found. Install it to build and run .NET projects.',
			'Install .NET',
		);
		if (choice === 'Install .NET') {
			vscode.env.openExternal(vscode.Uri.parse('https://dotnet.microsoft.com/download'));
		}
		return false;
	}
}

/** Build via a task so compiler errors surface in the Problems panel ($msCompile). */
async function buildProject(project: DotnetProject): Promise<boolean> {
	const task = new vscode.Task(
		{ type: 'dotnet-build' },
		project.folder,
		`build ${project.name}`,
		'dotnet',
		// Argument-array form: paths are passed literally, never interpreted by the shell.
		new vscode.ShellExecution('dotnet', ['build', project.csproj]),
		['$msCompile'],
	);
	// Register the completion listener before the task starts: fast-failing builds
	// would otherwise finish before we begin listening.
	const exitPromise = new Promise<number | undefined>(resolve => {
		const d = vscode.tasks.onDidEndTaskProcess(e => {
			if (e.execution.task === task) {
				d.dispose();
				resolve(e.exitCode);
			}
		});
	});
	await vscode.tasks.executeTask(task);
	const exitCode = await exitPromise;
	if (exitCode === undefined || exitCode !== 0) {
		vscode.window.showErrorMessage(`Build failed for ${project.name}. See the Problems panel for details.`);
		return false;
	}
	return true;
}

/** Run the Startup Project's profile as a task; argument-array form keeps paths and
 *  profile names literal (no shell interpretation). */
function runTask(project: DotnetProject, profile: LaunchProfile | undefined): Thenable<vscode.TaskExecution> {
	const args = ['run', '--no-build', '--project', project.csproj];
	if (profile && !profile.synthesized) {
		args.push('--launch-profile', profile.name);
	}
	if (profile?.commandLineArgs) {
		args.push(...splitCommandLineArgs(profile.commandLineArgs));
	}
	const task = new vscode.Task(
		{ type: 'dotnet-run' },
		project.folder,
		`run ${project.name}${profile ? ` (${profile.name})` : ''}`,
		'dotnet',
		new vscode.ShellExecution('dotnet', args),
	);
	task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated };
	task.isBackground = true;
	return vscode.tasks.executeTask(task);
}

// ---------- Run / Debug ----------

async function runOrDebug(mode: 'run' | 'debug', arg?: { fsPath?: string }): Promise<void> {
	let { projects, solution } = await getProjects();
	if (projects.length === 0) {
		vscode.window.showErrorMessage('No .NET projects found in this workspace.');
		return;
	}

	// A context-menu / editor-title invocation carries explicit user intent:
	// a .sln/.slnx becomes the Active Solution; a .csproj is run directly, even
	// when it is not part of the Active Solution.
	if (arg?.fsPath && fs.existsSync(arg.fsPath)) {
		const target = path.normalize(arg.fsPath);
		if (/\.slnx?$/i.test(target)) {
			if (target !== solution) {
				await setActiveSolution(target);
				({ projects } = await getProjects());
			}
		} else if (/\.csproj$/i.test(target)) {
			const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(target)) ?? vscode.workspace.workspaceFolders?.[0];
			if (!folder) {
				vscode.window.showErrorMessage('The selected project is outside the current workspace.');
				return;
			}
			const candidate = makeProject(target, folder);
			if (candidate.kind === 'LIBRARY') {
				vscode.window.showErrorMessage(`${candidate.name} is a Library Project — it has no entry point and cannot be run.`);
				return;
			}
			projects = [candidate];
			context.workspaceState.update(STARTUP_KEY, target);
			refreshStatusBar();
		}
	}

	let project: DotnetProject | undefined = projects.find(p => p.csproj === storedStartupPath() && isRunnableKind(p.kind));
	if (!project) {
		project = await ensureStartupProject(projects);
		if (!project) {
			vscode.window.showErrorMessage('Pick a Startup Project first (.NET: Select Startup Project).');
			return;
		}
	}
	if (project.kind === 'LIBRARY') {
		vscode.window.showErrorMessage(`${project.name} is a Library Project — it has no entry point and cannot be run.`);
		return;
	}
	if (!await ensureSdk()) {
		return;
	}
	if (!await buildProject(project)) {
		return;
	}
	const profile = await getProfile(project);
	if (!profile) {
		// The user dismissed the Launch Profile picker: cancel the launch entirely
		// rather than starting the app without the settings they intended.
		return;
	}

	if (mode === 'debug') {
		await debugProject(project, profile);
		return;
	}

	await runTask(project, profile);
	await autoOpenBrowser(project.kind, profile);
}

async function debugProject(project: DotnetProject, profile: LaunchProfile): Promise<void> {
	const program = await resolveProgram(project);
	if (!program) {
		return;
	}
	const env: Record<string, string> = { ...(profile.environmentVariables ?? {}) };
	// Kestrel honours ASPNETCORE_URLS; Debug does not read the launch profile itself,
	// so hand it the profile's URLs explicitly.
	if (project.kind === 'WEB' && profile.applicationUrl) {
		env.ASPNETCORE_URLS = profile.applicationUrl;
	}
	const folder = project.folder;
	await vscode.debug.startDebugging(folder, {
		type: 'dotnet',
		request: 'launch',
		name: `${project.name} (${profile.name})`,
		program,
		cwd: project.dir,
		env,
		args: profile.commandLineArgs ? splitCommandLineArgs(profile.commandLineArgs) : [],
	});
	await autoOpenBrowser(project.kind, profile);
}

/** Locate the built application DLL, tolerating custom output paths and multi-targeting. */
async function resolveProgram(project: DotnetProject): Promise<string | undefined> {
	let csprojXml = '';
	try {
		csprojXml = fs.readFileSync(project.csproj, 'utf8');
	} catch {
		// Treated as an unknown-framework project below.
	}
	const tfm = targetFrameworkOf(csprojXml);
	if (!tfm) {
		vscode.window.showErrorMessage(`Could not determine the TargetFramework of ${project.name}.`);
		return undefined;
	}
	const assembly = assemblyNameOf(csprojXml) ?? project.name;

	const baseOut = /<BaseOutputPath>\s*([^<\s]+)\s*<\/BaseOutputPath>/i.exec(csprojXml)?.[1];
	const candidates = baseOut
		? [path.resolve(project.dir, baseOut.trim(), 'Debug', tfm, `${assembly}.dll`)]
		: [path.join(project.dir, 'bin', 'Debug', tfm, `${assembly}.dll`)];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	// Last resort: newest matching DLL under the Debug output tree only (the pipeline
	// always builds Debug; searching all configurations could launch a stale Release DLL).
	const binDir = baseOut ? path.resolve(project.dir, baseOut.trim(), 'Debug') : path.join(project.dir, 'bin', 'Debug');
	const found = findNewestDll(binDir, `${assembly}.dll`, 4);
	if (found) {
		return found;
	}
	vscode.window.showErrorMessage(`Build output not found (${assembly}.dll under ${binDir}). Build the project first.`);
	return undefined;
}

function findNewestDll(dir: string, fileName: string, depth: number): string | undefined {
	if (depth <= 0) {
		return undefined;
	}
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return undefined;
	}
	let best: { file: string; mtime: number } | undefined;
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory() && entry.name !== 'ref') {
			const nested = findNewestDll(full, fileName, depth - 1);
			if (nested) {
				const mtime = fs.statSync(nested).mtimeMs;
				if (!best || mtime > best.mtime) {
					best = { file: nested, mtime };
				}
			}
		} else if (entry.isFile() && entry.name === fileName) {
			const mtime = fs.statSync(full).mtimeMs;
			if (!best || mtime > best.mtime) {
				best = { file: full, mtime };
			}
		}
	}
	return best?.file;
}

/** Poll the profile URLs until the server answers, then open the browser (Q12: auto-open). */
async function autoOpenBrowser(kind: ProjectKind, profile: LaunchProfile | undefined): Promise<void> {
	if (kind !== 'WEB' || !profile) {
		return;
	}
	const url = firstHttpUrl(profile.applicationUrl);
	if (!url || !vscode.workspace.getConfiguration('dotnet').get<boolean>('autoOpenBrowser', true)) {
		return;
	}
	for (let i = 0; i < 60; i++) {
		if (await probe(url)) {
			await vscode.env.openExternal(vscode.Uri.parse(url));
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 500));
	}
	const choice = await vscode.window.showInformationMessage(
		`The application did not answer on ${url}. Open the browser anyway?`,
		'Open in browser',
	);
	if (choice === 'Open in browser') {
		await vscode.env.openExternal(vscode.Uri.parse(url));
	}
}

function probe(url: string): Promise<boolean> {
	return new Promise(resolve => {
		const requester = url.startsWith('https:') ? https : http;
		const req = requester.get(url, { rejectUnauthorized: false, timeout: 2000 }, res => {
			res.resume();
			resolve(true);
		});
		req.on('error', () => resolve(false));
		req.on('timeout', () => { req.destroy(); resolve(false); });
	});
}

// ---------- Debug configuration resolution (zero-JSON F5) ----------

async function resolveDebugConfiguration(
	_folder: vscode.WorkspaceFolder | undefined,
	config: vscode.DebugConfiguration | undefined,
): Promise<vscode.DebugConfiguration | undefined> {
	if (config && config.type && config.program) {
		return config; // Fully specified by the caller (our dotnet.debug command path).
	}

	const { projects } = await getProjects();
	// Interactive: with several runnable projects and no remembered choice, the picker appears.
	const project = await ensureStartupProject(projects);
	if (!project) {
		vscode.window.showErrorMessage('No runnable .NET project found. Open a folder with a .csproj or .sln.');
		return undefined;
	}
	if (!await ensureSdk()) {
		return undefined;
	}
	if (!await buildProject(project)) {
		return undefined;
	}
	const profile = await getProfile(project);
	if (!profile) {
		return undefined;
	}
	const program = await resolveProgram(project);
	if (!program) {
		return undefined;
	}
	const env: Record<string, string> = { ...(profile.environmentVariables ?? {}) };
	if (project.kind === 'WEB' && profile.applicationUrl) {
		env.ASPNETCORE_URLS = profile.applicationUrl;
	}
	return {
		type: 'dotnet',
		request: 'launch',
		name: `${project.name} (${profile.name})`,
		program,
		cwd: project.dir,
		env,
		args: profile.commandLineArgs ? profile.commandLineArgs.split(' ').filter(a => a.length > 0) : [],
		...config,
	};
}

// ---------- netcoredbg ----------

function netcoredbgPath(): string | undefined {
	const configured = vscode.workspace.getConfiguration('dotnet').get<string>('netcoredbgPath');
	if (configured) {
		return configured;
	}
	const platform = netcoredbgPlatform();
	const exe = path.join(context.extensionPath, 'netcoredbg', platform, process.platform === 'win32' ? 'netcoredbg.exe' : 'netcoredbg');
	return fs.existsSync(exe) ? exe : undefined;
}

function netcoredbgPlatform(): string {
	return process.platform === 'win32' ? 'win-x64'
		: process.platform === 'darwin' ? (process.arch === 'arm64' ? 'osx-arm64' : 'osx-x64')
		: (process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64');
}

function netcoredbgAsset(platform: string): string {
	const asset = ({
		'win-x64': 'netcoredbg-win64.zip',
		'linux-x64': 'netcoredbg-linux-amd64.tar.gz',
		'linux-arm64': 'netcoredbg-linux-arm64.tar.gz',
		'osx-arm64': 'netcoredbg-osx-arm64.zip',
	} as Record<string, string>)[platform];
	if (!asset) {
		throw new Error(`No netcoredbg asset exists for platform ${platform}. Use the dotnet.netcoredbgPath setting to point at a self-built binary.`);
	}
	return asset;
}

async function fetchNetcoredbgCommand(): Promise<void> {
	try {
		await fetchNetcoredbg();
		vscode.window.showInformationMessage('netcoredbg downloaded. Debugging is ready.');
	} catch (err) {
		vscode.window.showErrorMessage(`netcoredbg download failed: ${(err as Error).message}`);
	}
}

async function fetchNetcoredbg(): Promise<string> {
	const platform = netcoredbgPlatform();
	const asset = netcoredbgAsset(platform);
	const url = `https://github.com/Samsung/netcoredbg/releases/download/${NETCOREDBG_VERSION}/${asset}`;
	const outDir = path.join(context.extensionPath, 'netcoredbg', platform);
	fs.mkdirSync(outDir, { recursive: true });
	const archive = path.join(outDir, asset);
	await download(url, archive);

	await new Promise<void>((resolve, reject) => {
		// bsdtar (Windows 10+) handles zip; everything else has real tar.
		const tarBin = process.platform === 'win32'
			? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
			: 'tar';
		cp.exec(`"${tarBin}" -xf "${archive}" -C "${outDir}"`, { timeout: 120_000 }, err => err ? reject(err) : resolve());
	});

	// Some archives nest everything inside a netcoredbg/ root folder — flatten it.
	const nested = path.join(outDir, 'netcoredbg');
	if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
		for (const entry of fs.readdirSync(nested)) {
			fs.renameSync(path.join(nested, entry), path.join(outDir, entry));
		}
		fs.rmdirSync(nested);
	}
	fs.rmSync(archive, { force: true });

	const exe = path.join(outDir, process.platform === 'win32' ? 'netcoredbg.exe' : 'netcoredbg');
	if (!fs.existsSync(exe)) {
		throw new Error(`netcoredbg binary not found after extracting ${asset}.`);
	}
	if (process.platform !== 'win32') {
		fs.chmodSync(exe, 0o755);
	}
	return exe;
}

function download(url: string, dest: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = (u: string, redirects: number): void => {
			const mod = u.startsWith('https:') ? https : http;
			const req = mod.get(u, res => {
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
					res.resume();
					request(new URL(res.headers.location).toString(), redirects + 1);
					return;
				}
				if (res.statusCode !== 200) {
					reject(new Error(`HTTP ${res.statusCode} for ${u}`));
					return;
				}
				const file = fs.createWriteStream(dest);
				res.pipe(file);
				file.on('finish', () => file.close(() => resolve()));
				file.on('error', reject);
			});
			req.on('error', reject);
		};
		request(url, 0);
	});
}
