/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  RoboAgent — Commands & action layer (WS1)
 *
 *  The `RoboAgent` command set: colcon build/test/clean, launch run/stop, and node run/debug.
 *  Node/package payloads arrive from the fork Package-Explorer context menu (WS7); when invoked
 *  from the palette the handlers prompt for the missing bits.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { makeColconTask, ColconMode } from './colconTasks';
import { debugNode, runNodeInTerminal, NodeDebugPayload } from './debug';
import { findColconRoot, isSafeRos2Name, onPath, ros2Available, ros2SourcePrefix } from './util';

let launchTerminal: vscode.Terminal | undefined;

async function runColcon(mode: ColconMode, packages?: string[]): Promise<void> {
	if (mode !== 'clean' && !(await onPath('colcon'))) {
		vscode.window.showWarningMessage(vscode.l10n.t('`colcon` was not found on PATH. Install it (e.g. `apt install python3-colcon-common-extensions`) to build ROS2 workspaces.'));
		return;
	}
	// Package names reach a shell command line (--packages-select) — accept identifiers only.
	const bad = packages?.find(p => !isSafeRos2Name(p));
	if (bad !== undefined) {
		vscode.window.showErrorMessage(vscode.l10n.t('"{0}" is not a valid ROS2 package name.', bad));
		return;
	}
	const task = await makeColconTask(mode, packages);
	if (!task) {
		vscode.window.showWarningMessage(vscode.l10n.t('RoboAgent: no colcon workspace detected (no folder with `src/` or a `package.xml`).'));
		return;
	}
	if (mode === 'clean') {
		// Destructive: deletes the colcon output dirs. Confirm with the exact target.
		const root = await findColconRoot();
		const confirm = vscode.l10n.t('Delete');
		const choice = await vscode.window.showWarningMessage(
			vscode.l10n.t('This deletes the build/, install/ and log/ folders in "{0}".', root?.fsPath ?? ''),
			{ modal: true }, confirm);
		if (choice !== confirm) {
			return;
		}
	}
	await vscode.tasks.executeTask(task);
}

function packageArg(arg: unknown): string | undefined {
	if (typeof arg === 'string') { return arg; }
	const pkg = (arg as { package?: unknown } | null | undefined)?.package;
	return typeof pkg === 'string' ? pkg : undefined;
}

async function runLaunch(): Promise<void> {
	const active = vscode.window.activeTextEditor?.document.uri;
	let target = active && active.path.endsWith('.launch.py') ? active : undefined;
	if (!target) {
		const found = await vscode.workspace.findFiles('**/*.launch.py', '**/{build,install,log,node_modules}/**', 50);
		if (found.length === 0) {
			vscode.window.showWarningMessage(vscode.l10n.t('RoboAgent: no `*.launch.py` files found in this workspace.'));
			return;
		}
		const pick = await vscode.window.showQuickPick(
			found.map(u => ({ label: path.posix.basename(u.path), description: vscode.workspace.asRelativePath(u), uri: u })),
			{ title: vscode.l10n.t('Run ROS2 Launch File'), placeHolder: vscode.l10n.t('Select a launch file') });
		if (!pick) { return; }
		target = pick.uri;
	}
	if (!(await ros2Available())) {
		vscode.window.showWarningMessage(vscode.l10n.t('No ROS2 installation found (`ros2` not on PATH and no /opt/ros). Install ROS2 to run launch files.'));
		return;
	}
	const root = await findColconRoot(target);
	launchTerminal?.dispose();
	launchTerminal = vscode.window.createTerminal('ROS2: Launch');
	launchTerminal.show();
	launchTerminal.sendText(`${ros2SourcePrefix(root?.fsPath)}ros2 launch "${target.fsPath}"`);
}

export function registerCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
	const reg = vscode.commands.registerCommand;
	return [
		reg('roboagent.colconBuild', () => runColcon('build')),
		reg('roboagent.colconTest', () => runColcon('test')),
		reg('roboagent.colconClean', () => runColcon('clean')),
		reg('roboagent.colconBuildPackage', async (arg: unknown) => {
			let pkg = packageArg(arg);
			if (!pkg) {
				pkg = await vscode.window.showInputBox({ title: vscode.l10n.t('Colcon: Build Package'), prompt: vscode.l10n.t('Package name (--packages-select)') });
			}
			if (pkg) { await runColcon('build', [pkg]); }
		}),
		reg('roboagent.runLaunch', () => runLaunch()),
		reg('roboagent.stopLaunch', () => { launchTerminal?.dispose(); launchTerminal = undefined; }),
		reg('roboagent.runNode', async (arg: NodeDebugPayload) => {
			if (!arg?.package || !arg?.node) {
				vscode.window.showErrorMessage(vscode.l10n.t('RoboAgent: no ROS2 node selected to run.'));
				return;
			}
			await runNodeInTerminal(arg);
		}),
		reg('roboagent.debugNode', (arg: NodeDebugPayload) => debugNode(context, arg)),
	];
}
