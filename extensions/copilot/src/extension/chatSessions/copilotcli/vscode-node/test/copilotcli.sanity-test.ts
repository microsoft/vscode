/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ILogService, ILogTarget, LogLevel } from '../../../../../platform/log/common/logService';
import { generateUuid } from '../../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { activate } from '../../../../extension/vscode-node/extension';
import { SessionIdForCLI } from '../../common/utils';

/**
 * Sanity test that drives the real Copilot CLI chat participant end-to-end via
 * the same chat command users hit when sending a prompt to a fresh CLI session.
 *
 * Regression target: a simple prompt to the Copilot CLI session must not surface
 * a `[CopilotCLISession]CopilotCLI error: (query)` log entry (which corresponds
 * to the `Error: (query) Execution failed: Error:` markdown shown in the chat).
 */
suite('Copilot CLI Chat Sanity Test', function () {
	this.timeout(1000 * 60 * 2); // 2 minutes

	let realInstaAccessor: IInstantiationService;
	let realContext: vscode.ExtensionContext;
	let sandbox: sinon.SinonSandbox;

	suiteSetup(async function () {
		sandbox = sinon.createSandbox();
		sandbox.stub(vscode.commands, 'registerCommand').returns({ dispose: () => { } });
		sandbox.stub(vscode.workspace, 'registerFileSystemProvider').returns({ dispose: () => { } });
		const extension = vscode.extensions.getExtension('Github.copilot-chat');
		assert.ok(extension, 'Extension is not available');
		realContext = await extension.activate();
		assert.ok(realContext, '`extension.activate()` did not return context`');
		const activateResult = await activate(realContext, true);
		assert.ok(activateResult, 'Activation result is not available');
		assert.strictEqual(typeof (activateResult as IInstantiationService).invokeFunction, 'function', 'invokeFunction is not a function');
		realInstaAccessor = activateResult as IInstantiationService;
	});

	suiteTeardown(async function () {
		sandbox.restore();
		realContext.subscriptions.forEach((sub) => {
			try {
				sub.dispose();
			} catch (e) {
				console.error(e);
			}
		});
	});

	test('Copilot CLI panel chat handles a simple prompt without query error', async function () {
		assert.ok(realInstaAccessor, 'Instantiation service accessor is not available');

		await realInstaAccessor.invokeFunction(async (accessor) => {
			const logService = accessor.get(ILogService);

			// Tee log messages into a buffer by appending an extra target to the
			// shared logger. This is the cheapest way to observe what the CLI
			// participant emits without changing production code.
			const captured: string[] = [];
			const logTarget: ILogTarget = {
				logIt: (level, message) => {
					captured.push(`${LogLevel[level]}: ${message}`);
				}
			};
			const targets = (logService as unknown as { logger: { _logTargets: ILogTarget[] } }).logger._logTargets;
			assert.ok(Array.isArray(targets), 'Could not access LogService targets array');
			targets.push(logTarget);

			try {
				const sessionId = `untitled-${generateUuid()}`;
				const resource = SessionIdForCLI.getResource(sessionId);
				await vscode.commands.executeCommand(
					'workbench.action.chat.openSessionWithPrompt.copilotcli',
					{ resource, prompt: 'Tell me a joke about number 8', attachedContext: [] },
				);

				const queryErrors = captured.filter(l => /\[CopilotCLISession\]CopilotCLI error: \(query\)/.test(l));
				assert.deepStrictEqual(
					queryErrors,
					[],
					`Copilot CLI surfaced a query error from the SDK:\n${queryErrors.join('\n')}\n\nFull captured log tail:\n${captured.slice(-50).join('\n')}`
				);
			} finally {
				const i = targets.indexOf(logTarget);
				if (i !== -1) {
					targets.splice(i, 1);
				}
			}
		});
	});
});
