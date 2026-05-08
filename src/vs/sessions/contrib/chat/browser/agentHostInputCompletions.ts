/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { themeColorFromId } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../editor/common/editorCommon.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatInputCompletionItem, IChatSessionsService, isAgentHostTarget } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from '../../../../workbench/contrib/chat/common/widget/chatColors.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { NewChatContextAttachments } from './newChatContextAttachments.js';

/**
 * Command ID used by completion items to attach an agent-host-supplied
 * resource reference (returned by `IChatSessionContentProvider.provideChatInputCompletions`)
 * to the sessions context attachments.
 */
const ADD_REFERENCE_COMMAND = 'sessions.chat.addAgentHostReference';

interface IReferenceArg {
	readonly handler: AgentHostInputCompletionHandler;
	readonly entry: IChatRequestVariableEntry;
	readonly insertText: string;
}

CommandsRegistry.registerCommand(ADD_REFERENCE_COMMAND, (_accessor, arg: IReferenceArg) => {
	arg.handler.acceptCompletion(arg.entry, arg.insertText);
});

/**
 * Bridges the new-chat input editor to the agent host's `completions`
 * command for the currently-selected session type. Mirrors
 * {@link AgentHostInputCompletions} (which handles the *existing* chat
 * widget) but feeds results into {@link NewChatContextAttachments}
 * instead of the chat widget's `ChatDynamicVariableModel`.
 *
 * The Monaco completion provider is registered dynamically per active
 * session type so trigger characters reflect what the host announces in
 * its `InitializeResult.completionTriggerCharacters`. When the user
 * picks a different session type, the registration is torn down and
 * re-built with the new host's trigger chars.
 */
export class AgentHostInputCompletionHandler extends Disposable {

	private static readonly _decoType = 'sessions-agent-host-reference';
	private static _decosRegistered = false;

	private readonly _registration = this._register(new MutableDisposable());

	/**
	 * Inserted text per accepted attachment URI. Used to find and decorate
	 * occurrences in the editor and dropped when the user removes the
	 * attachment chip.
	 */
	private readonly _insertedTexts = new Map<string /* uri */, string /* insertText */>();

	constructor(
		private readonly _editor: CodeEditorWidget,
		private readonly _contextAttachments: NewChatContextAttachments,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
	) {
		super();

		this._registerDecorations();

		// Watch the active session and (re-)register the Monaco provider
		// with the trigger characters announced by whichever content
		// provider handles the active session's resource scheme.
		//
		// We key off the resource scheme (via `getChatSessionType`) rather
		// than `ISession.sessionType` because the latter is the *agent
		// provider* name (e.g. `copilotcli`), while content providers are
		// registered for the resource scheme (e.g. `agent-host-copilot` or
		// `remote-<host>-copilot`). Only the scheme matches the keys
		// `IChatSessionsService.getChatInputCompletionTriggerCharacters`
		// looks up.
		let currentScheme: string | undefined;
		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			const scheme = session ? getChatSessionType(session.resource) : undefined;
			if (scheme === currentScheme) {
				return;
			}
			currentScheme = scheme;
			this._registration.clear();
			if (scheme && isAgentHostTarget(scheme)) {
				void this._registerForScheme(scheme);
			}
		}));
	}

	private async _registerForScheme(scheme: string): Promise<void> {
		const triggerCharacters = await this._chatSessionsService.getChatInputCompletionTriggerCharacters(scheme);
		if (!triggerCharacters || triggerCharacters.length === 0) {
			return;
		}

		// The active session may have changed mid-await — bail if its
		// resource scheme is no longer the one we registered for.
		const activeSession = this._sessionsManagementService.activeSession.get();
		if (!activeSession || getChatSessionType(activeSession.resource) !== scheme) {
			return;
		}

		const editorUri = this._editor.getModel()?.uri;
		if (!editorUri) {
			return;
		}

		this._registration.value = this._languageFeaturesService.completionProvider.register({ scheme: editorUri.scheme, hasAccessToAllModels: true }, {
			_debugDisplayName: `sessionsAgentHostInputCompletions[${scheme}]`,
			triggerCharacters: [...triggerCharacters],
			provideCompletionItems: (model, position, ctx, token) => this._provide(model, position, ctx, token),
		});
	}

	private async _provide(model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken): Promise<CompletionList | null> {
		const session = this._sessionsManagementService.activeSession.get();
		if (!session) {
			return null;
		}
		const sessionResource = session.resource;
		if (!isAgentHostTarget(getChatSessionType(sessionResource))) {
			return null;
		}

		const text = model.getValue();
		const offset = model.getOffsetAt(position);
		const result = await this._chatSessionsService.provideChatInputCompletions(sessionResource, { text, offset }, token);
		if (token.isCancellationRequested || !result) {
			return null;
		}

		const suggestions: CompletionItem[] = [];
		for (const item of result.items) {
			suggestions.push(this._toMonacoItem(position, item));
		}
		return { suggestions };
	}

	private _toMonacoItem(position: Position, item: IChatInputCompletionItem): CompletionItem {
		const replaceRange = this._computeRange(position, item);
		const label = item.attachment.displayName ?? item.insertText;
		const description = item.attachment.uri.path;
		const kind = item.attachment.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File;
		const entry: IChatRequestVariableEntry = {
			id: item.attachment.uri.toString(),
			name: item.attachment.displayName ?? this._basename(item.attachment.uri),
			value: item.attachment.uri,
			kind: item.attachment.isDirectory ? 'directory' : 'file',
			_meta: item.attachment._meta,
		};
		return {
			label: { label, description },
			insertText: item.insertText,
			filterText: item.insertText,
			range: replaceRange,
			kind,
			command: {
				id: ADD_REFERENCE_COMMAND,
				title: '',
				arguments: [{ handler: this, entry, insertText: item.insertText } satisfies IReferenceArg],
			},
		};
	}

	private _computeRange(position: Position, item: IChatInputCompletionItem): { insert: Range; replace: Range } {
		// Positions returned by the provider are already 1-based Monaco
		// positions, so they can be used directly. When omitted, default
		// to a zero-length range at the cursor (Monaco then inserts
		// without replacing).
		const start = item.start ?? position;
		const end = item.end ?? position;
		const replace = new Range(start.lineNumber, start.column, end.lineNumber, end.column);
		const insert = new Range(start.lineNumber, start.column, position.lineNumber, position.column);
		return { insert, replace };
	}

	private _basename(uri: URI): string {
		const idx = uri.path.lastIndexOf('/');
		return idx >= 0 ? uri.path.slice(idx + 1) : uri.path;
	}

	// --- Attachment + decoration bridging ---

	/**
	 * Called when the user accepts an item from the Monaco completion
	 * widget (via the registered command). Adds the resource to the
	 * context attachments and tracks the inserted text so it can be
	 * highlighted in the editor.
	 */
	acceptCompletion(entry: IChatRequestVariableEntry, insertText: string): void {
		this._insertedTexts.set(entry.id, insertText);
		this._contextAttachments.addAttachments(entry);
		this._updateDecorations();
	}

	private _registerDecorations(): void {
		if (!AgentHostInputCompletionHandler._decosRegistered) {
			AgentHostInputCompletionHandler._decosRegistered = true;
			this._codeEditorService.registerDecorationType('sessions-chat', AgentHostInputCompletionHandler._decoType, {
				color: themeColorFromId(chatSlashCommandForeground),
				backgroundColor: themeColorFromId(chatSlashCommandBackground),
				borderRadius: '3px',
			});
		}

		// Re-decorate when the editor content changes (the user typed,
		// pasted, or the inserted text moved) and when attachments change
		// (a chip was removed, draft state restored, etc.).
		this._register(this._editor.onDidChangeModelContent(() => this._updateDecorations()));
		this._register(this._contextAttachments.onDidChangeContext(() => this._updateDecorations()));
		this._updateDecorations();
	}

	private _updateDecorations(): void {
		// Drop tracking for any URI that is no longer attached. The chip
		// being removed is the canonical signal that the reference is
		// gone, even if its inserted text still happens to appear in the
		// editor.
		const attachedIds = new Set(this._contextAttachments.attachments.map(a => a.id));
		for (const id of [...this._insertedTexts.keys()]) {
			if (!attachedIds.has(id)) {
				this._insertedTexts.delete(id);
			}
		}

		const model = this._editor.getModel();
		if (!model) {
			return;
		}
		const value = model.getValue();
		const decos: IDecorationOptions[] = [];
		for (const insertText of this._insertedTexts.values()) {
			if (!insertText) {
				continue;
			}
			let from = 0;
			while (true) {
				const idx = value.indexOf(insertText, from);
				if (idx < 0) {
					break;
				}
				const startPos = model.getPositionAt(idx);
				const endPos = model.getPositionAt(idx + insertText.length);
				decos.push({
					range: {
						startLineNumber: startPos.lineNumber,
						startColumn: startPos.column,
						endLineNumber: endPos.lineNumber,
						endColumn: endPos.column,
					},
				});
				from = idx + insertText.length;
			}
		}

		this._editor.setDecorationsByType('sessions-chat', AgentHostInputCompletionHandler._decoType, decos);
	}
}
