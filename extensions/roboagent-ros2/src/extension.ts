/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  RoboAgent ROS2 Toolkit — extension entry point.
 *
 *  Wires the IDE surfaces an extension can own: the RoboAgent command set (WS1), the colcon
 *  Build Center task provider (WS3), Run/Debug with bundled/detected adapters (WS4), and the
 *  New-Project wizard (REQ-4 / WS8). Fork-only surfaces (status bar, Package-Explorer context
 *  menu) live in contrib/roboagent and invoke these commands.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { registerColconTasks } from './colconTasks';
import { registerCmake } from './cmake';
import { registerDebug } from './debug';
import { registerNewProject } from './newProject';

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		registerNewProject(context),
		registerColconTasks(),
		...registerCommands(context),
		...registerDebug(context),
	);
	// Generic CMake / single-file build-run (ported from roboagent-defaults).
	registerCmake(context);
}

export function deactivate(): void {
	// Disposables are tracked on context.subscriptions.
}
