/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { CHAT_OPEN_ACTION_ID, IChatViewOpenOptions, openCustomizationChat } from '../../../browser/actions/chatActions.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';
import { getDocumentationUrl, PromptsType } from '../../../common/promptSyntax/promptTypes.js';

suite('Chat customization actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const types = ['init', ...Object.values(PromptsType)] as const;
	const workspaceFolder = URI.file('/workspace/project');
	const requests = {
		init: 'Analyze this codebase and create agent instructions for it.',
		instructions: 'Create a new on-demand instructions file.',
		prompt: 'Create a new reusable prompt file.',
		skill: 'Create a new skill with a SKILL.md file.',
		agent: 'Create a new custom agent file.',
		hook: 'Create a new hook configuration file.',
	};

	function setup(sessionResource: URI | undefined, available = true) {
		const calls: { commandId: string; options: IChatViewOpenOptions }[] = [];
		const instantiation = store.add(new TestInstantiationService());
		const widget = new class extends mock<IChatWidget>() {
			override readonly viewModel = sessionResource ? new class extends mock<IChatViewModel>() {
				constructor(override readonly sessionResource: URI) { super(); }
			}(sessionResource) : undefined;
		}();
		instantiation.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override async revealWidget(): Promise<IChatWidget | undefined> {
				return available ? widget : undefined;
			}
		}());
		instantiation.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(commandId: string, options: IChatViewOpenOptions): Promise<T | undefined> {
				calls.push({ commandId, options });
				return undefined;
			}
		}());
		return { instantiation, calls };
	}

	test('preserves Local creation skills, submission behavior, and workspace attachments', async () => {
		const { instantiation, calls } = setup(LocalChatSessionUri.forSession('local-session'));
		for (const type of types) {
			await instantiation.invokeFunction(openCustomizationChat, type, workspaceFolder);
		}
		assert.deepStrictEqual(calls, types.map(type => ({
			commandId: CHAT_OPEN_ACTION_ID,
			options: {
				mode: 'agent',
				query: type === 'init' ? '/init' : `/create-${type} `,
				isPartialQuery: type !== 'init',
				attachFiles: [workspaceFolder],
			},
		})));
	});

	for (const sessionResource of [URI.parse('agent-host-copilotcli:///session'), URI.parse('claude-code:///session'), undefined]) {
		test(`uses documented plain-text requests for ${sessionResource?.scheme ?? 'an uninitialized chat'}`, async () => {
			const { instantiation, calls } = setup(sessionResource);
			for (const type of types) {
				await instantiation.invokeFunction(openCustomizationChat, type, workspaceFolder);
			}
			assert.deepStrictEqual(calls, types.map(type => ({
				commandId: CHAT_OPEN_ACTION_ID,
				options: {
					mode: 'agent',
					query: `${requests[type]} Follow the documentation at ${getDocumentationUrl(type === 'init' ? PromptsType.instructions : type)}.${type === 'init' ? '' : ' '}`,
					isPartialQuery: type !== 'init',
					attachFiles: [workspaceFolder],
				},
			})));
		});
	}

	test('does not open a request when no chat widget is available', async () => {
		const { instantiation, calls } = setup(undefined, false);
		await instantiation.invokeFunction(openCustomizationChat, PromptsType.agent);
		assert.deepStrictEqual(calls, []);
	});
});
