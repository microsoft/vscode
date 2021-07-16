/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import minimist = require('minimist');
import * as path from 'path';
import { Application } from '../../../../automation';
import { afterSuite, beforeSuite } from '../../utils';

function toUri(path: string): string {
	if (process.platform === 'win32') {
		return `${path.replace(/\\/g, '/')}`;
	}

	return `${path}`;
}

async function createWorkspaceFile(workspacePath: string): Promise<string> {
	const workspaceFilePath = path.join(path.dirname(workspacePath), 'smoketest.code-workspace');
	const workspace = {
		folders: [
			{ path: toUri(path.join(workspacePath, 'public')) },
			{ path: toUri(path.join(workspacePath, 'routes')) },
			{ path: toUri(path.join(workspacePath, 'views')) }
		],
		settings: {
			'workbench.startupEditor': 'none',
			'workbench.enableExperiments': false
		}
	};

	fs.writeFileSync(workspaceFilePath, JSON.stringify(workspace, null, '\t'));

	return workspaceFilePath;
}

export function setup(opts: minimist.ParsedArgs) {
	describe('Multiroot', () => {
		beforeSuite(opts, async opts => {
			const workspacePath = await createWorkspaceFile(opts.workspacePath);
			return { ...opts, workspacePath };
		});

		afterSuite(opts);

		it('shows results from all folders', async function () {
			const app = this.app as Application;
			await app.workbench.quickaccess.openQuickAccess('*.*');

			await app.workbench.quickinput.waitForQuickInputElements(names => names.length === 6);
			await app.workbench.quickinput.closeQuickInput();
		});

		it('shows workspace name in title', async function () {
			const app = this.app as Application;
			await app.code.waitForTitle(title => /smoketest \(Workspace\)/i.test(title));
		});
	});
}
