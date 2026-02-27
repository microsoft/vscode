/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import cp from 'child_process';
const root = fs.realpathSync(path.dirname(path.dirname(import.meta.dirname)));

/**
 * Uses `pnpm ls --json` to get the recursive production dependency tree for a
 * specific workspace, then maps each dependency to its hoisted node_modules/ path.
 */
function getPnpmProductionDependencies(folder: string): string[] {
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
let raw: string;

try {
raw = cp.execSync(`${pnpm} ls --prod --json --depth=Infinity`, {
cwd: folder,
encoding: 'utf8',
env: { ...process.env, NODE_ENV: 'production' },
stdio: [null, null, null]
});
} catch (err: any) {
if (err.stdout) {
raw = err.stdout;
} else {
throw err;
}
}

const data = JSON.parse(raw);
const depPaths = new Set<string>();

function collectDeps(deps: Record<string, any>): void {
for (const [_name, info] of Object.entries(deps)) {
const depPath = (info as any).path as string | undefined;
if (depPath && !depPaths.has(depPath)) {
depPaths.add(depPath);
const subDeps = (info as any).dependencies;
if (subDeps) {
collectDeps(subDeps);
}
}
}
}

// pnpm ls --json returns an array of workspace entries
const entries = Array.isArray(data) ? data : [data];
for (const entry of entries) {
if (entry.dependencies) {
collectDeps(entry.dependencies);
}
}

// Map .pnpm store paths to hoisted node_modules/ paths
const nodeModulesRoot = path.join(folder, 'node_modules');
const result: string[] = [];
for (const depPath of depPaths) {
if (depPath.includes('node_modules/.pnpm/')) {
// Extract package name from .pnpm path
// Pattern: .../node_modules/.pnpm/<pkg@ver>/node_modules/<name>
const match = depPath.match(/node_modules\/\.pnpm\/[^/]+\/node_modules\/(.+)$/);
if (match) {
const hoistedPath = path.join(nodeModulesRoot, match[1]);
if (fs.existsSync(hoistedPath)) {
result.push(hoistedPath);
} else {
result.push(depPath);
}
} else {
result.push(depPath);
}
} else {
result.push(depPath);
}
}

return result;
}

export function getProductionDependencies(folderPath: string): string[] {
const result = getPnpmProductionDependencies(folderPath);
// Account for distro npm dependencies
const realFolderPath = fs.realpathSync(folderPath);
const relativeFolderPath = path.relative(root, realFolderPath);
const distroFolderPath = `${root}/.build/distro/npm/${relativeFolderPath}`;

if (fs.existsSync(distroFolderPath)) {
result.push(...getPnpmProductionDependencies(distroFolderPath));
}

return [...new Set(result)];
}

if (import.meta.main) {
console.log(JSON.stringify(getProductionDependencies(root), null, '  '));
}
