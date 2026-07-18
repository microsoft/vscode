/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  RoboAgent — Colcon Build Center (WS3)
 *
 *  A `colcon` TaskProvider producing build / test / clean tasks, plus helpers that the command
 *  layer (commands.ts) reuses. Errors surface via the `$colcon` problem matcher (layered on
 *  `$gcc`) declared in package.json. `colcon` is detected on PATH; when absent the caller warns
 *  and skips rather than throwing.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { findColconRoot, ros2SourcePrefix } from './util';

export type ColconMode = 'build' | 'test' | 'clean';

/** The shape of a `colcon` task in tasks.json (matches `contributes.taskDefinitions`). */
export interface ColconTaskDefinition extends vscode.TaskDefinition {
	type: 'colcon';
	mode: ColconMode;
	/** Restrict a build/test to these packages (`--packages-select`). */
	packages?: string[];
}

/**
 * Build the argv for a `colcon build`/`colcon test` invocation.
 * `--symlink-install` exists only on the `build` verb; `clean` is not a colcon
 * verb at all and is realized as a shell rm (see commandLine).
 */
function buildColconArgs(mode: 'build' | 'test', packages?: string[]): string[] {
	const args: string[] = [mode];
	if (mode === 'build') {
		args.push('--symlink-install');
	}
	if (packages && packages.length > 0) {
		args.push('--packages-select', ...packages);
	}
	return args;
}

/** The full shell command line for a colcon mode, sourcing the ROS2 distro env when available. */
export function colconCommandLine(mode: ColconMode, packages?: string[]): string {
	if (mode === 'clean') {
		return 'rm -rf build install log';
	}
	return `${ros2SourcePrefix()}colcon ${buildColconArgs(mode, packages).join(' ')}`;
}

function createTask(def: ColconTaskDefinition, root: vscode.Uri, name: string): vscode.Task {
	const execution = new vscode.ShellExecution(colconCommandLine(def.mode, def.packages), { cwd: root.fsPath });
	const scope = vscode.workspace.getWorkspaceFolder(root) ?? vscode.TaskScope.Workspace;
	const task = new vscode.Task(def, scope, name, 'RoboAgent', execution, def.mode === 'clean' ? [] : ['$colcon']);
	task.group = def.mode === 'test' ? vscode.TaskGroup.Test : vscode.TaskGroup.Build;
	task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Shared, clear: true };
	return task;
}

/** Create a ready-to-run colcon task, resolving the workspace root. Used by commands.ts. */
export async function makeColconTask(mode: ColconMode, packages?: string[]): Promise<vscode.Task | undefined> {
	const root = await findColconRoot();
	if (!root) {
		return undefined;
	}
	const label = mode === 'build'
		? (packages?.length ? `Build ${packages.join(', ')}` : 'Build Workspace')
		: mode === 'test' ? 'Test Workspace' : 'Clean';
	return createTask({ type: 'colcon', mode, ...(packages ? { packages } : {}) }, root, label);
}

class ColconTaskProvider implements vscode.TaskProvider {
	async provideTasks(): Promise<vscode.Task[]> {
		const root = await findColconRoot();
		if (!root) {
			return [];
		}
		return [
			createTask({ type: 'colcon', mode: 'build' }, root, 'Build Workspace'),
			createTask({ type: 'colcon', mode: 'test' }, root, 'Test Workspace'),
			createTask({ type: 'colcon', mode: 'clean' }, root, 'Clean'),
		];
	}

	async resolveTask(task: vscode.Task): Promise<vscode.Task | undefined> {
		const def = task.definition as ColconTaskDefinition;
		if (def.type !== 'colcon' || !def.mode) {
			return undefined;
		}
		// TaskScope is a numeric enum, so an object scope is the WorkspaceFolder case.
		const scope = task.scope;
		const root = typeof scope === 'object' ? scope.uri : await findColconRoot();
		if (!root) {
			return undefined;
		}
		// Preserve the user's definition; supply the execution.
		return createTask(def, root, task.name || def.mode);
	}
}

export function registerColconTasks(): vscode.Disposable {
	return vscode.tasks.registerTaskProvider('colcon', new ColconTaskProvider());
}
