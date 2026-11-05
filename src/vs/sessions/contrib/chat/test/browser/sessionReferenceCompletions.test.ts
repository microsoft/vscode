/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { fuzzyScore } from '../../../../../base/common/filters.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { CompletionItem, CompletionItemLabel, CompletionItemProvider, CompletionList, CompletionTriggerKind } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatWidget } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IDynamicVariable } from '../../../../../workbench/contrib/chat/common/attachments/chatVariables.js';
import { ChatRequestDynamicVariablePart } from '../../../../../workbench/contrib/chat/common/requestParser/chatParserTypes.js';
import { getSessionReferenceResource } from '../../../../services/sessions/browser/sessionReference.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionReferenceCompletions } from '../../browser/sessionReferenceCompletions.js';

suite('SessionReferenceCompletions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const inputUri = URI.parse('vscode-chat-input:/composer');

	function session(resource: string, title: string, updated: number): ISession {
		return upcastPartial<ISession>({ resource: URI.parse(resource), title: constObservable(title), updatedAt: constObservable(new Date(updated)) });
	}

	const current = session('agent-host-copilotcli:/current', 'Current', 3);
	const sessions = [
		session('agent-host-copilotcli:/older', 'Fix\n  the bug', 1),
		current,
		session('agent-host-copilotcli:/newer', '', 2),
		// Another host's session, whose event log the skill cannot read.
		session('remote-host-copilotcli:/remote', 'Remote', 4),
		session('copilot-cloud-agent:/cloud', 'Cloud', 5),
	];

	function createCompletions(getSession: () => ISession | undefined = () => current) {
		const added: IDynamicVariable[] = [];
		let provider: CompletionItemProvider | undefined;
		let line = '';
		const inputModel = upcastPartial<ITextModel>({ uri: inputUri, getLineContent: () => line });
		const widget = upcastPartial<IChatWidget>({
			inputEditor: upcastPartial<IChatWidget['inputEditor']>({ getModel: () => inputModel }),
			getContrib: <T>() => ({ addReference: (reference: IDynamicVariable) => added.push(reference) }) as T,
		});
		const languageFeaturesService = upcastPartial<ILanguageFeaturesService>({
			completionProvider: upcastPartial<ILanguageFeaturesService['completionProvider']>({
				register: (_selector, registered) => {
					provider = registered;
					return toDisposable(() => provider = undefined);
				},
			}),
		});
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({ getSessions: () => sessions });
		store.add(new SessionReferenceCompletions(widget, getSession, languageFeaturesService, sessionsManagementService));
		const complete = (text: string, model = inputModel) => {
			line = text;
			return provider?.provideCompletionItems(model, new Position(1, text.length + 1), { triggerKind: CompletionTriggerKind.Invoke }, CancellationToken.None) as CompletionList | null | undefined;
		};
		return { complete, added };
	}

	test('lists the Copilot CLI sessions on the composer session\'s host, newest first', () => {
		const { complete } = createCompletions();
		const items = (text: string, model?: ITextModel) => {
			const result = complete(text, model);
			return result ? result.suggestions.map(item => ({ label: (item.label as CompletionItemLabel).label, insertText: item.insertText, current: !!(item.label as CompletionItemLabel).description?.includes('(current)') })) : result;
		};
		// The labels the editor keeps after filtering by the typed `#` word.
		const shown = (text: string) => {
			const typed = text.slice(text.lastIndexOf('#'));
			return complete(text)?.suggestions
				.filter(item => fuzzyScore(typed, typed.toLowerCase(), 0, item.filterText!, item.filterText!.toLowerCase(), 0))
				.map(item => (item.label as CompletionItemLabel).label);
		};
		// Another chat input, even one whose model has the same resource.
		const otherInput = upcastPartial<ITextModel>({ uri: inputUri, getLineContent: () => '/troubleshoot #sess' });

		assert.deepStrictEqual({
			session: items('/troubleshoot #sess'),
			shownForPrefix: shown('/troubleshoot #sess'),
			shownForTitle: shown('/troubleshoot #session:Fi'),
			bareLeader: items('/troubleshoot #'),
			otherVariable: items('/troubleshoot #file'),
			otherInput: items('/troubleshoot #sess', otherInput),
			cloudComposer: createCompletions(() => sessions[4]).complete('#sess'),
			noSession: createCompletions(() => undefined).complete('#sess'),
		}, {
			session: [
				{ label: 'Current', insertText: '#session:Current ', current: true },
				{ label: 'Untitled session', insertText: '#session:Untitled session ', current: false },
				{ label: 'Fix the bug', insertText: '#session:Fix the bug ', current: false },
			],
			shownForPrefix: ['Current', 'Untitled session', 'Fix the bug'],
			shownForTitle: ['Fix the bug'],
			bareLeader: [],
			otherVariable: null,
			otherInput: null,
			cloudComposer: null,
			noSession: null,
		});
	});

	test('accepting a session adds an inline reference that troubleshooting resolves to that session', () => {
		const { complete, added } = createCompletions();
		const text = '/troubleshoot #sess';
		const item: CompletionItem = complete(text)!.suggestions[2];
		CommandsRegistry.getCommand(item.command!.id)!.handler(upcastPartial<ServicesAccessor>({}), ...item.command!.arguments!);

		// The input's request parser turns the inline reference into the request's attachment.
		const [reference] = added;
		const referenceText = '#session:Fix the bug';
		const entry = new ChatRequestDynamicVariablePart(new OffsetRange(14, 14 + referenceText.length), reference.range, referenceText, reference.id, reference.modelDescription, reference.data, reference.fullName).toVariableEntry();

		assert.deepStrictEqual({
			range: reference.range,
			id: entry.id,
			resolved: getSessionReferenceResource(entry)?.toString(),
		}, {
			range: new Range(1, 15, 1, 15 + referenceText.length),
			id: 'session:older',
			resolved: 'agent-host-copilotcli:/older',
		});
	});
});
