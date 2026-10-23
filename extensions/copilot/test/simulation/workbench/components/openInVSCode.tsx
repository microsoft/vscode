/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { promises as fs } from 'fs';
import * as mobxlite from 'mobx-react-lite';
import * as path from 'path';
import * as React from 'react';
import { ISimulationTest } from '../stores/simulationTestsProvider';


export const OpenInVSCodeButton = mobxlite.observer(({ test }: { test: ISimulationTest }) => {
	const simulationInputPath = test.simulationInputPath;
	const matchResult = test.name.match(/case-\d+/);
	if (!simulationInputPath || !matchResult) {
		return null;
	}
	return (
		<button
			className='test-open-in-vscode'
			onClick={() => { openInVSCode(simulationInputPath, matchResult[0]); }}>
			Open In VS Code Insiders
		</button>
	);
});


async function openInVSCode(simulationInputPath: string, caseName: string) {
	try {
		const conversation = JSON.parse(await fs.readFile(path.join(simulationInputPath, `${caseName}.conversation.json`), 'utf8'));
		if (!Array.isArray(conversation) || conversation.length === 0 || !conversation[0].repo_folder) {
			return;
		}
		const repoPath = path.join(simulationInputPath, 'repos', conversation[0].repo_folder);
		cp.execFileSync('code-insiders', [repoPath]);

		const state = JSON.parse(await fs.readFile(path.join(simulationInputPath, conversation[0].stateFile), 'utf8'));
		const documentFilePath = state?.activeTextEditor?.documentFilePath;
		if (documentFilePath) {
			const selection = state?.activeTextEditor?.selections?.[0];
			const line = selection?.active?.line;
			cp.execFileSync('code-insiders', ['-g', path.join(simulationInputPath, documentFilePath + (line ? `:${line + 1}` : ''))]);
		}

	} catch (e) {
		console.error(e);
	}
}
