/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { Selection } from '../../../../../../editor/common/core/selection.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { registerGenerateCodeCommand } from '../../../browser/chatSetup/chatSetupContributions.js';
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../../../browser/actions/chatActions.js';

suite('registerGenerateCodeCommand', () => {
	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let notificationMessages: string[];
	let executedCommands: string[];
	let commandResults: Map<string, unknown>;
	let activeEditor: ICodeEditor | null;

	setup(() => {
		disposables.add(registerGenerateCodeCommand('chat.internal.review', 'github.copilot.chat.review'));
		disposables.add(registerGenerateCodeCommand('chat.internal.explain', 'github.copilot.chat.explain'));
		disposables.add(registerGenerateCodeCommand('chat.internal.generateTests', 'github.copilot.chat.generateTests'));

		instantiationService = disposables.add(new TestInstantiationService());
		notificationMessages = [];
		executedCommands = [];
		commandResults = new Map();
		activeEditor = null;

		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override info(message: string) {
				notificationMessages.push(message);
				return undefined!;
			}
		}());

		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string): Promise<T> {
				executedCommands.push(id);
				return commandResults.get(id) as T;
			}
		}());

		instantiationService.stub(ICodeEditorService, new class extends mock<ICodeEditorService>() {
			override getActiveCodeEditor() {
				return activeEditor;
			}
		}());

		instantiationService.stub(IMarkerService, new class extends mock<IMarkerService>() { }());
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('review - no active editor shows notification', async () => {
		activeEditor = null;

		const handler = CommandsRegistry.getCommand('chat.internal.review')!.handler;
		await handler(instantiationService);

		assert.deepStrictEqual(notificationMessages, ['Select code in the editor to review.']);
		assert.deepStrictEqual(executedCommands, []);
	});

	test('review - empty selection shows notification', async () => {
		activeEditor = {
			getSelection: () => new Selection(1, 1, 1, 1),
		} as unknown as ICodeEditor;

		const handler = CommandsRegistry.getCommand('chat.internal.review')!.handler;
		await handler(instantiationService);

		assert.deepStrictEqual(notificationMessages, ['Select code in the editor to review.']);
		assert.deepStrictEqual(executedCommands, []);
	});

	test('review - setup fails shows sign-in notification', async () => {
		activeEditor = {
			getSelection: () => new Selection(1, 1, 1, 5),
		} as unknown as ICodeEditor;
		commandResults.set(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, undefined);

		const handler = CommandsRegistry.getCommand('chat.internal.review')!.handler;
		await handler(instantiationService);

		assert.deepStrictEqual(notificationMessages, ['Sign in to use Copilot Code Review.']);
		assert.deepStrictEqual(executedCommands, [CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID]);
	});

	test('review - setup succeeds executes actual command', async () => {
		activeEditor = {
			getSelection: () => new Selection(1, 1, 1, 5),
		} as unknown as ICodeEditor;
		commandResults.set(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, true);

		const handler = CommandsRegistry.getCommand('chat.internal.review')!.handler;
		await handler(instantiationService);

		assert.deepStrictEqual(notificationMessages, []);
		assert.deepStrictEqual(executedCommands, [CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, 'github.copilot.chat.review']);
	});

	test('explain - no active editor shows notification', async () => {
		activeEditor = null;

		const handler = CommandsRegistry.getCommand('chat.internal.explain')!.handler;
		await handler(instantiationService);

		assert.deepStrictEqual(notificationMessages, ['Open a file in the editor to use this command.']);
		assert.deepStrictEqual(executedCommands, []);
	});

	test('generateTests - setup fails shows sign-in notification', async () => {
		commandResults.set(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, undefined);

		const handler = CommandsRegistry.getCommand('chat.internal.generateTests')!.handler;
		await handler(instantiationService);

		assert.deepStrictEqual(notificationMessages, ['Sign in to use this Copilot feature.']);
		assert.deepStrictEqual(executedCommands, [CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID]);
	});
});
