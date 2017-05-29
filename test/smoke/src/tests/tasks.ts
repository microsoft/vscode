/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from "../spectron/application";
import { Tasks } from "../areas/tasks";

let app: SpectronApplication;

export function testTasks() {
	context('Tasks', () => {
		let tasks: Tasks;

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH]);
			tasks = new Tasks(app);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('verifies that eslint task results in 1 problem', async function () {
			await tasks.build();
			const res = await tasks.getOutputResult();
			assert.equal(res, '✖ 1 problem (0 errors, 1 warning)');
		});

		it(`is able to select 'Git' output`, async function () {
			await tasks.build();
			await app.wait();
			await tasks.selectOutputViewType('Git');
			const viewType = await tasks.getOutputViewType();
			assert.equal(viewType, 'Git');
		});

		it('ensures that build task produces errors in index.js', async function () {
			await tasks.build();
			assert.ok(await tasks.firstOutputLineEndsWith('index.js'));
		});

		it(`verifies build errors are reflected in 'Problems View'`, async function () {
			await tasks.build();
			await tasks.openProblemsView();
			const problemName = await tasks.getProblemsViewFirstElementName();
			assert.equal(problemName, 'index.js');
			const problemsCount = await tasks.getProblemsViewFirstElementCount();
			assert.equal(problemsCount, '1');
		});
	});
}