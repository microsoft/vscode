/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execSync } from 'child_process';
import * as fs from 'fs';

const isWindows = process.platform === 'win32';

let python: string | undefined;
function findPython(): void {
	if (python) {
		return;
	}

	// check if a venv already exists
	const pythonPath = isWindows ? '.venv\\Scripts\\python.exe' : '.venv/bin/python';
	if (fs.existsSync(pythonPath)) {
		python = pythonPath;
		return;
	}

	// look for global python installations
	const pythonCommands = ['python3', 'python', 'py'];
	for (const pythonCommand of pythonCommands) {
		try {
			execSync(`${pythonCommand} --version`, { stdio: 'ignore' });
			python = pythonCommand;
			return;
		} catch {
			continue;
		}
	}

	python = undefined;
}

function checkPythonVersion() {
	try {
		console.log(`Checking python: ${python} --version`);
		// Version must match `pyproject.toml` requirements
		execSync(`${python} -c "import sys;version=sys.version_info;print(version);assert (3,10) <= version < (3,13),'Python version must be >=3.10, < 3.13'"`, { encoding: 'utf8', stdio: 'inherit' });
	} catch (error) {
		process.exit(1);
	}
}

let uv: string | undefined = undefined;
function findUv(): void {
	const uvPath = isWindows ? '.venv\\Scripts\\uv.exe' : '.venv/bin/uv';
	try {
		execSync(`${uvPath} --version`, { stdio: 'ignore' });
		uv = uvPath;
	} catch {
		// ignore
	}

	try {
		// look for global `uv`
		execSync(`uv --version`, { stdio: 'ignore' });
		uv = 'uv';
	} catch {
		uv = undefined;
	}
}


function runCommand(command: string) {
	console.log(`Running command: ${command}`);
	execSync(command, { stdio: 'inherit' });
}

function installRequirements(uvCommand: string) {
	runCommand(`${uvCommand} -r test/requirements.txt`);
}

function prepareVenv() {
	if (!fs.existsSync('test/requirements.txt')) {
		console.log('No requirements.txt found. Skipping virtual environment creation.');
		return;
	}

	findPython();
	findUv();

	if (python === undefined && !uv) {
		console.error('No python cli found. Please install python and add it to your PATH.');
		process.exit(1);
	}

	if (!fs.existsSync('.venv/pyvenv.cfg')) {
		console.log('Creating virtual environment...');
		if (uv) {
			runCommand('uv venv --python 3.12 --seed .venv');
		} else {
			checkPythonVersion();
			runCommand(`${python} -m venv .venv`);
		}
	}

	const pythonPath = isWindows ? '.venv\\Scripts\\python.exe' : '.venv/bin/python';

	if (!uv) {
		runCommand(`${pythonPath} -m pip install uv`);
		uv = isWindows ? '.venv\\Scripts\\uv.exe' : '.venv/bin/uv';
	}
	const uvCommand = `${uv} pip install --python ${pythonPath}`;
	installRequirements(uvCommand);
}

prepareVenv();
