/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  RoboAgent — shared utilities for the ROS2 Toolkit extension.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

/** Resolve whether `command` exits successfully. Never throws. */
export function execOk(command: string, timeout = 4000): Promise<boolean> {
	return new Promise(resolve => {
		cp.exec(command, { timeout }, err => resolve(!err));
	});
}

const onPathCache = new Map<string, { at: number; ok: boolean }>();
const ON_PATH_TTL_MS = 15_000;

/**
 * Resolve whether `tool` is available on PATH. Never throws. Results are cached
 * briefly so command handlers and debug factories that probe the same tool in
 * quick succession spawn one shell, not several.
 */
export async function onPath(tool: string): Promise<boolean> {
	const cached = onPathCache.get(tool);
	if (cached && Date.now() - cached.at < ON_PATH_TTL_MS) {
		return cached.ok;
	}
	const probe = process.platform === 'win32' ? `where ${tool}` : `command -v ${tool}`;
	const ok = await execOk(probe, 3000);
	onPathCache.set(tool, { at: Date.now(), ok });
	return ok;
}

export async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

async function isDirectory(uri: vscode.Uri): Promise<boolean> {
	try {
		return ((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.Directory) !== 0;
	} catch {
		return false;
	}
}

/**
 * Valid ROS2 package/node identifier — the only shapes we interpolate into shell
 * command lines. Exported for unit testing.
 */
export function isSafeRos2Name(name: string | undefined): name is string {
	return !!name && /^[A-Za-z0-9_.\-]+$/.test(name);
}

/**
 * The shell prefix that sources the ROS2 distro environment (when `$ROS_DISTRO`
 * points at an installed distro) and, when a workspace root is given, its
 * `install/setup.bash` overlay — so `ros2 run` / `ros2 launch` find the
 * workspace's own packages.
 */
export function ros2SourcePrefix(workspaceRootFsPath?: string): string {
	let prefix = 'if [ -n "$ROS_DISTRO" ] && [ -f "/opt/ros/$ROS_DISTRO/setup.bash" ]; then . "/opt/ros/$ROS_DISTRO/setup.bash"; fi; ';
	if (workspaceRootFsPath) {
		prefix += `if [ -f "${workspaceRootFsPath}/install/setup.bash" ]; then . "${workspaceRootFsPath}/install/setup.bash"; fi; `;
	}
	return prefix;
}

/** Whether a ROS2 CLI can plausibly run here: on PATH already, or a distro under /opt/ros to source. */
export async function ros2Available(): Promise<boolean> {
	return (await onPath('ros2')) || exists(vscode.Uri.file('/opt/ros'));
}

/**
 * Find the colcon workspace root: the nearest directory — from `start` up to and
 * including its containing workspace folder — that has a `src/` directory or a
 * `package.xml`. Returns `undefined` when nothing in that range qualifies, so
 * callers can refuse to run colcon (and especially `clean`) outside a real
 * colcon workspace. The walk never leaves the workspace folder.
 */
export async function findColconRoot(start?: vscode.Uri): Promise<vscode.Uri | undefined> {
	const folders = vscode.workspace.workspaceFolders;
	const seed = start ?? vscode.window.activeTextEditor?.document.uri ?? folders?.[0]?.uri;
	if (!seed) {
		return undefined;
	}
	const boundary = vscode.workspace.getWorkspaceFolder(seed)?.uri ?? folders?.[0]?.uri;
	if (!boundary) {
		return undefined;
	}

	// Seeds outside every workspace folder (e.g. a freestanding file) search the
	// first workspace folder only.
	const inBoundary = seed.path === boundary.path || seed.path.startsWith(boundary.path.endsWith('/') ? boundary.path : boundary.path + '/');
	let dir = inBoundary ? seed : boundary;
	if (dir.path !== boundary.path && !(await isDirectory(dir))) {
		dir = dir.with({ path: path.posix.dirname(dir.path) });
	}

	while (true) {
		if (await exists(vscode.Uri.joinPath(dir, 'src')) || await exists(vscode.Uri.joinPath(dir, 'package.xml'))) {
			return dir;
		}
		if (dir.path === boundary.path) {
			return undefined;
		}
		const parentPath = path.posix.dirname(dir.path);
		if (parentPath === dir.path) {
			return undefined;   // reached fs root without hitting the boundary — bail out
		}
		dir = dir.with({ path: parentPath });
	}
}
