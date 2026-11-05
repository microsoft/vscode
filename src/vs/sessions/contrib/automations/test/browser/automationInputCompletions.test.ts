/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { CompletionItemKind, CompletionTriggerKind } from '../../../../../editor/common/languages.js';
import { LanguageFeaturesService } from '../../../../../editor/common/services/languageFeaturesService.js';
import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
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

	teardown(() => sinon.restore());

	test('shows agent host skills for the automation draft session', async () => {
		const languageFeaturesService = new LanguageFeaturesService();
		const model = store.add(createTextModel('/', null, undefined, URI.parse('vscode-chat-input:automation')));
		let decorations: readonly Range[] = [];
		const editor = upcastPartial<ICodeEditor>({
			getModel: () => model,
			onDidChangeModelContent: Event.None,
			setDecorationsByType: (_description, _key, options) => {
				decorations = options.map(option => Range.lift(option.range));
				return options.map((_, index) => `decoration-${index}`);
			},
		});
		const codeEditorService = upcastPartial<ICodeEditorService>({
			registerDecorationType: () => ({ dispose() { } }),
		});
		const session = upcastPartial<ISession>({
			sessionId: 'automation',
			resource: URI.parse('agent-host-copilot:automation'),
		});
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			automationSession: constObservable(session),
		});
		store.add(new AutomationInputCompletions(editor, languageFeaturesService, new TestChatSessionsService(), sessionsManagementService, codeEditorService, new NullLogService()));
		await timeout(0);

		const provider = languageFeaturesService.completionProvider.ordered(model)[0];
		const result = await provider.provideCompletionItems(
			model,
			new Position(1, 2),
			{ triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: '/' },
			CancellationToken.None,
		);

		const suggestions = result?.suggestions.map(item => ({
			label: item.label,
			insertText: item.insertText,
			filterText: item.filterText,
			documentation: item.documentation,
			kind: item.kind,
		}));
		model.setValue('/review ');
		const command = result?.suggestions[0].command;
		CommandsRegistry.getCommand(command!.id)!.handler(upcastPartial<ServicesAccessor>({}), ...command!.arguments!);

		assert.deepStrictEqual({ suggestions, decorations }, {
			suggestions: [
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
			],
			decorations: [new Range(1, 1, 1, 8)],
		});
	});

	test('restores persisted skill references and removes stale decorations after edits', async () => {
		const languageFeaturesService = new LanguageFeaturesService();
		const model = store.add(createTextModel(
			'/review then /plan and /runtime-skill plus /unknown',
			null,
			undefined,
			URI.parse('vscode-chat-input:automation'),
		));
		let decorations: readonly Range[] = [];
		const decorationRanges = new Map<string, Range>();
		const onDidChangeModelContent = store.add(new Emitter<IModelContentChangedEvent>());
		sinon.stub(model, 'getDecorationRange').callsFake(decorationId => decorationRanges.get(decorationId) ?? null);
		const editor = upcastPartial<ICodeEditor>({
			getModel: () => model,
			onDidChangeModelContent: onDidChangeModelContent.event,
			setDecorationsByType: (_description, _key, options) => {
				decorations = options.map(option => Range.lift(option.range));
				decorationRanges.clear();
				return decorations.map((range, index) => {
					const id = `decoration-${index}`;
					decorationRanges.set(id, range);
					return id;
				});
			},
		});
		const codeEditorService = upcastPartial<ICodeEditorService>({
			registerDecorationType: () => ({ dispose() { } }),
		});
		const session = upcastPartial<ISession>({
			sessionId: 'automation',
			resource: URI.parse('agent-host-copilot:automation'),
		});
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			automationSession: constObservable(session),
		});
		store.add(new AutomationInputCompletions(editor, languageFeaturesService, new TestChatSessionsService(), sessionsManagementService, codeEditorService, new NullLogService()));
		await timeout(0);
		model.setValue('/reviewx then /plan and /runtime-skill plus /unknown');
		decorationRanges.set('decoration-1', new Range(1, 25, 1, 39));
		onDidChangeModelContent.fire(upcastPartial<IModelContentChangedEvent>({}));
		await timeout(250);
		const afterRightEdgeEdit = decorations;
		model.setValue('/reviewx then /plan and x/runtime-skill plus /unknown');
		decorationRanges.set('decoration-0', new Range(1, 26, 1, 40));
		onDidChangeModelContent.fire(upcastPartial<IModelContentChangedEvent>({}));
		await timeout(250);

		assert.deepStrictEqual({ afterRightEdgeEdit, afterLeftEdgeEdit: decorations }, {
			afterRightEdgeEdit: [new Range(1, 25, 1, 39)],
			afterLeftEdgeEdit: [],
		});
	});
});
