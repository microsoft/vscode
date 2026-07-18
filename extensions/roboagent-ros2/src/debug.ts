/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  RoboAgent — Run & Debug (WS4)
 *
 *  Two first-party debug types wired to detected adapters:
 *    • roboagent-ros2-python → debugpy   (vendored when present, else system; else terminal)
 *    • roboagent-ros2-cpp    → lldb-dap  (system-detected; else terminal fallback)
 *
 *  `debugNode` receives { package, node, language } from the fork Package-Explorer context menu,
 *  resolves the installed executable, and starts a real debug session. `runNode` runs the same
 *  target in a terminal without debugging.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { exists, findColconRoot, isSafeRos2Name, ros2SourcePrefix } from './util';
import { pythonAdapterExecutable, pythonDebugAvailable, systemCppAdapter } from './debugAdapters';

export interface NodeDebugPayload {
	package: string;
	node: string;
	language?: 'cpp' | 'python' | 'unknown' | string;
}

export const PYTHON_DEBUG_TYPE = 'roboagent-ros2-python';
export const CPP_DEBUG_TYPE = 'roboagent-ros2-cpp';

/**
 * The installed executable for a ROS2 node. ROS2 installs both C++ and Python entry points to
 * `install/<pkg>/lib/<pkg>/<node>`, so the path is uniform.
 */
function resolveProgramPath(rootFsPath: string, pkg: string, node: string): string {
	return path.join(rootFsPath, 'install', pkg, 'lib', pkg, node);
}

function isPython(payload: NodeDebugPayload): boolean {
	return payload.language === 'python';
}

/**
 * Run a node in an integrated terminal via `ros2 run` (no debug session),
 * sourcing the distro env and the workspace overlay so the workspace's own
 * packages resolve. Names are validated before they reach the shell.
 */
export async function runNodeInTerminal(payload: NodeDebugPayload): Promise<void> {
	if (!isSafeRos2Name(payload.package) || !isSafeRos2Name(payload.node)) {
		vscode.window.showErrorMessage(vscode.l10n.t('RoboAgent: refusing to run node with unexpected name "{0}/{1}".', String(payload.package), String(payload.node)));
		return;
	}
	const root = await findColconRoot();
	const terminal = vscode.window.createTerminal(`ROS2: ${payload.package}/${payload.node}`);
	terminal.show();
	terminal.sendText(`${ros2SourcePrefix(root?.fsPath)}ros2 run ${payload.package} ${payload.node}`);
}

export async function debugNode(context: vscode.ExtensionContext, payload: NodeDebugPayload): Promise<void> {
	if (!isSafeRos2Name(payload?.package) || !isSafeRos2Name(payload?.node)) {
		vscode.window.showErrorMessage(vscode.l10n.t('RoboAgent: no ROS2 node selected to debug.'));
		return;
	}
	const root = await findColconRoot();
	if (!root) {
		vscode.window.showErrorMessage(vscode.l10n.t('RoboAgent: could not locate a colcon workspace root.'));
		return;
	}
	const program = resolveProgramPath(root.fsPath, payload.package, payload.node);

	if (!(await exists(vscode.Uri.file(program)))) {
		const build = vscode.l10n.t('Build {0}', payload.package);
		const choice = await vscode.window.showWarningMessage(
			vscode.l10n.t('"{0}" is not built yet ({1} missing). Build first?', payload.node, program), build);
		if (choice === build) {
			// Package-scoped build; retry Debug Node once it finishes.
			await vscode.commands.executeCommand('roboagent.colconBuildPackage', { package: payload.package });
		}
		return;
	}

	const folder = vscode.workspace.getWorkspaceFolder(root) ?? vscode.workspace.workspaceFolders?.[0];
	const name = `Debug ${payload.package}/${payload.node}`;

	if (isPython(payload)) {
		if (!(await pythonDebugAvailable(context))) {
			vscode.window.showWarningMessage(vscode.l10n.t('debugpy not available; running the node in a terminal instead.'));
			await runNodeInTerminal(payload);
			return;
		}
		await vscode.debug.startDebugging(folder, {
			type: PYTHON_DEBUG_TYPE, name, request: 'launch',
			program, console: 'integratedTerminal', cwd: root.fsPath,
		});
		return;
	}

	// C++ (or unknown): needs a system lldb-dap; otherwise terminal fallback.
	if (!(await systemCppAdapter())) {
		vscode.window.showWarningMessage(vscode.l10n.t('No system C++ debug adapter (lldb-dap) found; running the node in a terminal instead. Install lldb-dap for full debugging.'));
		await runNodeInTerminal(payload);
		return;
	}
	await vscode.debug.startDebugging(folder, {
		type: CPP_DEBUG_TYPE, name, request: 'launch',
		program, args: [], cwd: root.fsPath,
	});
}

/** A DebugConfigurationProvider that fills in a sane launch config when invoked empty. */
class Ros2DebugConfigurationProvider implements vscode.DebugConfigurationProvider {
	constructor(private readonly kind: 'python' | 'cpp') { }

	resolveDebugConfiguration(_folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration): vscode.DebugConfiguration {
		if (!config.type && !config.request && !config.name) {
			config.type = this.kind === 'python' ? PYTHON_DEBUG_TYPE : CPP_DEBUG_TYPE;
			config.request = 'launch';
			config.name = this.kind === 'python' ? 'RoboAgent: Debug ROS2 node (Python)' : 'RoboAgent: Debug ROS2 node (C++)';
			config.cwd = '${workspaceFolder}';
			if (this.kind === 'python') {
				config.console = 'integratedTerminal';
			}
		}
		return config;
	}
}

export function registerDebug(context: vscode.ExtensionContext): vscode.Disposable[] {
	return [
		vscode.debug.registerDebugAdapterDescriptorFactory(PYTHON_DEBUG_TYPE, {
			createDebugAdapterDescriptor: () => pythonAdapterExecutable(context),
		}),
		vscode.debug.registerDebugAdapterDescriptorFactory(CPP_DEBUG_TYPE, {
			createDebugAdapterDescriptor: async () => {
				const adapter = await systemCppAdapter();
				if (!adapter) {
					// launch.json-driven F5 lands here directly; give guidance instead of a bare adapter error.
					vscode.window.showErrorMessage(vscode.l10n.t('No C++ debug adapter found. Install lldb-dap (LLVM) to debug ROS2 C++ nodes, or use "Run Node" to run without debugging.'));
				}
				return adapter;
			},
		}),
		vscode.debug.registerDebugConfigurationProvider(PYTHON_DEBUG_TYPE, new Ros2DebugConfigurationProvider('python')),
		vscode.debug.registerDebugConfigurationProvider(CPP_DEBUG_TYPE, new Ros2DebugConfigurationProvider('cpp')),
	];
}
