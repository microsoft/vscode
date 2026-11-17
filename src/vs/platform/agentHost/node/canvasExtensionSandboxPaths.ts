/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir, readdir, readFile } from 'fs/promises';
import { join } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { getVSCodeSandboxWriteRoots } from '../common/vscodeSandboxPaths.js';

interface IExtensionManifestCanvas {
	readonly id?: unknown;
}

interface IExtensionManifest {
	readonly canvases?: unknown;
}

/**
 * Discovers canvas identifiers from extension manifests (`extension.json`) and entrypoints (`extension.mjs`)
 * in the session's workspace folders, user Copilot home, and applied plugin directories.
 */
export async function discoverCanvasExtensionIds(
	workingDirectories: readonly URI[],
	copilotHome: URI | undefined,
	pluginDirectories: readonly URI[],
): Promise<string[]> {
	const containerPaths: string[] = [];

	for (const dir of workingDirectories) {
		if (dir.scheme === 'file') {
			containerPaths.push(join(dir.fsPath, '.github', 'extensions'));
		}
	}
	if (copilotHome && copilotHome.scheme === 'file') {
		containerPaths.push(join(copilotHome.fsPath, 'extensions'));
	}
	for (const pluginDir of pluginDirectories) {
		if (pluginDir.scheme === 'file') {
			containerPaths.push(join(pluginDir.fsPath, 'extensions'));
		}
	}

	const canvasIds = new Set<string>();

	await Promise.all(containerPaths.map(async containerPath => {
		let entries: import('fs').Dirent[];
		try {
			entries = await readdir(containerPath, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}
			const extensionDir = join(containerPath, entry.name);
			let manifestCanvasesFound = false;

			try {
				const manifestRaw = await readFile(join(extensionDir, 'extension.json'), 'utf8');
				const manifest = JSON.parse(manifestRaw) as IExtensionManifest;
				if (Array.isArray(manifest.canvases)) {
					for (const canvas of manifest.canvases as IExtensionManifestCanvas[]) {
						if (typeof canvas?.id === 'string' && canvas.id.trim()) {
							canvasIds.add(canvas.id.trim());
							manifestCanvasesFound = true;
						}
					}
				}
			} catch {
				// No valid extension.json sidecar; fall back to checking extension.mjs.
			}

			if (!manifestCanvasesFound) {
				try {
					await readFile(join(extensionDir, 'extension.mjs'), 'utf8');
					// The extension directory name itself identifies the default canvas/extension id.
					if (entry.name.trim()) {
						canvasIds.add(entry.name.trim());
					}
				} catch {
					// Not an extension entrypoint.
				}
			}
		}
	}));

	return [...canvasIds].sort();
}

/**
 * Resolves the host-generated write roots for canvas extensions under `<copilotHome>/extension-data/<canvasId>`.
 */
export function getCanvasExtensionDataRoots(copilotHome: URI | undefined, canvasIds: readonly string[]): URI[] {
	return getVSCodeSandboxWriteRoots({ copilotHome, canvasIds });
}

/**
 * Ensures that private state directories for admitted canvas extensions exist on disk before sandboxing starts.
 */
export async function ensureCanvasExtensionDataDirectories(roots: readonly URI[]): Promise<void> {
	await Promise.all(roots.map(async root => {
		if (root.scheme === 'file') {
			try {
				await mkdir(root.fsPath, { recursive: true });
			} catch {
				// Ignore directory creation failures.
			}
		}
	}));
}
