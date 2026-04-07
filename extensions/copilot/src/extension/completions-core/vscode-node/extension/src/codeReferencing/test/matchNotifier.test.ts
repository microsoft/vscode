/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import sinon from 'sinon';
import { commands, env } from 'vscode';
import { IVSCodeExtensionContext } from '../../../../../../../platform/extContext/common/extensionContext';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsNotificationSender } from '../../../../lib/src/notificationSender';
import { OutputPaneShowCommand } from '../../../../lib/src/snippy/constants';
import { withInMemoryTelemetry } from '../../../../lib/src/test/telemetry';
import { TestNotificationSender } from '../../../../lib/src/test/testHelpers';
import { createExtensionTestingContext } from '../../test/context';
import { notify } from '../matchNotifier';

suite('.match', function () {
	let accessor: ServicesAccessor;

	setup(function () {
		accessor = createExtensionTestingContext().createTestingAccessor();
	});

	test('populates the globalState object', async function () {
		const extensionContext = accessor.get(IVSCodeExtensionContext);
		const globalState = extensionContext.globalState;

		await notify(accessor);

		assert.ok(globalState.get('codeReference.notified'));
	});

	test('notifies the user', async function () {
		const testNotificationSender = accessor.get(ICompletionsNotificationSender) as TestNotificationSender;
		testNotificationSender.performAction('View reference');

		await notify(accessor);

		assert.strictEqual(testNotificationSender.sentMessages.length, 1);
	});

	test('sends a telemetry event on view reference action', async function () {
		const testNotificationSender = accessor.get(ICompletionsNotificationSender) as TestNotificationSender;
		testNotificationSender.performAction('View reference');

		const telemetry = await withInMemoryTelemetry(accessor, async accessor => {
			await notify(accessor);
		});

		assert.strictEqual(telemetry.reporter.events.length, 1);
		assert.strictEqual(telemetry.reporter.events[0].name, 'code_referencing.match_notification.acknowledge.count');
	});

	test('executes the output panel display command on view reference action', async function () {
		const spy = sinon.spy(commands, 'executeCommand');
		const testNotificationSender = accessor.get(ICompletionsNotificationSender) as TestNotificationSender;
		testNotificationSender.performAction('View reference');

		await notify(accessor);

		await testNotificationSender.waitForMessages();

		assert.ok(spy.calledOnce);
		assert.ok(spy.calledWith(OutputPaneShowCommand));

		spy.restore();
	});

	test('opens the settings page on change setting action', async function () {
		const stub = sinon.stub(env, 'openExternal');
		const testNotificationSender = accessor.get(ICompletionsNotificationSender) as TestNotificationSender;
		testNotificationSender.performAction('Change setting');

		await notify(accessor);

		await testNotificationSender.waitForMessages();

		assert.ok(stub.calledOnce);
		assert.ok(
			stub.calledWith(
				sinon.match({
					scheme: 'https',
					authority: 'aka.ms',
					path: '/github-copilot-settings',
				})
			)
		);

		stub.restore();
	});

	test('sends a telemetry event on notification dismissal', async function () {
		const testNotificationSender = accessor.get(ICompletionsNotificationSender) as TestNotificationSender;
		testNotificationSender.performDismiss();

		const telemetry = await withInMemoryTelemetry(accessor, async accessor => {
			await notify(accessor);
		});

		await testNotificationSender.waitForMessages();

		assert.strictEqual(telemetry.reporter.events.length, 1);
		assert.strictEqual(telemetry.reporter.events[0].name, 'code_referencing.match_notification.ignore.count');
	});

	test('does not notify if already notified', async function () {
		const extensionContext = accessor.get(IVSCodeExtensionContext);
		const instantiationService = accessor.get(IInstantiationService);
		const globalState = extensionContext.globalState;
		const testNotificationSender = accessor.get(ICompletionsNotificationSender) as TestNotificationSender;
		testNotificationSender.performAction('View reference');

		await globalState.update('codeReference.notified', true);

		await instantiationService.invokeFunction(notify);

		await testNotificationSender.waitForMessages();

		assert.strictEqual(testNotificationSender.sentMessages.length, 0);
	});
});
