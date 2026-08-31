/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { CompletionItemKind, CompletionTriggerKind } from '../../../../../editor/common/languages.js';
import { LanguageFeaturesService } from '../../../../../editor/common/services/languageFeaturesService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IChatInputCompletionsParams, IChatInputCompletionsResult, IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AutomationInputCompletions } from '../../browser/automationInputCompletions.js';

class TestChatSessionsService extends mock<IChatSessionsService>() {
	override async getChatInputCompletionTriggerCharacters(): Promise<readonly string[]> {
		return ['/'];
	}

	override async provideChatInputCompletions(_sessionResource: URI, _params: IChatInputCompletionsParams, _token: CancellationToken): Promise<IChatInputCompletionsResult> {
		return {
			items: [
				{
					insertText: '/review ',
					start: { lineNumber: 1, column: 1 },
					end: { lineNumber: 1, column: 2 },
					attachment: { kind: 'skill', uri: URI.file('/skills/review/SKILL.md'), description: 'Review the workspace' },
				},
				{
					insertText: '/plan ',
					attachment: { kind: 'command', command: 'plan', description: 'Plan a task' },
				},
				{
					insertText: '/runtime-skill ',
					attachment: { kind: 'command', command: 'runtime-skill', isSkill: true, description: 'Run a runtime skill' },
				},
			],
		};
	}
}

suite('AutomationInputCompletions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows agent host skills for the automation draft session', async () => {
		const languageFeaturesService = new LanguageFeaturesService();
		const model = store.add(createTextModel('/', null, undefined, URI.parse('vscode-chat-input:automation')));
		const editor = upcastPartial<ICodeEditor>({ getModel: () => model });
		const session = upcastPartial<ISession>({
			sessionId: 'automation',
			resource: URI.parse('agent-host-copilot:automation'),
		});
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			automationSession: constObservable(session),
		});
		store.add(new AutomationInputCompletions(editor, languageFeaturesService, new TestChatSessionsService(), sessionsManagementService));
		await timeout(0);

		const provider = languageFeaturesService.completionProvider.ordered(model)[0];
		const result = await provider.provideCompletionItems(
			model,
			new Position(1, 2),
			{ triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: '/' },
			CancellationToken.None,
		);

		assert.deepStrictEqual(result?.suggestions.map(item => ({
			label: item.label,
			insertText: item.insertText,
			filterText: item.filterText,
			documentation: item.documentation,
			kind: item.kind,
		})), [
			{
				label: { label: '/review ', description: 'Review the workspace' },
				insertText: '/review ',
				filterText: '/review ',
				documentation: 'Review the workspace',
				kind: CompletionItemKind.Text,
			},
			{
				label: { label: '/runtime-skill ', description: 'Run a runtime skill' },
				insertText: '/runtime-skill ',
				filterText: '/runtime-skill ',
				documentation: 'Run a runtime skill',
				kind: CompletionItemKind.Text,
			},
		]);
	});
});
