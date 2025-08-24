/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { LanguageRuntimeSessionMode } from 'vs/workbench/services/languageRuntime/common/languageRuntimeService';
import { JupyterKernelSpec } from './erdos-supervisor';
import { getArkKernelPath } from './kernel';
import { EXTENSION_ROOT_DIR } from './constants';

export function createJupyterKernelSpec(
	rHomePath: string,
	runtimeName: string,
	sessionMode: LanguageRuntimeSessionMode): JupyterKernelSpec {

	const kernelPath = getArkKernelPath();
	if (!kernelPath) {
		throw new Error('Unable to find R kernel');
	}

	const config = vscode.workspace.getConfiguration('erdos.r');
	const logLevel = config.get<string>('kernel.logLevel') ?? 'warn';
	const logLevelForeign = config.get<string>('kernel.logLevelExternal') ?? 'warn';
	const userEnv = config.get<object>('kernel.env') ?? {};
	const profile = config.get<string>('kernel.profile');

	const env = <Record<string, string>>{
		'RUST_BACKTRACE': '1',
		'RUST_LOG': logLevelForeign + ',ark=' + logLevel,
		'R_HOME': rHomePath,
		...userEnv
	};

	if (profile) {
		env['ARK_PROFILE'] = profile;
	}

	if (process.platform === 'linux') {
		env['LD_LIBRARY_PATH'] = rHomePath + '/lib';
	} else if (process.platform === 'darwin') {
		env['DYLD_LIBRARY_PATH'] = rHomePath + '/lib';
	}

	const startupFile = path.join(EXTENSION_ROOT_DIR, 'resources', 'scripts', 'startup.R');

	const argv = [
		kernelPath,
		'--connection_file', '{connection_file}',
		'--log', '{log_file}',
		'--startup-file', `${startupFile}`,
		'--session-mode', `${sessionMode}`,
	];

	if (profile) {
		argv.push(...[
			'--profile', '{profile_file}',
		]);
	}

	const defaultRepos = config.get<string>('defaultRepositories') ?? 'auto';
	if (defaultRepos === 'auto') {
		const reposConf = findReposConf();
		if (reposConf) {
			argv.push(...['--repos-conf', reposConf]);
		} else if (vscode.env.uiKind === vscode.UIKind.Web) {
			argv.push(...['--default-repos', 'posit-ppm']);
		}
	} else {
		argv.push(...['--default-repos', defaultRepos]);
	}

	argv.push(...[
		'--',
		'--interactive',
	]);

	const kernelSpec: JupyterKernelSpec = {
		'argv': argv,
		'display_name': runtimeName,
		'language': 'R',
		'env': env,
		'kernel_protocol_version': '5.5'
	};

	console.log(`[DEBUG] R kernel spec created for ${runtimeName}:`);
	console.log(`[DEBUG] kernelPath: ${kernelPath}`);
	console.log(`[DEBUG] argv: ${JSON.stringify(argv)}`);
	console.log(`[DEBUG] env: ${JSON.stringify(env)}`);
	console.log(`[DEBUG] Full kernelSpec: ${JSON.stringify(kernelSpec, null, 2)}`);

	if (!config.get<boolean>('restoreWorkspace')) {
		kernelSpec.argv.push('--no-restore-data');
	}

	const extraArgs = config.get<Array<string>>('extraArguments');
	const quietMode = config.get<boolean>('quietMode');
	if (quietMode && extraArgs?.indexOf('--quiet') === -1) {
		extraArgs?.push('--quiet');
	}
	if (extraArgs) {
		kernelSpec.argv.push(...extraArgs);
	}

	return kernelSpec;
}

function findReposConf(): string | undefined {
	const xdg = require('xdg-portable/cjs');
	const configDirs: Array<string> = xdg.configDirs();
	for (const product of ['rstudio', 'erdos']) {
		for (const configDir of configDirs) {
			const reposConf = path.join(configDir, product, 'repos.conf');
			if (fs.existsSync(reposConf)) {
				return reposConf;
			}
		}
	}
	return;
}
