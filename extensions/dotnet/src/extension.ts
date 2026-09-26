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
	resolveProfiles,
	targetFrameworkOf,
	assemblyNameOf,
	LaunchProfile,
	ProjectKind,
} from './logic.js';

const NETCOREDBG_VERSION = '3.2.0-1092';
/** Asset names as published on Samsung/netcoredbg releases (no osx-x64 asset exists upstream). */
const NETCOREDBG_ASSETS: Record<string, string> = {
	'win-x64': 'netcoredbg-win64.zip',
	'linux-x64': 'netcoredbg-linux-amd64.tar.gz',
	'linux-arm64': 'netcoredbg-linux-arm64.tar.gz',
	'osx-arm64': 'netcoredbg-osx-arm64.zip',
};
const SKIP_DIRS = new Set(['bin', 'obj', 'node_modules', '.git', '.vs']);

interface DotnetProject {
	name: string;
	csproj: string;
	dir: string;
	folder: vscode.WorkspaceFolder;
	kind: ProjectKind;
}

let context: vscode.ExtensionContext;

export function activate(ctx: vscode.ExtensionContext): void {
	context = ctx;

	context.subscriptions.push(
		vscode.commands.registerCommand('dotnet.selectStartupProject', () => selectStartupProjectCommand()),
		vscode.commands.registerCommand('dotnet.selectLaunchProfile', () => selectLaunchProfileCommand()),
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
}

// ---------- Detection ----------

async function scanProjects(): Promise<DotnetProject[]> {
	const projects = new Map<string, DotnetProject>();
	const solutions: string[] = [];

	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		const root = folder.uri.fsPath;
		await walk(root, root, async file => {
			const ext = path.extname(file).toLowerCase();
			if (ext === '.csproj') {
				projects.set(file, makeProject(file, folder));
			} else if (ext === '.sln') {
				solutions.push(file);
			}
		});
	}

	// Projects referenced by solutions but living outside the scanned tree still count.
	for (const sln of solutions) {
		const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(sln));
		if (!folder) {
			continue;
		}
		try {
			const slnDir = path.dirname(sln);
			for (const rel of parseSlnProjects(fs.readFileSync(sln, 'utf8'))) {
				const abs = path.normalize(path.join(slnDir, rel));
				if (!projects.has(abs) && fs.existsSync(abs)) {
					projects.set(abs, makeProject(abs, folder));
				}
			}
		} catch {
			// Unreadable solution: the direct csproj scan still holds.
		}
	}

	return [...projects.values()].sort((a, b) => a.name.localeCompare(b.name));
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

async function walk(root: string, dir: string, onFile: (file: string) => Promise<void>): Promise<void> {
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
			await walk(root, full, onFile);
		} else if (entry.isFile() && /\.csproj$/i.test(entry.name)) {
			await onFile(full);
		}
	}
}

// ---------- Startup project + launch profile selection ----------

async function getProjects(): Promise<DotnetProject[]> {
	const projects = await scanProjects();
	if (projects.length === 0) {
		vscode.window.showErrorMessage('No .NET projects found in this workspace.');
	}
	return projects;
}

function storedStartupPath(): string | undefined {
	return context.workspaceState.get<string>(STARTUP_KEY);
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
		return runnable[0];
	}
	if (runnable.length === 0 || options?.silent) {
		return undefined;
	}
	return pickStartupProject(runnable);
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
		return pick.project;
	}
	return undefined;
}

async function selectStartupProjectCommand(): Promise<void> {
	const projects = await getProjects();
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
	const projects = await getProjects();
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

async function buildProject(project: DotnetProject): Promise<boolean> {
	const definition = { type: 'dotnet-build' };
	const task = new vscode.Task(
		definition,
		project.folder,
		`build ${project.name}`,
		'dotnet',
		new vscode.ShellExecution(`dotnet build "${project.csproj}"`),
		['$msCompile'],
	);
	const execution = await vscode.tasks.executeTask(task);
	const exitCode = await new Promise<number | undefined>(resolve => {
		const d = vscode.tasks.onDidEndTaskProcess(e => {
			if (e.execution === execution) {
				d.dispose();
				resolve(e.exitCode);
			}
		});
	});
	if (exitCode !== 0) {
		vscode.window.showErrorMessage(`Build failed for ${project.name}. See the Problems panel for details.`);
		return false;
	}
	return true;
}

// ---------- Run / Debug ----------

async function runOrDebug(mode: 'run' | 'debug', arg?: { fsPath?: string }): Promise<void> {
	const projects = await scanProjects();
	if (projects.length === 0) {
		vscode.window.showErrorMessage('No .NET projects found in this workspace.');
		return;
	}

	// A context-menu / editor-title invocation on a specific project overrides the stored Startup Project.
	let project: DotnetProject | undefined;
	if (arg?.fsPath && /\.csproj$/i.test(arg.fsPath)) {
		project = projects.find(p => p.csproj === path.normalize(arg.fsPath!));
		if (project && project.kind === 'LIBRARY') {
			vscode.window.showErrorMessage(`${project.name} is a Library Project — it has no entry point and cannot be run.`);
			return;
		}
		if (project) {
			context.workspaceState.update(STARTUP_KEY, project.csproj);
		}
	}
	if (!project) {
		project = await ensureStartupProject(projects);
		if (!project) {
			vscode.window.showErrorMessage('Pick a Startup Project first (.NET: Select Startup Project).');
			return;
		}
	}
	if (!await ensureSdk()) {
		return;
	}
	if (!await buildProject(project)) {
		return;
	}
	const profile = await getProfile(project);

	if (mode === 'debug') {
		await debugProject(project, profile);
		return;
	}

	const term = vscode.window.createTerminal({
		name: `dotnet: ${project.name}${profile ? ` (${profile.name})` : ''}`,
	});
	term.show();
	let command = `dotnet run --no-build --project "${project.csproj}"`;
	if (profile && !profile.synthesized) {
		command += ` --launch-profile "${profile.name}"`;
	}
	term.sendText(command);
	await autoOpenBrowser(project.kind, profile);
}

async function debugProject(project: DotnetProject, profile: LaunchProfile | undefined): Promise<void> {
	const program = await resolveProgram(project);
	if (!program) {
		return;
	}
	const folder = project.folder;
	await vscode.debug.startDebugging(folder, {
		type: 'dotnet',
		request: 'launch',
		name: `${project.name}${profile ? ` (${profile.name})` : ''}`,
		program,
		cwd: project.dir,
		env: { ...(profile?.environmentVariables ?? {}) },
	});
	await autoOpenBrowser(project.kind, profile);
}

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
	const program = path.join(project.dir, 'bin', 'Debug', tfm, `${assembly}.dll`);
	if (!fs.existsSync(program)) {
		vscode.window.showErrorMessage(`Build output not found: ${program}. Build the project first.`);
		return undefined;
	}
	return program;
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

	const projects = await scanProjects();
	const project = await ensureStartupProject(projects, { silent: true });
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
	const program = await resolveProgram(project);
	if (!program) {
		return undefined;
	}
	return {
		type: 'dotnet',
		request: 'launch',
		name: `${project.name}${profile ? ` (${profile.name})` : ''}`,
		program,
		cwd: project.dir,
		env: { ...(profile?.environmentVariables ?? {}) },
		...config,
	};
}

// ---------- netcoredbg ----------

function netcoredbgPath(): string | undefined {
	const configured = vscode.workspace.getConfiguration('dotnet').get<string>('netcoredbgPath');
	if (configured) {
		return configured;
	}
	const platform = process.platform === 'win32' ? 'win-x64'
		: process.platform === 'darwin' ? (process.arch === 'arm64' ? 'osx-arm64' : 'osx-x64')
		: (process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64');
	const exe = path.join(context.extensionPath, 'netcoredbg', platform, process.platform === 'win32' ? 'netcoredbg.exe' : 'netcoredbg');
	return fs.existsSync(exe) ? exe : undefined;
}

async function fetchNetcoredbgCommand(): Promise<void> {
	try {
		await fetchNetcoredbg();
		vscode.window.showInformationMessage('netcoredbg downloaded. Debugging is ready.');
	} catch (err) {
		vscode.window.showErrorMessage(`netcoredbg download failed: ${(err as Error).message}`);
	}
}

function netcoredbgPlatform(): string {
	return process.platform === 'win32' ? 'win-x64'
		: process.platform === 'darwin' ? (process.arch === 'arm64' ? 'osx-arm64' : 'osx-x64')
		: (process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64');
}

async function fetchNetcoredbg(): Promise<string> {
	const platform = netcoredbgPlatform();
	const asset = NETCOREDBG_ASSETS[platform];
	if (!asset) {
		throw new Error(`No netcoredbg asset known for platform ${platform}.`);
	}
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
	fs.rmSync(archive, { force: true });

	// Some archives nest everything inside a netcoredbg/ root folder — flatten it.
	const nested = path.join(outDir, 'netcoredbg');
	if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
		for (const entry of fs.readdirSync(nested)) {
			fs.renameSync(path.join(nested, entry), path.join(outDir, entry));
		}
		fs.rmdirSync(nested);
	}

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

const STARTUP_KEY = 'dotnet.startupProject';
const PROFILE_KEY_PREFIX = 'dotnet.lastProfile.';
