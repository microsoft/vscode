/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getVersion } from '../../lib/getVersion';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as path from 'path';
import * as packageJson from '../../../package.json';
import { tmpdir } from 'os';

const root = path.dirname(path.dirname(path.dirname(__dirname)));
const cliPath = path.join(root, 'cli');
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
const commit = getVersion(root);

const getCargoLines = () => {
	const fpath = path.join(cliPath, 'Cargo.toml');
	const cargo = fs.readFileSync(fpath, 'utf-8').split(/\r?\n/g);
	return [fpath, cargo] as const;
};

const addCargoDependency = (line: string) => {
	const [fpath, cargo] = getCargoLines();
	const depsLine = cargo.findIndex(line => line.includes('[dependencies]'));
	cargo.splice(depsLine + 1, 0, line);
	fs.writeFileSync(fpath, cargo.join('\n'));
};

const enableFeature = (feature: string) => {
	const [fpath, cargo] = getCargoLines();
	const featuresLine = cargo.findIndex(line => line.includes('[features]'));

	const prefix = 'default = ';
	const defaultFeaturesLine = cargo.findIndex((line, i) => i > featuresLine && line.startsWith(prefix));
	const defaultFeatures = new Set(JSON.parse(cargo[defaultFeaturesLine].slice(prefix.length)));
	defaultFeatures.add(feature);
	cargo[defaultFeaturesLine] = prefix + JSON.stringify([...defaultFeatures]);
	fs.writeFileSync(fpath, cargo.join('\n'));
};

/**
 * Sets build environment variables for the CLI for current contextual info.
 */
const setLauncherEnvironmentVars = () => {
	const vars = new Map([
		['VSCODE_CLI_REMOTE_LICENSE_TEXT', product.serverLicense],
		['VSCODE_CLI_REMOTE_LICENSE_PROMPT', product.serverLicensePrompt],
		['VSCODE_CLI_VERSION', packageJson.version],
		['VSCODE_CLI_COMMIT', commit],
	]);

	for (const [key, value] of vars) {
		if (value) {
			console.log(`##vso[task.setvariable variable=${key}]${value}`);
		}
	}
};

/**
 * Enables vscode-encrypt in the CLI if it's available in the current node_modules.
 * This is not graceful since Cargo doesn't have a good way to do private or
 * true-optional dependencies...
 */
const enableVscodeEncrypt = () => {
	const dep = (packageJson.dependencies as Record<string, string>)['vscode-encrypt'];
	if (!dep) {
		return;
	}

	// If there's a vscode-encrypt in the package.json, install that (alone) in
	// a temp dir for the build. This avoids having to do a full install of all
	// node modules while building the CLI.
	const stagingDir = path.join(tmpdir(), `vscode-encrypt-staging-${Date.now()}`);
	fs.mkdirSync(stagingDir);
	fs.writeFileSync(path.join(stagingDir, 'package.json'), JSON.stringify({ dependencies: { 'vscode-encrypt': dep } }));
	cp.execSync('yarn', { cwd: stagingDir, stdio: 'inherit' });
	const encryptPath = path.join(stagingDir, 'node_modules', 'vscode-encrypt', 'rs-pure');

	addCargoDependency(`vscode-encrypt = { "path" = "${encryptPath.replace(/\\/g, '/')}" }`);
	enableFeature('vscode-encrypt');
};

setLauncherEnvironmentVars();
enableVscodeEncrypt();
