/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { getWordAtText } from '../../../../editor/common/core/wordHelper.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from '../../../../editor/common/languages.js';
import { IModelDeltaDecoration, ITextModel } from '../../../../editor/common/model.js';
import { IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { getCopilotCliSessionRawId } from '../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { createSessionReferenceVariableEntry } from '../../../services/sessions/browser/sessionReference.js';
import { NewChatContextAttachments } from './newChatContextAttachments.js';

const VARIABLE_LEADER = '#';
const SESSION_TOKEN = 'session';

/**
 * Command ID run when a `#session` completion item is accepted: attaches the
 * chosen session as a context reference and decorates its inline text.
 */
const ADD_SESSION_REFERENCE_COMMAND = 'sessions.chat.addSessionReference';

interface IReferenceArg {
	readonly handler: SessionReferenceCompletionHandler;
	readonly entry: IChatRequestVariableEntry;
	readonly referenceText: string;
}

CommandsRegistry.registerCommand(ADD_SESSION_REFERENCE_COMMAND, (_accessor, arg: IReferenceArg) => {
	arg.handler.acceptSessionReference(arg.entry, arg.referenceText);
});

/**
 * Provides `#session` completions in the sessions new-chat input — one item per
 * Copilot CLI session (active, past, or archived). Accepting an item inserts an
 * inline `#session:<title>` reference (like `#file:`) and adds the session as a
 * context attachment; the sessions management service later resolves referenced
 * sessions to their event-log paths for the `/troubleshoot` skill. Both Enter
 * and Tab accept, since these are native editor suggestions.
 */
export class SessionReferenceCompletionHandler extends Disposable {

	private static readonly _wordPattern = /#[^\s]*/g; // MUST use g-flag
	private static readonly _className = 'sessions-variable-reference';

	private readonly _decorations: IEditorDecorationsCollection;

	/** Inline `#session:<title>` reference texts present in the editor, for decoration. */
	private readonly _referenceTexts = new Set<string>();

	constructor(
		private readonly _editor: CodeEditorWidget,
		private readonly _contextAttachments: NewChatContextAttachments,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
	) {
		super();
		this._decorations = this._editor.createDecorationsCollection();
		this._registerSessionCompletions();
		this._registerDecorations();
	}

	private _registerSessionCompletions(): void {
		const uri = this._editor.getModel()?.uri;
		if (!uri) {
			return;
		}

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
			_debugDisplayName: 'sessionsVariableSession',
			triggerCharacters: [VARIABLE_LEADER],
			provideCompletionItems: (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken): CompletionList | null => {
				const varWord = getWordAtText(position.column, SessionReferenceCompletionHandler._wordPattern, model.getLineContent(position.lineNumber), 0);
				if (!varWord || !varWord.word.startsWith(VARIABLE_LEADER)) {
					return null;
				}

				// Participate while the typed token could still become `#session`
				// (empty, a prefix of `session`, or already past it). Bail only when
				// it definitely can't, so we don't fight unrelated `#` providers.
				const typed = varWord.word.slice(VARIABLE_LEADER.length).toLowerCase();
				if (typed.length > 0 && !SESSION_TOKEN.startsWith(typed) && !typed.startsWith(SESSION_TOKEN)) {
					return null;
				}
				const replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
				const insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);

				// Keep `incomplete` so the editor re-queries as the user types towards
				// `#session`; a sibling provider returning a complete list (e.g. the
				// host's `#` file completions) would otherwise suppress re-querying. A
				// bare `#` yields no items yet (e.g. in `/troubleshoot #`).
				const suggestions = typed.length === 0 ? [] : this._collectSessionItems({ insert, replace });
				return { suggestions, incomplete: true };
			}
		}));
	}

	/** Attaches the chosen session and decorates its inline reference text. */
	acceptSessionReference(entry: IChatRequestVariableEntry, referenceText: string): void {
		this._contextAttachments.addAttachments(entry);
		this._referenceTexts.add(referenceText);
		this._updateDecorations();
	}

	private _collectSessionItems(range: { insert: Range; replace: Range }): CompletionItem[] {
		const activeResource = this.sessionsService.activeSession.get()?.resource;
		const activeResourceStr = activeResource?.toString();

		// Only Copilot CLI sessions have a readable event log; include active,
		// past, and archived. Resolve the id once, then newest first.
		const sessions = this.sessionsManagementService.getSessions()
			.map(session => ({ session, rawId: getCopilotCliSessionRawId(session.resource) }))
			.filter((entry): entry is { session: ISession; rawId: string } => entry.rawId !== undefined)
			.filter(entry => {
				// Scope to the active session's host: each host has a distinct
				// resource scheme (local `agent-host-copilotcli` vs remote
				// `remote-<authority>-copilotcli`), so a session whose events.jsonl
				// lives on another machine — and thus can't be read by the skill
				// running on the active host — is excluded. When there is no active
				// session we can't determine the host, so don't filter.
				return !activeResource || entry.session.resource.scheme === activeResource.scheme;
			})
			.sort((a, b) => b.session.updatedAt.get().getTime() - a.session.updatedAt.get().getTime());

		return sessions.map(({ session, rawId }, index) => {
			const title = session.title.get() || localize('untitledSession', "Untitled session");
			// Collapse whitespace so the inline `#session:<title>` reference (and its
			// decoration) stays on one line even if the title contains newlines.
			const referenceTitle = title.replace(/\s+/g, ' ').trim() || localize('untitledSession', "Untitled session");
			const isActive = activeResourceStr === session.resource.toString();
			const date = session.updatedAt.get().toLocaleString();
			const description = isActive ? localize('currentSessionLabel', "{0} (current)", date) : date;
			const referenceText = `${VARIABLE_LEADER}${SESSION_TOKEN}:${referenceTitle}`;
			const entry = createSessionReferenceVariableEntry(rawId, referenceTitle, session.resource);
			return {
				label: { label: referenceTitle, description },
				// Include the leading `#` so the typed `#session` word matches
				// (Monaco filters against the word including the trigger char).
				filterText: `${VARIABLE_LEADER}${SESSION_TOKEN} ${referenceTitle}`,
				// Insert the inline reference, replacing the typed `#session…` token.
				insertText: `${referenceText} `,
				range,
				kind: CompletionItemKind.Reference,
				sortText: String(index).padStart(4, '0'),
				command: {
					id: ADD_SESSION_REFERENCE_COMMAND,
					title: '',
					arguments: [{ handler: this, entry, referenceText } satisfies IReferenceArg],
				},
			} satisfies CompletionItem;
		});
	}

	// --- Decorations ---

	private _registerDecorations(): void {
		this._register(this._editor.onDidChangeModelContent(() => this._updateDecorations()));
		this._updateDecorations();
	}

	private _updateDecorations(): void {
		const model = this._editor.getModel();
		if (!model || this._referenceTexts.size === 0) {
			this._decorations.set([]);
			return;
		}

		const value = model.getValue();
		const decos: IModelDeltaDecoration[] = [];
		for (const referenceText of this._referenceTexts) {
			let index = value.indexOf(referenceText);
			while (index !== -1) {
				const startPos = model.getPositionAt(index);
				const endPos = model.getPositionAt(index + referenceText.length);
				decos.push({
					range: Range.fromPositions(startPos, endPos),
					options: { description: 'sessions-session-reference', inlineClassName: SessionReferenceCompletionHandler._className },
				});
				index = value.indexOf(referenceText, index + referenceText.length);
			}
		}
		this._decorations.set(decos);
	}
}
