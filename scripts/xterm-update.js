/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');
const path = require('path');

const moduleNames = [
	'@xterm/xterm',
	'@xterm/addon-clipboard',
	'@xterm/addon-image',
	'@xterm/addon-ligatures',
	'@xterm/addon-progress',
	'@xterm/addon-search',
	'@xterm/addon-serialize',
	'@xterm/addon-unicode11',
	'@xterm/addon-webgl',
];

const backendOnlyModuleNames = [
	'@xterm/headless'
];

const vscodeDir = process.argv.length >= 3 ? process.argv[2] : process.cwd();
if (!path.basename(vscodeDir).match(/.*vscode.*/)) {
	console.error('The cwd is not "vscode" root');
	return;
}

function getLatestModuleVersion(moduleName) {
	return new Promise((resolve, reject) => {
		cp.exec(`pnpm view ${moduleName} versions --json`, { cwd: vscodeDir }, (err, stdout, stderr) => {
			if (err) {
				reject(err);
			}
			let versions = JSON.parse(stdout);
			// Fix format if there is only a single version published
			if (typeof versions === 'string') {
				versions = [versions];
			}
			// Unlike npm, pnpm lists the versions in string order (`6.1.0-beta.99` after `6.1.0-beta.327`)
			resolve([...versions].sort(compareVersions)[versions.length - 1]);
		});
	});
}

/**
 * Compares two versions by semver precedence (build metadata is ignored).
 */
function compareVersions(a, b) {
	const parse = version => {
		const { major, minor, patch, prerelease } = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<prerelease>[^+]+))?/.exec(version).groups;
		return { release: [major, minor, patch].map(Number), prerelease: prerelease ? prerelease.split('.') : [] };
	};
	const x = parse(a);
	const y = parse(b);
	for (let i = 0; i < 3; i++) {
		if (x.release[i] !== y.release[i]) {
			return x.release[i] - y.release[i];
		}
	}
	// A release has a higher precedence than its prereleases
	if (x.prerelease.length === 0 || y.prerelease.length === 0) {
		return y.prerelease.length - x.prerelease.length;
	}
	for (let i = 0; i < Math.max(x.prerelease.length, y.prerelease.length); i++) {
		const p = x.prerelease[i];
		const q = y.prerelease[i];
		if (p === q) {
			continue;
		}
		if (p === undefined || q === undefined) {
			return p === undefined ? -1 : 1;
		}
		const pNumeric = /^\d+$/.test(p);
		const qNumeric = /^\d+$/.test(q);
		if (pNumeric && qNumeric) {
			return Number(p) - Number(q);
		}
		if (pNumeric !== qNumeric) {
			return pNumeric ? -1 : 1;
		}
		return p < q ? -1 : 1;
	}
	return 0;
}

/**
 * `pnpm add name@version` saves the exact version, so ask for the caret range that the
 * package.json files use.
 */
function toCaretRange(moduleWithVersion) {
	const index = moduleWithVersion.lastIndexOf('@');
	return `${moduleWithVersion.slice(0, index)}@^${moduleWithVersion.slice(index + 1)}`;
}

/**
 * Runs `pnpm add` in `cwd`. The repository root is a pnpm workspace with several projects, where
 * pnpm adds dependencies only with `--workspace-root`.
 */
function pnpmAdd(cwd, modulesWithVersion) {
	const workspaceRoot = cwd === vscodeDir ? ' --workspace-root' : '';
	cp.execSync(`pnpm add${workspaceRoot} ${modulesWithVersion.map(toCaretRange).join(' ')}`, { cwd });
}

async function update() {
	console.log('Fetching latest versions');
	const allModules = moduleNames.concat(backendOnlyModuleNames);
	const versionPromises = [];
	for (const m of allModules) {
		versionPromises.push(getLatestModuleVersion(m));
	}
	const latestVersionsArray = await Promise.all(versionPromises);
	const latestVersions = {};
	for (const [i, v] of latestVersionsArray.entries()) {
		latestVersions[allModules[i]] = v;
	}

	console.log('Detected versions:');
	for (const m of moduleNames.concat(backendOnlyModuleNames)) {
		console.log(`  ${m}@${latestVersions[m]}`);
	}

	const pkg = require(path.join(vscodeDir, 'package.json'));

	const modulesWithVersion = [];
	for (const m of moduleNames) {
		const moduleWithVersion = `${m}@${latestVersions[m]}`;
		if (pkg.dependencies[m] === latestVersions[m]) {
			console.log(`Skipping ${moduleWithVersion}, already up to date`);
			continue;
		}
		modulesWithVersion.push(moduleWithVersion);
	}

	if (modulesWithVersion.length > 0) {
		for (const cwd of [vscodeDir, path.join(vscodeDir, 'remote'), path.join(vscodeDir, 'remote/web')]) {
			console.log(`${path.join(cwd, 'package.json')}: Updating\n  ${modulesWithVersion.join('\n  ')}`);
			pnpmAdd(cwd, modulesWithVersion);
		}
	}

	const backendOnlyModulesWithVersion = [];
	for (const m of backendOnlyModuleNames) {
		const moduleWithVersion = `${m}@${latestVersions[m]}`;
		if (pkg.dependencies[m] === latestVersions[m]) {
			console.log(`Skipping ${moduleWithVersion}, already up to date`);
			continue;
		}
		backendOnlyModulesWithVersion.push(moduleWithVersion);
	}
	if (backendOnlyModulesWithVersion.length > 0) {
		for (const cwd of [vscodeDir, path.join(vscodeDir, 'remote')]) {
			console.log(`${path.join(cwd, 'package.json')}: Updating\n  ${backendOnlyModulesWithVersion.join('\n  ')}`);
			pnpmAdd(cwd, backendOnlyModulesWithVersion);
		}
	}
}

update();
