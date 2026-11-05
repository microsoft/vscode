/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { getWordAtText } from '../../../../editor/common/core/wordHelper.js';
import { CompletionItem, CompletionItemKind, CompletionList } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IChatWidget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatDynamicVariableModel } from '../../../../workbench/contrib/chat/browser/attachments/chatDynamicVariables.js';
import { getCopilotCliSessionRawId } from '../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js';
import { IDynamicVariable } from '../../../../workbench/contrib/chat/common/attachments/chatVariables.js';
import { createSessionReferenceVariableEntry } from '../../../services/sessions/browser/sessionReference.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

const VARIABLE_LEADER = '#';
const SESSION_TOKEN = 'session';
/** The `#` word being completed. MUST use the g-flag. */
const VARIABLE_WORD_PATTERN = /#[^\s]*/g;

/** Run when a `#session` completion is accepted: adds the inline reference to the input. */
const ADD_SESSION_REFERENCE_COMMAND = 'sessions.chat.addSessionReference';

interface IAddSessionReferenceArgs {
	readonly widget: IChatWidget;
	readonly reference: IDynamicVariable;
}

CommandsRegistry.registerCommand(ADD_SESSION_REFERENCE_COMMAND, (_accessor, args: IAddSessionReferenceArgs) => {
	args.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference(args.reference);
});

/**
 * Provides `#session` completions in an Agents window composer: one item per
 * Copilot CLI session (active, past or archived) on the host of the composer's
 * session. Accepting an item inserts an inline `#session:<title>` reference,
 * which the sessions management service resolves to that session's event log
 * for the `/troubleshoot` skill. The workbench's own `#session` completions
 * reference a session resource instead, which that skill cannot use.
 */
export class SessionReferenceCompletions extends Disposable {

	constructor(
		private readonly _widget: IChatWidget,
		private readonly _getSession: () => ISession | undefined,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();
		const inputModel = this._widget.inputEditor.getModel();
		if (!inputModel) {
			return;
		}
		this._register(languageFeaturesService.completionProvider.register({ scheme: inputModel.uri.scheme, hasAccessToAllModels: true }, {
			_debugDisplayName: 'sessionsSessionReference',
			triggerCharacters: [VARIABLE_LEADER],
			provideCompletionItems: (model: ITextModel, position: Position): CompletionList | null => {
				const sessionResource = this._getSession()?.resource;
				// Only Copilot CLI sessions have an event log the skill can read.
				if (model !== this._widget.inputEditor.getModel() || !sessionResource || getCopilotCliSessionRawId(sessionResource) === undefined) {
					return null;
				}
				const varWord = getWordAtText(position.column, VARIABLE_WORD_PATTERN, model.getLineContent(position.lineNumber), 0);
				if (!varWord?.word.startsWith(VARIABLE_LEADER)) {
					return null;
				}
				// Participate while the typed word could still become `#session`, so
				// as not to fight unrelated `#` completions.
				const typed = varWord.word.slice(VARIABLE_LEADER.length).toLowerCase();
				if (typed.length > 0 && !SESSION_TOKEN.startsWith(typed) && !typed.startsWith(SESSION_TOKEN)) {
					return null;
				}
				const replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
				const insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
				// Incomplete, so the editor asks again as the user types towards `#session`.
				// A bare `#` lists no sessions yet.
				return { suggestions: typed.length === 0 ? [] : this._getSessionItems(sessionResource, { insert, replace }), incomplete: true };
			},
		}));
	}

	private _getSessionItems(currentResource: URI, range: { readonly insert: Range; readonly replace: Range }): CompletionItem[] {
		// Each host has its own resource scheme, and the skill can only read the
		// event logs on the host it runs on.
		const sessions = this._sessionsManagementService.getSessions()
			.map(session => ({ session, rawId: getCopilotCliSessionRawId(session.resource) }))
			.filter((entry): entry is { session: ISession; rawId: string } => entry.rawId !== undefined && entry.session.resource.scheme === currentResource.scheme)
			.sort((a, b) => b.session.updatedAt.get().getTime() - a.session.updatedAt.get().getTime());

		return sessions.map(({ session, rawId }, index): CompletionItem => {
			// One line, so the inline reference stays on one line.
			const title = session.title.get().replace(/\s+/g, ' ').trim() || localize('untitledSession', "Untitled session");
			const date = session.updatedAt.get().toLocaleString();
			const referenceText = `${VARIABLE_LEADER}${SESSION_TOKEN}:${title}`;
			const entry = createSessionReferenceVariableEntry(rawId, title, session.resource);
			const reference: IDynamicVariable = {
				id: entry.id,
				fullName: entry.name,
				data: entry.value,
				range: new Range(range.replace.startLineNumber, range.replace.startColumn, range.replace.startLineNumber, range.replace.startColumn + referenceText.length),
			};
			return {
				label: { label: title, description: isEqual(session.resource, currentResource) ? localize('currentSessionLabel', "{0} (current)", date) : date },
				// The editor filters against the typed word, including its `#` and `:`.
				filterText: referenceText,
				insertText: `${referenceText} `,
				range,
				kind: CompletionItemKind.Reference,
				sortText: String(index).padStart(4, '0'),
				command: { id: ADD_SESSION_REFERENCE_COMMAND, title: '', arguments: [{ widget: this._widget, reference } satisfies IAddSessionReferenceArgs] },
			};
		});
	}
}
