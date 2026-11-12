/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
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
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { ChatAttachmentModel } from '../../../browser/attachments/chatAttachmentModel.js';

suite('Chat customization actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const types = ['init', ...Object.values(PromptsType)] as const;
	const workspaceFolder = URI.file('/workspace/project');
	const requests = {
		init: 'Analyze this codebase and create agent instructions for it. Follow the attached documentation.',
		instructions: `Create a new on-demand instructions file. Ask me for the instructions name and purpose and user or workspace location. Do not ask further but come up with a first draft. Check ${getDocumentationUrl(PromptsType.instructions)}. Finish with a file link to the generated instructions.`,
		prompt: `Create a new reusable prompt file. Ask me for the prompt name and purpose and user or workspace location. Do not ask further but come up with a first draft. Check ${getDocumentationUrl(PromptsType.prompt)}. Finish with a file link to the generated prompt.`,
		skill: `Create a new skill with a SKILL.md file. Ask me for the skill name and purpose and user or workspace location. Do not ask further but come up with a first draft. Check ${getDocumentationUrl(PromptsType.skill)}. Finish with a file link to the generated skill.`,
		agent: `Create a new custom agent file. Ask me for the agent name and purpose and user or workspace location. Do not ask further but come up with a first draft. Check ${getDocumentationUrl(PromptsType.agent)}. Finish with a file link to the generated agent.`,
		hook: `Create a new hook configuration file. Ask me for the hook name and purpose and user or workspace location. Do not ask further but come up with a first draft. Check ${getDocumentationUrl(PromptsType.hook)}. Finish with a file link to the generated hook.`,
	};

	function setup(sessionResource: URI | undefined, available = true) {
		const calls: { commandId: string; options: IChatViewOpenOptions }[] = [];
		const attachments: IChatRequestVariableEntry[] = [];
		const instantiation = store.add(new TestInstantiationService());
		const widget = new class extends mock<IChatWidget>() {
			override readonly attachmentModel = new class extends mock<ChatAttachmentModel>() {
				override addContext(...entries: IChatRequestVariableEntry[]): void {
					attachments.push(...entries);
				}
			}();
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
		return { instantiation, calls, attachments };
	}

	test('preserves Local creation skills, submission behavior, and workspace attachments', async () => {
		const { instantiation, calls, attachments } = setup(LocalChatSessionUri.forSession('local-session'));
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
		assert.deepStrictEqual(attachments, []);
	});

	for (const sessionResource of [URI.parse('agent-host-copilotcli:///session'), URI.parse('claude-code:///session'), undefined]) {
		test(`uses documented plain-text requests for ${sessionResource?.scheme ?? 'an uninitialized chat'}`, async () => {
			const { instantiation, calls, attachments } = setup(sessionResource);
			for (const type of types) {
				await instantiation.invokeFunction(openCustomizationChat, type, workspaceFolder);
			}
			assert.deepStrictEqual(calls, types.map(type => ({
				commandId: CHAT_OPEN_ACTION_ID,
				options: {
					mode: 'agent',
					query: `${requests[type]}${type === 'init' ? '' : '\n'}`,
					isPartialQuery: type !== 'init',
					attachFiles: [workspaceFolder],
				},
			})));
			assert.deepStrictEqual(attachments, types.map(type => {
				const url = getDocumentationUrl(type === 'init' ? PromptsType.instructions : type);
				const resource = URI.parse(url);
				return {
					kind: 'generic',
					id: url,
					name: 'Documentation',
					icon: Codicon.book,
					value: resource,
					references: [{ reference: resource, kind: 'reference' }],
				};
			}));
		});
	}

	test('does not open a request when no chat widget is available', async () => {
		const { instantiation, calls } = setup(undefined, false);
		await instantiation.invokeFunction(openCustomizationChat, PromptsType.agent);
		assert.deepStrictEqual(calls, []);
	});

	test('welcome preferences use init only in the destination Local chat', async () => {
		const preferences = 'Prefer concise commits.';
		const sessionResources = [LocalChatSessionUri.forSession('local'), URI.parse('agent-host-copilotcli:/session'), URI.parse('claude-code:/session'), undefined];
		const queries: (string | undefined)[] = [];
		for (const resource of sessionResources) {
			const { instantiation, calls } = setup(resource);
			await instantiation.invokeFunction(openCustomizationChat, 'init', undefined, preferences);
			queries.push(calls[0].options.query);
		}
		assert.deepStrictEqual(queries, [
			`/init ${preferences}`,
			`Generate agent customizations. ${preferences}`,
			`Generate agent customizations. ${preferences}`,
			`Generate agent customizations. ${preferences}`,
		]);
	});
});
