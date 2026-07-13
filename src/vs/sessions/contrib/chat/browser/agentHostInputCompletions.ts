/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { IDecorationOptions, IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import { CompletionItem, CompletionItemKind } from '../../../../editor/common/languages.js';
import { IModelDeltaDecoration, ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { getCommandArgumentHint } from '../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js';
import { AgentHostCompletionReferenceKind, getAgentHostCompletionReferenceKind, IChatRequestVariableEntry, isAgentHostCompletionVariableEntry, toAgentHostCompletionVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatInputCompletionItem, IChatSessionsService, isAgentHostTarget } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { AgentHostInputCompletionsBase } from '../../../../workbench/contrib/chat/browser/widget/input/editor/agentHostInputCompletionsBase.js';
import { getInputPlaceholderColor, getRangeForPlaceholder } from '../../../../workbench/contrib/chat/browser/widget/input/editor/chatInputPlaceholderDecoration.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
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
	readonly range: OffsetRange | undefined;
}

CommandsRegistry.registerCommand(ADD_REFERENCE_COMMAND, (_accessor, arg: IReferenceArg) => {
	arg.handler.acceptCompletion(arg.entry, arg.insertText, arg.range);
});

/**
 * Finds the completion reference closest to the accepted range and returns
 * its range in the message text that will be sent.
 */
export function getAgentHostCompletionAttachmentRange(
	value: string,
	referenceText: string,
	preferredRange: OffsetRange | undefined,
	messageOffset: number,
	messageLength: number
): OffsetRange | undefined {
	if (!referenceText) {
		return undefined;
	}

	let bestIndex = -1;
	let bestDistance = Number.MAX_SAFE_INTEGER;
	let from = 0;
	while (true) {
		const index = value.indexOf(referenceText, from);
		if (index < 0) {
			break;
		}
		const distance = preferredRange ? Math.abs(index - preferredRange.start) : index;
		if (distance < bestDistance) {
			bestIndex = index;
			bestDistance = distance;
		}
		from = index + referenceText.length;
	}

	if (bestIndex < 0) {
		return undefined;
	}

	const start = bestIndex - messageOffset;
	const endExclusive = start + referenceText.length;
	if (start < 0 || endExclusive > messageLength) {
		return undefined;
	}
	return new OffsetRange(start, endExclusive);
}

/**
 * Determines whether an inline argument-hint placeholder should be shown for an
 * accepted agent-host slash command. Returns the hint text and the offset just
 * after the command token when the command is the sole content of `value`
 * followed by exactly one trailing space (i.e. no argument has been typed yet),
 * or `undefined` otherwise.
 */
export function getCommandArgumentHintPlaceholder(
	value: string,
	attachments: readonly IChatRequestVariableEntry[],
	insertedReferences: ReadonlyMap<string, { text: string; range: OffsetRange | undefined }>,
): { argumentHint: string; endOffset: number } | undefined {
	for (const entry of attachments) {
		if (getAgentHostCompletionReferenceKind(entry) !== AgentHostCompletionReferenceKind.Command) {
			continue;
		}
		const argumentHint = getCommandArgumentHint(entry._meta);
		if (!argumentHint) {
			continue;
		}
		const reference = insertedReferences.get(entry.id);
		if (!reference) {
			continue;
		}
		const range = getAgentHostCompletionAttachmentRange(value, reference.text, reference.range, 0, value.length);
		if (!range) {
			continue;
		}
		// Only show the hint while the command is the sole content followed by exactly one trailing space.
		if (value.slice(0, range.start).trim().length > 0 || value.slice(range.endExclusive) !== ' ') {
			return undefined;
		}
		return { argumentHint, endOffset: range.endExclusive };
	}
	return undefined;
}

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
export class AgentHostInputCompletionHandler extends AgentHostInputCompletionsBase<void, string> {

	private static readonly _className = 'sessions-agent-host-reference';
	private static readonly _argumentHintDecorationDescription = 'sessions-chat';
	private static readonly _argumentHintDecorationType = 'sessions-command-argument-hint';

	private readonly _registration = this._register(new MutableDisposable());

	private readonly _decorations: IEditorDecorationsCollection;

	/**
	 * Inserted reference per accepted attachment id. Used to find and decorate
	 * the accepted occurrence in the editor and dropped when the user removes
	 * the attachment chip.
	 */
	private readonly _insertedReferences = new Map<string /* id */, { text: string; range: OffsetRange | undefined }>();

	constructor(
		private readonly _editor: CodeEditorWidget,
		private readonly _contextAttachments: NewChatContextAttachments,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super(languageFeaturesService, chatSessionsService);

		this._register(this._codeEditorService.registerDecorationType(AgentHostInputCompletionHandler._argumentHintDecorationDescription, AgentHostInputCompletionHandler._argumentHintDecorationType, {}));

		this._decorations = this._editor.createDecorationsCollection();
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
			const session = this._sessionsService.activeSession.read(reader);
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
		const activeSession = this._sessionsService.activeSession.get();
		if (!activeSession || getChatSessionType(activeSession.resource) !== scheme) {
			return;
		}

		const editorUri = this._editor.getModel()?.uri;
		if (!editorUri) {
			return;
		}

		this._registration.value = this._registerProvider(
			{ scheme: editorUri.scheme, hasAccessToAllModels: true },
			`sessionsAgentHostInputCompletions[${scheme}]`,
			triggerCharacters,
			scheme,
		);
	}

	protected override _resolveContext(model: ITextModel, scheme: string): { sessionResource: URI; context: void } | undefined {
		// For a `/troubleshoot` request, `#` references target sessions (served
		// by the `#session` provider); suppress host-supplied completions (e.g.
		// the host's `#file` list) so only sessions are offered.
		if (/^\s*\/troubleshoot\b/.test(model.getValue())) {
			return undefined;
		}
		const session = this._sessionsService.activeSession.get();
		if (!session) {
			return undefined;
		}
		const sessionResource = session.resource;
		// Only respond when the currently-active session matches the
		// scheme this registration was made for. Stale registrations
		// (active session changed during the host RPC, etc.) are
		// silently ignored.
		if (getChatSessionType(sessionResource) !== scheme) {
			return undefined;
		}
		return { sessionResource, context: undefined };
	}

	protected override _buildItem(position: Position, item: IChatInputCompletionItem): CompletionItem {
		const replaceRange = AgentHostInputCompletionHandler.computeRange(position, item);
		const attachment = item.attachment;
		switch (attachment.kind) {
			case 'command': {
				const referenceText = item.insertText.trimEnd();
				const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, referenceText, attachment.command, attachment._meta);
				return {
					label: { label: item.insertText, description: attachment.description },
					insertText: item.insertText,
					filterText: item.insertText,
					range: replaceRange,
					kind: CompletionItemKind.Text,
					documentation: attachment.description,
					command: {
						id: ADD_REFERENCE_COMMAND,
						title: '',
						arguments: [{
							handler: this,
							entry,
							insertText: referenceText,
							range: this._toOffsetRange(replaceRange.replace, referenceText),
						} satisfies IReferenceArg],
					},
				};
			}
			case 'skill': {
				const referenceText = item.insertText.trimEnd();
				const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, referenceText, attachment.uri, attachment._meta);
				return {
					label: { label: item.insertText, description: attachment.description },
					insertText: item.insertText,
					filterText: item.insertText,
					range: replaceRange,
					documentation: attachment.description,
					kind: CompletionItemKind.Text,
					command: {
						id: ADD_REFERENCE_COMMAND,
						title: '',
						arguments: [{
							handler: this,
							entry,
							insertText: referenceText,
							range: this._toOffsetRange(replaceRange.replace, referenceText),
						} satisfies IReferenceArg],
					},
				};
			}
			default: {
				const label = attachment.displayName ?? item.insertText;
				const description = attachment.uri.path;
				const kind = attachment.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File;
				const entry: IChatRequestVariableEntry = {
					id: attachment.uri.toString(),
					name: attachment.displayName ?? this._basename(attachment.uri),
					value: attachment.uri,
					kind: attachment.isDirectory ? 'directory' : 'file',
					_meta: attachment._meta,
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
						arguments: [{
							handler: this,
							entry,
							insertText: item.insertText,
							range: this._toOffsetRange(replaceRange.replace, item.insertText),
						} satisfies IReferenceArg],
					},
				};
			}
		}
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
	acceptCompletion(entry: IChatRequestVariableEntry, insertText: string, range: OffsetRange | undefined): void {
		this._insertedReferences.set(entry.id, { text: insertText, range });
		this._contextAttachments.setAttachments([...this._contextAttachments.attachments.filter(e => e.id !== entry.id), entry]);
		this._updateDecorations();
	}

	getAttachmentsForSend(messageText?: string, messageOffset = 0): IChatRequestVariableEntry[] {
		const model = this._editor.getModel();
		const value = model?.getValue() ?? '';
		const messageLength = messageText?.length ?? value.length;
		const result: IChatRequestVariableEntry[] = [];
		for (const entry of this._contextAttachments.attachments) {
			const reference = this._insertedReferences.get(entry.id)
				?? (isAgentHostCompletionVariableEntry(entry) ? { text: entry.name, range: undefined } : undefined);
			if (!reference) {
				result.push(entry);
				continue;
			}
			const range = getAgentHostCompletionAttachmentRange(value, reference.text, reference.range, messageOffset, messageLength);
			if (!range) {
				if (!isAgentHostCompletionVariableEntry(entry)) {
					result.push(entry);
				}
				continue;
			}
			result.push({ ...entry, range });
		}
		return result;
	}

	private _registerDecorations(): void {
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
		for (const id of [...this._insertedReferences.keys()]) {
			if (!attachedIds.has(id)) {
				this._insertedReferences.delete(id);
			}
		}

		const model = this._editor.getModel();
		if (!model) {
			return;
		}
		const value = model.getValue();
		const decos: IModelDeltaDecoration[] = [];
		for (const reference of this._insertedReferences.values()) {
			const range = getAgentHostCompletionAttachmentRange(value, reference.text, reference.range, 0, value.length);
			if (!range) {
				continue;
			}
			const startPos = model.getPositionAt(range.start);
			const endPos = model.getPositionAt(range.endExclusive);
			decos.push({
				range: {
					startLineNumber: startPos.lineNumber,
					startColumn: startPos.column,
					endLineNumber: endPos.lineNumber,
					endColumn: endPos.column,
				},
				options: { description: 'sessions-agent-host-reference', inlineClassName: AgentHostInputCompletionHandler._className },
			});
		}

		this._decorations.set(decos);

		this._editor.setDecorationsByType(
			AgentHostInputCompletionHandler._argumentHintDecorationDescription,
			AgentHostInputCompletionHandler._argumentHintDecorationType,
			this._getArgumentHintDecorations(model, value),
		);
	}

	/**
	 * Computes the inline placeholder (ghost text) shown after an accepted
	 * agent-host slash command whose `_meta` carries an argument hint. Shown
	 * only while the command is the sole content followed by a single trailing
	 * space (i.e. before any argument has been typed).
	 */
	private _getArgumentHintDecorations(model: ITextModel, value: string): IDecorationOptions[] {
		const placeholder = getCommandArgumentHintPlaceholder(value, this._contextAttachments.attachments, this._insertedReferences);
		if (!placeholder) {
			return [];
		}
		const endPos = model.getPositionAt(placeholder.endOffset);
		return [{
			range: getRangeForPlaceholder({ startLineNumber: endPos.lineNumber, endLineNumber: endPos.lineNumber, startColumn: endPos.column, endColumn: endPos.column }),
			renderOptions: { after: { contentText: placeholder.argumentHint, color: getInputPlaceholderColor(this._themeService) } }
		}];
	}

	private _toOffsetRange(range: Range, insertText: string): OffsetRange | undefined {
		const model = this._editor.getModel();
		if (!model) {
			return undefined;
		}
		const start = model.getOffsetAt(range.getStartPosition());
		return new OffsetRange(start, start + insertText.length);
	}

}
