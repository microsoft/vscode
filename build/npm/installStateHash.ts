/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import path from 'path';
import { dirs } from './dirs.ts';

export const root = fs.realpathSync.native(path.dirname(path.dirname(import.meta.dirname)));
export const stateFile = path.join(root, 'node_modules', '.postinstall-state');
export const stateContentsFile = path.join(root, 'node_modules', '.postinstall-state-contents');
export const forceInstallMessage = 'Run \x1b[36mnode build/npm/fast-install.ts --force\x1b[0m to force a full install.';

export function collectInputFiles(): string[] {
	const files: string[] = [];

	for (const dir of dirs) {
		const base = dir === '' ? root : path.join(root, dir);
		for (const file of ['package.json', 'package-lock.json', '.npmrc']) {
			const filePath = path.join(base, file);
			if (fs.existsSync(filePath)) {
				files.push(filePath);
			}
		}
	}

	files.push(path.join(root, '.nvmrc'));

	return files;
}

export interface PostinstallState {
	readonly nodeVersion: string;
	readonly fileHashes: Record<string, string>;
}

const packageJsonIgnoredKeys = new Set(['distro']);

function normalizeFileContent(filePath: string): string {
	const raw = fs.readFileSync(filePath, 'utf8');
	if (path.basename(filePath) === 'package.json') {
		const json = JSON.parse(raw);
		for (const key of packageJsonIgnoredKeys) {
			delete json[key];
		}
		return JSON.stringify(json, null, '\t') + '\n';
	}
	return raw;
}

function hashContent(content: string): string {
	const hash = crypto.createHash('sha256');
	hash.update(content);
	return hash.digest('hex');
}

export function computeState(): PostinstallState {
	const fileHashes: Record<string, string> = {};
	for (const filePath of collectInputFiles()) {
		const key = path.relative(root, filePath);
		try {
			fileHashes[key] = hashContent(normalizeFileContent(filePath));
		} catch {
			// file may not be readable
		}
	}
	return { nodeVersion: process.versions.node, fileHashes };
}

export function computeContents(): Record<string, string> {
	const fileContents: Record<string, string> = {};
	for (const filePath of collectInputFiles()) {
		try {
			fileContents[path.relative(root, filePath)] = normalizeFileContent(filePath);
		} catch {
			// file may not be readable
		}
	}
	return fileContents;
}

export function readSavedState(): PostinstallState | undefined {
	try {
		const { nodeVersion, fileHashes } = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
		return { nodeVersion, fileHashes };
	} catch {
		return undefined;
	}
}

export function isUpToDate(): boolean {
	const saved = readSavedState();
	if (!saved) {
		return false;
	}
	const current = computeState();
	return saved.nodeVersion === current.nodeVersion
		&& JSON.stringify(saved.fileHashes) === JSON.stringify(current.fileHashes);
}

export function readSavedContents(): Record<string, string> | undefined {
	try {
		return JSON.parse(fs.readFileSync(stateContentsFile, 'utf8'));
	} catch {
		return undefined;
	}
}

// When run directly, output state as JSON for tooling (e.g. the vscode-extras extension).
if (import.meta.filename === process.argv[1]) {
	console.log(JSON.stringify({
		root,
		stateContentsFile,
		current: computeState(),
		saved: readSavedState(),
		files: [...collectInputFiles(), stateFile],
	}));
}
