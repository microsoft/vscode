/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

function toUri(path: string): string {
	if (process.platform === 'win32') {
		return `${path.replace(/\\/g, '/')}`;
	}

	return `${path}`;
}

function createWorkspaceFile(workspacePath: string): string {
	const workspaceFilePath = join(dirname(workspacePath), 'smoketest.code-workspace');
	const workspace = {
		folders: [
			{ path: toUri(join(workspacePath, 'public')) },
			{ path: toUri(join(workspacePath, 'routes')) },
			{ path: toUri(join(workspacePath, 'views')) }
		],
		settings: {
			'workbench.startupEditor': 'none',
			'workbench.enableExperiments': false,
			'typescript.disableAutomaticTypeAcquisition': true,
			'json.schemaDownload.enable': false,
			'npm.fetchOnlinePackageInfo': false,
			'npm.autoDetect': 'off',
			'workbench.editor.languageDetection': false,
			'workbench.localHistory.enabled': false
		}
	};

	writeFileSync(workspaceFilePath, JSON.stringify(workspace, null, '\t'));

	return workspaceFilePath;
}

export function setup(logger: Logger) {
	describe('Multiroot', () => {

		// Shared before/after handling
		installAllHandlers(logger, opts => {
			const workspacePath = createWorkspaceFile(opts.workspacePath);
			return { ...opts, workspacePath };
		});

		it('shows results from all folders', async function () {
			const app = this.app as Application;
			const expectedNames = [
				'index.js',
				'users.js',
				'style.css',
				'error.pug',
				'index.pug',
				'layout.pug'
			];

			await app.workbench.quickaccess.openFileQuickAccessAndWait('*.*', 6);
			await app.workbench.quickinput.waitForQuickInputElements(names => expectedNames.every(expectedName => names.some(name => expectedName === name)));
			await app.workbench.quickinput.closeQuickInput();
		});

		it('shows workspace name in title', async function () {
			const app = this.app as Application;

			await app.code.waitForTitle(title => /smoketest \(Workspace\)/i.test(title));
		});
	});
}
