/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  RoboAgent — New-Project Wizard (REQ-4)
 *
 *  `roboagent.newProject`: a guided, stepped picker that walks
 *    1. Control Level (High/Low) → 2. Framework/Domain or Target → 3. Environment (high-level)
 *    → 4. Name + Location, then scaffolds a starter, writes `.roboagent/project.json`, and
 *  opens the folder (the fork indexes it on open — REQ-1).
 *  See requirements_docs/roboagent_req_project_type_selection.md.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TARGET_DATABASE, getTarget, TargetDefinition } from './targets/targetDatabase';
import { onPath } from './util';

type ControlLevel = 'high' | 'low';
type Domain = 'ros2' | 'opencv' | 'nlp';
type Env = 'host' | 'target' | 'vm';

interface ProjectConfig {
	controlLevel: ControlLevel;
	domain?: Domain;
	env?: Env;
	target: string;              // low-level target id, or 'host' for high-level
	createdWith: string;
}

interface WizardState {
	controlLevel?: ControlLevel;
	domain?: Domain;
	env?: Env;
	targetId?: string;
}

/** Sentinel returned by a step when the user pressed Back. */
const BACK = Symbol('back');

/**
 * The high-level domain catalog — the same data-driven shape as the low-level
 * Target Database: picker items, scaffold, and toolchain probe/hint all come
 * from one entry, so adding a domain is a data edit only.
 */
interface DomainDefinition {
	readonly id: Domain;
	readonly label: string;
	readonly description: string;
	readonly scaffold: string;
	readonly toolchainProbe: string;
	readonly toolchainHint: string;
}

const DOMAIN_DATABASE: readonly DomainDefinition[] = [
	{
		id: 'ros2', label: '$(rocket) ROS2', description: 'ament package (colcon)', scaffold: 'ros2-ament',
		toolchainProbe: 'colcon', toolchainHint: 'Install ROS2 + colcon (e.g. `apt install python3-colcon-common-extensions`).',
	},
	{
		id: 'opencv', label: '$(device-camera) OpenCV', description: 'Python vision project', scaffold: 'opencv-python',
		toolchainProbe: 'python3', toolchainHint: 'Install Python 3 to build and run this project.',
	},
	{
		id: 'nlp', label: '$(comment-discussion) NLP', description: 'Python NLP project', scaffold: 'nlp-python',
		toolchainProbe: 'python3', toolchainHint: 'Install Python 3 to build and run this project.',
	},
];

/** The CLI probe + install hint proving the selection's toolchain is present (R4.7). */
function toolchainFor(state: WizardState): { tool: string; hint: string } | undefined {
	const entry = state.controlLevel === 'high'
		? DOMAIN_DATABASE.find(d => d.id === state.domain)
		: state.targetId ? getTarget(state.targetId) : undefined;
	return entry ? { tool: entry.toolchainProbe, hint: entry.toolchainHint } : undefined;
}

export function registerNewProject(context: vscode.ExtensionContext): vscode.Disposable {
	return vscode.commands.registerCommand('roboagent.newProject', () => runWizard(context));
}

async function runWizard(context: vscode.ExtensionContext): Promise<void> {
	const state: WizardState = {};

	// A tiny branching state machine so Back navigation works across the two branches.
	type StepId = 'control' | 'domain' | 'env' | 'target' | 'nameLocation';
	let step: StepId = 'control';
	let name: string | undefined;
	let parent: vscode.Uri | undefined;

	while (true) {
		switch (step) {
			case 'control': {
				const pick = await pickStep<ControlLevel>('New Project — Control Level', 1, [
					{ label: '$(dashboard) High-Level Control', description: 'Autonomy, perception, NLP — ROS2 / OpenCV / NLP', value: 'high' },
					{ label: '$(circuit-board) Low-Level Control', description: 'Microcontroller firmware — STM32 / ESP32', value: 'low' },
				], false);
				if (pick === undefined) { return; }        // cancelled
				if (pick === BACK) { return; }              // first step: back == cancel
				state.controlLevel = pick;
				step = pick === 'high' ? 'domain' : 'target';
				break;
			}
			case 'domain': {
				const pick = await pickStep<Domain>('New Project — Domain', 2,
					DOMAIN_DATABASE.map(d => ({ label: d.label, description: d.description, value: d.id })), true);
				if (pick === undefined) { return; }
				if (pick === BACK) { step = 'control'; break; }
				state.domain = pick;
				step = 'env';
				break;
			}
			case 'env': {
				const pick = await pickStep<Env>('New Project — Environment', 3, [
					{ label: '$(vm) On Host', description: 'Build and run on this machine', value: 'host' },
					{ label: '$(remote) On Target', description: 'Remote device (future deploy)', value: 'target' },
					{ label: '$(server) VM', description: 'Virtual machine', value: 'vm' },
				], true);
				if (pick === undefined) { return; }
				if (pick === BACK) { step = 'domain'; break; }
				state.env = pick;
				step = 'nameLocation';
				break;
			}
			case 'target': {
				const items = TARGET_DATABASE.map((t: TargetDefinition) => ({
					label: `$(circuit-board) ${t.label}`,
					description: t.description,
					value: t.id,
				}));
				const pick = await pickStep<string>('New Project — Target', 2, items, true);
				if (pick === undefined) { return; }
				if (pick === BACK) { step = 'control'; break; }
				state.targetId = pick;
				step = 'nameLocation';
				break;
			}
			case 'nameLocation': {
				const enteredName = await inputStep(
					'New Project — Name',
					state.controlLevel === 'high' ? 4 : 3,
					'Project name (used as the folder and, for ROS2, the package name)',
					name ?? '',
					v => (/^[A-Za-z][\w-]*$/.test(v.trim()) ? undefined : 'Use a letter followed by letters, digits, _ or -'));
				if (enteredName === undefined) { return; }          // Escape cancels the wizard
				if (enteredName === BACK) {
					step = state.controlLevel === 'high' ? 'env' : 'target';
					break;
				}
				name = enteredName.trim();

				const picked = await vscode.window.showOpenDialog({
					title: 'New Project — Location (choose the parent folder)',
					canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
					openLabel: 'Create here',
				});
				if (!picked || picked.length === 0) { break; }   // re-prompt name/location
				parent = picked[0];

				await scaffoldAndOpen(context, state, name, parent);
				return;
			}
		}
	}
}

interface StepItem<T> extends vscode.QuickPickItem { value: T }

/** Show a text-entry step with a Back button. Resolves to the value | BACK | undefined(cancel). */
function inputStep(title: string, stepNo: number, prompt: string, value: string, validate: (v: string) => string | undefined): Promise<string | typeof BACK | undefined> {
	return new Promise(resolve => {
		const ib = vscode.window.createInputBox();
		ib.title = title;
		ib.step = stepNo;
		ib.prompt = prompt;
		ib.value = value;
		ib.ignoreFocusOut = true;
		ib.buttons = [vscode.QuickInputButtons.Back];
		let done = false;
		ib.onDidChangeValue(v => { ib.validationMessage = validate(v); });
		ib.onDidTriggerButton(b => {
			if (b === vscode.QuickInputButtons.Back) { done = true; resolve(BACK); ib.hide(); }
		});
		ib.onDidAccept(() => {
			const message = validate(ib.value);
			if (message) { ib.validationMessage = message; return; }
			done = true; resolve(ib.value); ib.hide();
		});
		ib.onDidHide(() => { if (!done) { resolve(undefined); } ib.dispose(); });
		ib.show();
	});
}

/** Show one step as a QuickPick with an optional Back button. Resolves to value | BACK | undefined(cancel). */
function pickStep<T>(title: string, stepNo: number, items: StepItem<T>[], canGoBack: boolean): Promise<T | typeof BACK | undefined> {
	return new Promise(resolve => {
		const qp = vscode.window.createQuickPick<StepItem<T>>();
		qp.title = title;
		qp.step = stepNo;
		qp.items = items;
		qp.ignoreFocusOut = true;
		qp.buttons = canGoBack ? [vscode.QuickInputButtons.Back] : [];
		let done = false;
		qp.onDidTriggerButton(b => {
			if (b === vscode.QuickInputButtons.Back) { done = true; resolve(BACK); qp.hide(); }
		});
		qp.onDidAccept(() => {
			const sel = qp.selectedItems[0];
			if (sel) { done = true; resolve(sel.value); qp.hide(); }
		});
		qp.onDidHide(() => { if (!done) { resolve(undefined); } qp.dispose(); });
		qp.show();
	});
}

async function scaffoldAndOpen(context: vscode.ExtensionContext, state: WizardState, name: string, parent: vscode.Uri): Promise<void> {
	const dest = vscode.Uri.joinPath(parent, name);

	// Refuse to clobber a non-empty existing folder.
	try {
		const existing = await vscode.workspace.fs.readDirectory(dest);
		if (existing.length > 0) {
			vscode.window.showErrorMessage(vscode.l10n.t('Folder "{0}" already exists and is not empty.', name));
			return;
		}
	} catch {
		// Does not exist yet — good.
	}

	const scaffold = state.controlLevel === 'high'
		? DOMAIN_DATABASE.find(d => d.id === state.domain)!.scaffold
		: getTarget(state.targetId!)!.scaffold;

	const templateRoot = vscode.Uri.joinPath(context.extensionUri, 'templates', scaffold);
	const pkgName = sanitizePkg(name);

	await vscode.workspace.fs.createDirectory(dest);
	await copyTemplate(templateRoot, dest, pkgName);
	await writeProjectJson(dest, state, context);

	// Toolchain detection — warn, never block (R4.7).
	const probe = toolchainFor(state);
	if (probe && !(await onPath(probe.tool))) {
		vscode.window.showWarningMessage(vscode.l10n.t('"{0}" was not found on PATH. The project was created anyway. {1}', probe.tool, probe.hint));
	}

	// Opening the folder reloads this window (and extension host); the fork's
	// Ros2IndexBootstrap indexes the new workspace on open — no nudge needed.
	await vscode.commands.executeCommand('vscode.openFolder', dest, { forceNewWindow: false });
}

function sanitizePkg(name: string): string {
	const s = name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
	return /^[a-z]/.test(s) ? s : `pkg_${s}`;
}

async function copyTemplate(src: vscode.Uri, dest: vscode.Uri, pkgName: string): Promise<void> {
	const entries = await vscode.workspace.fs.readDirectory(src);
	for (const [entryName, type] of entries) {
		const from = vscode.Uri.joinPath(src, entryName);
		const to = vscode.Uri.joinPath(dest, entryName);
		if (type === vscode.FileType.Directory) {
			await vscode.workspace.fs.createDirectory(to);
			await copyTemplate(from, to, pkgName);
		} else {
			const bytes = await vscode.workspace.fs.readFile(from);
			const text = Buffer.from(bytes).toString('utf8').replace(/__PKG__/g, pkgName);
			await vscode.workspace.fs.writeFile(to, Buffer.from(text, 'utf8'));
		}
	}
}

async function writeProjectJson(dest: vscode.Uri, state: WizardState, context: vscode.ExtensionContext): Promise<void> {
	const version = (context.extension?.packageJSON?.version as string | undefined) ?? '0.0.0';
	const config: ProjectConfig = {
		controlLevel: state.controlLevel!,
		target: state.controlLevel === 'high' ? 'host' : state.targetId!,
		createdWith: `roboagent-new-project@${version}`,
	};
	if (state.controlLevel === 'high') {
		config.domain = state.domain;
		config.env = state.env;
	}
	const dir = vscode.Uri.joinPath(dest, '.roboagent');
	await vscode.workspace.fs.createDirectory(dir);
	await vscode.workspace.fs.writeFile(
		vscode.Uri.joinPath(dir, 'project.json'),
		Buffer.from(JSON.stringify(config, null, 2) + '\n', 'utf8'),
	);
}
