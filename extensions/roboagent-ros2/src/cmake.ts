/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  RoboAgent — Generic CMake & single-file C/C++/Python build-run.
 *
 *  Ported from the retired `roboagent-defaults` extension so the non-ROS2 "IDE feel" survives:
 *  CMake configure/build/run/clean tasks, a g++ single-file build task, active-file build/run
 *  commands, editor-title buttons, and status-bar buttons for CMake projects. ROS2/colcon build
 *  lives in colconTasks.ts; this file is deliberately ROS2-agnostic.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const CPP_TASK_TYPE = 'roboagent-cpp';
const CMAKE_TASK_TYPE = 'roboagent-cmake';

export function isCMakeProject(): boolean {
	return (vscode.workspace.workspaceFolders ?? [])
		.some(folder => fs.existsSync(path.join(folder.uri.fsPath, 'CMakeLists.txt')));
}

// --- Task providers --------------------------------------------------------

class CppTaskProvider implements vscode.TaskProvider {
	provideTasks(): vscode.Task[] {
		const execution = new vscode.ShellExecution(
			'/usr/bin/g++',
			['-fdiagnostics-color=always', '-g', '-std=c++17', '${file}', '-o', '${fileDirname}/${fileBasenameNoExtension}'],
			{ cwd: '${fileDirname}' });
		const task = new vscode.Task({ type: CPP_TASK_TYPE }, vscode.TaskScope.Workspace, 'g++ build active file', 'RoboAgent', execution, ['$colcon']);
		task.group = vscode.TaskGroup.Build;
		task.presentationOptions = { reveal: vscode.TaskRevealKind.Silent, panel: vscode.TaskPanelKind.Shared };
		return [task];
	}
	resolveTask(): undefined { return undefined; }
}

class CMakeTaskProvider implements vscode.TaskProvider {
	provideTasks(): vscode.Task[] {
		return [
			this.task('CMake configure', new vscode.ShellExecution('cmake',
				['-B', '${workspaceFolder}/build', '-S', '${workspaceFolder}', '-DCMAKE_BUILD_TYPE=Debug', '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON'],
				{ cwd: '${workspaceFolder}' }), vscode.TaskGroup.Build, []),
			this.task('CMake build', new vscode.ShellExecution('cmake', ['--build', '${workspaceFolder}/build', '--parallel'],
				{ cwd: '${workspaceFolder}' }), vscode.TaskGroup.Build, ['$colcon']),
			this.task('CMake build & run', new vscode.ShellExecution(
				'cmake --build "${workspaceFolder}/build" --parallel && echo "\\n--- Running ---\\n" && "${workspaceFolder}/build/${workspaceFolderBasename}"',
				{ cwd: '${workspaceFolder}' }), vscode.TaskGroup.Test, ['$colcon']),
			this.task('CMake clean', new vscode.ShellExecution('cmake', ['--build', '${workspaceFolder}/build', '--target', 'clean'],
				{ cwd: '${workspaceFolder}' }), vscode.TaskGroup.Build, []),
		];
	}
	resolveTask(): undefined { return undefined; }

	private task(name: string, execution: vscode.ShellExecution, group: vscode.TaskGroup, matchers: string[]): vscode.Task {
		const t = new vscode.Task({ type: CMAKE_TASK_TYPE }, vscode.TaskScope.Workspace, name, 'RoboAgent', execution, matchers);
		t.group = group;
		t.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Shared, clear: name.includes('run') };
		return t;
	}
}

async function runTaskByName(name: string, type: string): Promise<void> {
	// Only fetch from the named provider — an unfiltered fetchTasks() would trigger
	// task auto-detection across every provider of every extension.
	const tasks = await vscode.tasks.fetchTasks({ type });
	const target = tasks.find(t => `${t.source}: ${t.name}` === name || t.name === name);
	if (target) {
		await vscode.tasks.executeTask(target);
	} else {
		vscode.window.showErrorMessage(vscode.l10n.t('Task "{0}" not found.', name));
	}
}

// --- Commands --------------------------------------------------------------

async function buildFile(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) { return; }
	const lang = editor.document.languageId;
	if ((lang === 'cpp' || lang === 'c') && isCMakeProject()) {
		await runTaskByName('CMake build', CMAKE_TASK_TYPE);
	} else if (lang === 'cpp' || lang === 'c') {
		await runTaskByName('g++ build active file', CPP_TASK_TYPE);
	} else if (lang === 'cmake') {
		await runTaskByName('CMake configure', CMAKE_TASK_TYPE);
	}
}

function runFile(): void {
	const editor = vscode.window.activeTextEditor;
	if (!editor) { return; }
	const lang = editor.document.languageId;
	if ((lang === 'cpp' || lang === 'c') && isCMakeProject()) {
		void runTaskByName('CMake build & run', CMAKE_TASK_TYPE);
	} else if (lang === 'cpp' || lang === 'c') {
		const filePath = editor.document.fileName;
		const dir = path.dirname(filePath);
		const base = path.basename(filePath, path.extname(filePath));
		const terminal = vscode.window.createTerminal('RoboAgent: Run');
		terminal.show();
		terminal.sendText(`cd "${dir}" && g++ -g -std=c++17 "${filePath}" -o "${base}" && ./"${base}"`);
	} else if (lang === 'python') {
		const terminal = vscode.window.createTerminal('RoboAgent: Run Python');
		terminal.show();
		terminal.sendText(`python3 "${editor.document.fileName}"`);
	}
}

// --- Status bar (CMake project buttons + generic Run File) -----------------

/** Create the status-bar buttons; returns the refresher that shows/hides the CMake set. */
function createStatusBarItems(context: vscode.ExtensionContext): () => void {
	const add = (priority: number, text: string, tooltip: string, command: string, color?: string) => {
		const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
		item.text = text; item.tooltip = tooltip; item.command = command;
		if (color) { item.color = color; }
		context.subscriptions.push(item);
		return item;
	};

	const cmakeItems = [
		add(90, '$(gear) Configure', 'RoboAgent: CMake Configure', 'roboagent.cmakeConfigure'),
		add(89, '$(tools) Build', 'RoboAgent: CMake Build', 'roboagent.cmakeBuild'),
		add(88, '$(play) Run', 'RoboAgent: CMake Build & Run', 'roboagent.cmakeRun', '#4EC9B0'),
		add(87, '$(trash) Clean', 'RoboAgent: CMake Clean', 'roboagent.cmakeClean'),
	];
	const updateCMakeButtons = () => {
		const show = isCMakeProject();
		cmakeItems.forEach(item => show ? item.show() : item.hide());
	};

	const runFileBtn = add(86, '$(play) Run File', 'RoboAgent: Build & Run active file', 'roboagent.runFile', '#4EC9B0');
	const updateRunFileVisibility = () => {
		const lang = vscode.window.activeTextEditor?.document.languageId;
		if (lang && ['cpp', 'c', 'python', 'cmake'].includes(lang)) { runFileBtn.show(); } else { runFileBtn.hide(); }
	};
	updateCMakeButtons();
	updateRunFileVisibility();
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateRunFileVisibility));
	return updateCMakeButtons;
}

// --- Registration ----------------------------------------------------------

export function registerCmake(context: vscode.ExtensionContext): void {
	const updateCMakeButtons = createStatusBarItems(context);
	const refresh = () => {
		void vscode.commands.executeCommand('setContext', 'roboagent.isCMakeProject', isCMakeProject());
		updateCMakeButtons();
	};
	refresh();

	// CMakeLists.txt can appear/disappear after activation; keep the context key
	// and the status-bar buttons in sync.
	const watcher = vscode.workspace.createFileSystemWatcher('**/CMakeLists.txt', false, true, false);

	context.subscriptions.push(
		vscode.tasks.registerTaskProvider(CPP_TASK_TYPE, new CppTaskProvider()),
		vscode.tasks.registerTaskProvider(CMAKE_TASK_TYPE, new CMakeTaskProvider()),
		vscode.commands.registerCommand('roboagent.buildFile', buildFile),
		vscode.commands.registerCommand('roboagent.runFile', runFile),
		vscode.commands.registerCommand('roboagent.cmakeConfigure', () => runTaskByName('CMake configure', CMAKE_TASK_TYPE)),
		vscode.commands.registerCommand('roboagent.cmakeBuild', () => runTaskByName('CMake build', CMAKE_TASK_TYPE)),
		vscode.commands.registerCommand('roboagent.cmakeRun', () => runTaskByName('CMake build & run', CMAKE_TASK_TYPE)),
		vscode.commands.registerCommand('roboagent.cmakeClean', () => runTaskByName('CMake clean', CMAKE_TASK_TYPE)),
		vscode.workspace.onDidChangeWorkspaceFolders(refresh),
		watcher,
		watcher.onDidCreate(refresh),
		watcher.onDidDelete(refresh),
	);
}
