/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Hands the folder links of a workspace, such as the ones of pnpm's isolated `node_modules` (junctions
// on Windows), from a build job to test jobs through an archive format that can't store them. 7-Zip
// archives a junction as a copy of its target, so `node_modules/<package>` loses the links to its
// dependencies, and resolving them from the copy fails.
//
//   save <root> <manifest>     records the folder links under <root> in <manifest> and removes them
//   restore <root> <manifest>  creates the links of <manifest> again
//
// Links to files, and links to targets outside of <root>, are left alone: an archive keeps them as
// copies, which still work.

export interface WorkspaceLink {
	/** Path of the link, relative to the root, with `/` separators. */
	readonly path: string;
	/** Path of the target, relative to the root, with `/` separators. */
	readonly target: string;
}

const toPosix = (p: string) => p.split(path.sep).join('/');

function isInside(root: string, file: string): boolean {
	const relative = path.relative(root, file);
	return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isDirectory(file: string): boolean {
	try {
		return fs.statSync(file).isDirectory();
	} catch {
		// A link whose target doesn't exist
		return false;
	}
}

/** Returns the links to folders inside `root`, without following any link. */
export function findWorkspaceLinks(root: string): WorkspaceLink[] {
	root = path.resolve(root);
	const links: WorkspaceLink[] = [];
	const folders = [root];
	for (let folder = folders.pop(); folder !== undefined; folder = folders.pop()) {
		for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
			const file = path.join(folder, entry.name);
			if (entry.isSymbolicLink()) {
				const target = path.resolve(folder, fs.readlinkSync(file));
				if (isInside(root, target) && isDirectory(file)) {
					links.push({ path: toPosix(path.relative(root, file)), target: toPosix(path.relative(root, target)) });
				}
			} else if (entry.isDirectory() && entry.name !== '.git') {
				folders.push(file);
			}
		}
	}
	return links.sort((a, b) => a.path.localeCompare(b.path));
}

export function saveWorkspaceLinks(root: string, manifest: string): WorkspaceLink[] {
	const links = findWorkspaceLinks(root);
	fs.mkdirSync(path.dirname(manifest), { recursive: true });
	fs.writeFileSync(manifest, JSON.stringify(links));
	for (const link of links) {
		// Removes the link, not its target
		fs.rmSync(path.join(root, link.path));
	}
	return links;
}

export function restoreWorkspaceLinks(root: string, manifest: string): WorkspaceLink[] {
	root = path.resolve(root);
	const links: WorkspaceLink[] = JSON.parse(fs.readFileSync(manifest, 'utf8'));
	for (const link of links) {
		const file = path.join(root, link.path);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		// Junctions need no privilege on Windows, and take absolute targets
		fs.symlinkSync(path.join(root, link.target), file, process.platform === 'win32' ? 'junction' : 'dir');
	}
	return links;
}

if (import.meta.main) {
	const [command, root, manifest] = process.argv.slice(2);
	if (command === 'save' && root && manifest) {
		console.log(`Removed ${saveWorkspaceLinks(root, manifest).length} folder links under ${root}, recorded in ${manifest}`);
	} else if (command === 'restore' && root && manifest) {
		console.log(`Created ${restoreWorkspaceLinks(root, manifest).length} folder links under ${root} from ${manifest}`);
	} else {
		console.error('Usage: workspaceLinks.ts save|restore <root> <manifest>');
		process.exit(1);
	}
}
