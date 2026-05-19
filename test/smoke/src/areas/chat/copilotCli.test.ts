/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

const failureMarkers = [
	'Authorization failed',
	'sign in to GitHub',
	'Failed to load @github/copilot/sdk',
	'pty.node',
	'runtime.node',
	'Cannot find module',
];

export function setup(logger: Logger, opts: { web?: boolean; remote?: boolean }) {
	const enabled = process.env.COPILOT_CLI_UI_SMOKE === '1' && !opts.web && !opts.remote;

	(enabled ? describe : describe.skip)('Copilot CLI', function () {
		this.timeout(3 * 60 * 1000);
		this.retries(0);

		installAllHandlers(logger);

		it('opens a Copilot CLI session and receives a response', async function () {
			const app = this.app as Application;

			await app.workbench.quickaccess.runCommand('smoketest.openCopilotCliChat');
			await app.workbench.chat.waitForChatEditor();
			await app.workbench.chat.sendMessage('Reply with one short sentence. Do not run tools or edit files.', 'editor');
			await app.workbench.chat.waitForResponse(1500, 'editor');

			const responseText = (await app.workbench.chat.getLatestResponseText('editor')).trim();
			assert.ok(responseText.length > 0, 'Expected Copilot CLI to produce a non-empty response');

			const normalizedResponse = responseText.toLowerCase();
			const matchedFailureMarker = failureMarkers.find(marker => normalizedResponse.includes(marker.toLowerCase()));
			assert.ok(!matchedFailureMarker, `Copilot CLI response contained failure marker "${matchedFailureMarker}": ${responseText}`);
		});
	});
}
