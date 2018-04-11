/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application } from '../../application';

export function setup() {
	describe('Multiroot', () => {

		before(async function () {
			const app = this.app as Application;

			// restart with preventing additional windows from restoring
			// to ensure the window after restart is the multi-root workspace
			await app.restart({ workspaceOrFolder: app.workspaceFilePath, extraArgs: ['--disable-restore-windows'] });
		});

		it('shows results from all folders', async function () {
			const app = this.app as Application;
			await app.workbench.quickopen.openQuickOpen('*.*');

			await app.workbench.quickopen.waitForQuickOpenElements(names => names.length === 6);
			await app.workbench.quickopen.closeQuickOpen();
		});

		it('shows workspace name in title', async function () {
			const app = this.app as Application;
			const title = await app.api.getTitle();
			assert.ok(title.indexOf('smoketest (Workspace)') >= 0);
		});
	});
}