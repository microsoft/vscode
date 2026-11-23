/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { autorun } from '../../../../../base/common/observable.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { InlineCompletion, InlineCompletionContext, InlineCompletionEndOfLifeReason, InlineCompletionEndOfLifeReasonKind, InlineCompletions, InlineCompletionsProvider } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { InlineCompletionsController } from '../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { ChatRequestQueueKind, IChatService } from '../../common/chatService/chatService.js';
import { ActiveChatSessionHost, ChatInputSuggestionState, IChatDraftRequestService, IChatInputSuggestion, IChatInputSuggestionEvent, IChatInputSuggestionService, IChatRequestSubmission, IChatSessionObserverService } from '../../common/sessionObserver/chatSessionObserver.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { CHAT_QUESTION_ANSWER_SCHEME, getChatQuestionAnswerSessionResource } from '../widget/chatContentParts/chatQuestionAnswerEditor.js';
import { chatInputInlineCompletionsSetting } from '../widget/input/editor/chatInputInlineSuggestions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { hideInlineCompletionId } from '../../../../../editor/contrib/inlineCompletions/browser/controller/commandIds.js';
import { InlineCompletionContextKeys } from '../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionContextKeys.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

// Esc hides a suggestion in a chat input as it does in any editor. The editor's own rule needs
// `editorTextFocus`, which a chat input (a simple widget) never sets, so there Esc did nothing.
KeybindingsRegistry.registerKeybindingRule({
	id: hideInlineCompletionId,
	weight: KeybindingWeight.EditorContrib + 90,
	primary: KeyCode.Escape,
	when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ContextKeyExpr.or(InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.inlineEditVisible)),
});

/** An editor placeholder that renders nothing, set while a pushed suggestion shows. */
const HIDDEN_PLACEHOLDER = ' ';

interface IEntry {
	readonly owner: string;
	readonly suggestion: IChatInputSuggestion;
	shown: boolean;
	accepted?: { chars: number; text: string };
	/** Esc: gone for good; only a newer suggestion shows again. */
	dismissed?: boolean;
}

interface ISuggestionItem extends InlineCompletion {
	readonly suggestionId: string;
	readonly session: URI;
	readonly prefixLength: number;
}

interface ISuggestionList extends InlineCompletions<ISuggestionItem> {
	readonly items: readonly ISuggestionItem[];
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trimStart().toLowerCase();

/** The ghost text: the suggested message, or for an answer, the picked options and any added words. */
function suggestionText(s: IChatInputSuggestion): string {
	if (s.text) {
		return s.text;
	}
	const a = s.answer;
	return a ? [a.selectedOptions?.join(', '), a.freeform].filter(Boolean).join(' — ') : '';
}

/**
 * Pushed input suggestions (proposed API `chatInputSuggestion`): ghost text in every chat
 * input bound to the session, rendered by the input's own inline-completions controller.
 * Tab puts it in the box; it is never sent on its own.
 */
export class ChatInputSuggestionService extends Disposable implements IChatInputSuggestionService {
	declare readonly _serviceBrand: undefined;

	private readonly entries = new ResourceMap<IEntry>();
	private readonly _onDidChangeSuggestions = this._register(new Emitter<URI>());
	readonly onDidChangeSuggestions = this._onDidChangeSuggestions.event;
	private readonly _onDidChangeSuggestionState = this._register(new Emitter<IChatInputSuggestionEvent>());
	readonly onDidChangeSuggestionState = this._onDidChangeSuggestionState.event;
	private readonly _onDidSubmitRequest = this._register(new Emitter<IChatRequestSubmission>());
	readonly onDidSubmitRequest = this._onDidSubmitRequest.event;

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService chatService: IChatService,
		@IChatSessionObserverService private readonly observer: IChatSessionObserverService,
		@IChatDraftRequestService private readonly drafts: IChatDraftRequestService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IModelService private readonly modelService: IModelService,
	) {
		super();
		const provider: InlineCompletionsProvider<ISuggestionList> = {
			groupId: 'chatInputSuggestion',
			// A new or withdrawn suggestion refetches in every input showing one, so none keeps a stale one.
			onDidChangeInlineCompletions: Event.map(this._onDidChangeSuggestions.event, () => undefined),
			provideInlineCompletions: (model, position, context, token) => this.provide(model, position, context, token),
			handleItemDidShow: (_list, item) => this.onShown(item),
			handlePartialAccept: (_list, item, _chars, info) => this.onAccepted(item, info.acceptedLength, true),
			handleEndOfLifetime: (_list, item, reason) => this.onEnd(item, reason),
			disposeInlineCompletions: () => { },
		};
		for (const scheme of [Schemas.vscodeChatInput, Schemas.sessionsChatInput]) {
			this._register(languageFeaturesService.inlineCompletionsProvider.register({ scheme }, provider));
		}
		// An answer box's model is a simple widget's, which a selector reaches only with access to all models.
		this._register(languageFeaturesService.inlineCompletionsProvider.register({ scheme: CHAT_QUESTION_ANSWER_SCHEME, hasAccessToAllModels: true }, provider));

		// Chat inputs keep inline suggestions off unless Copilot's chat completions are on; a
		// pushed suggestion turns them on for the inputs bound to its session, while it lasts.
		// It stays in place like a placeholder: shown before the input is focused and kept on blur,
		// so the input doesn't grow on focus and shrink on blur.
		const bindWidget = (w: IChatWidget) => {
			if (this.widgetListeners.has(w)) {
				return;
			}
			const store = new DisposableStore();
			store.add(w.inputEditor.onDidFocusEditorText(() => this.showIn(w)));
			store.add(w.onDidShow(() => this.showIn(w)));
			store.add(w.onDidChangeViewModel(() => this.syncWidget(w)));
			// Focus in any other editor stops every other editor's ghost text; bring it back here.
			const controller = InlineCompletionsController.get(w.inputEditor);
			if (controller) {
				const reshow = store.add(new MutableDisposable());
				store.add(autorun(reader => {
					const state = controller.model.read(reader)?.state.read(reader);
					if (!state && this.fits(w)) {
						reshow.value = disposableTimeout(() => this.showIn(w), 0);
					}
				}));
			}
			this.widgetListeners.set(w, store);
		};
		this.chatWidgetService.getAllWidgets().forEach(bindWidget);
		this._register(this.chatWidgetService.onDidAddWidget(bindWidget));
		this._register(this.chatWidgetService.onDidRemoveWidget(w => this.widgetListeners.deleteAndDispose(w)));

		// Every new submission: report it, and tie it to the suggestion or draft it came from.
		this._register(chatService.onDidAcceptRequest(e => {
			if (e.text === undefined) {
				return;
			}
			const session = e.chatSessionResource;
			const entry = this.entries.get(session);
			const draft = this.drafts.editingDraft(session);
			const kind = e.queue === ChatRequestQueueKind.Steering ? 'steer' : e.queue === ChatRequestQueueKind.Queued ? 'queue' : 'send';
			const fromSuggestion = entry?.accepted && norm(e.text).startsWith(norm(entry.accepted.text).slice(0, Math.max(1, Math.min(entry.accepted.chars, 20))))
				? { id: entry.suggestion.id, owner: entry.owner, acceptedChars: entry.accepted.chars }
				: undefined;
			const requestId = generateUuid();
			this._onDidSubmitRequest.fire({
				session, requestId, text: e.text, kind, host: this.hostFor(session),
				...(fromSuggestion ? { fromSuggestion } : {}), ...(draft ? { fromDraft: { id: draft.id, owner: draft.owner } } : {}),
			});
			if (draft) {
				this.drafts.resolveDraft(draft.id, kind === 'steer' ? 'steered' : kind === 'queue' ? 'queued' : 'sent', { finalText: e.text, edited: norm(e.text) !== norm(draft.text), requestId });
			}
			// Any submission ends the suggestion's life.
			if (entry) {
				this.entries.delete(session);
				this._onDidChangeSuggestions.fire(session);
				this.restore(session);
			}
		}));
	}

	private readonly widgetListeners = this._register(new DisposableMap<IChatWidget>());

	/** The live, undismissed suggestion for the session a widget shows. */
	private entryFor(w: IChatWidget): IEntry | undefined {
		const session = w.viewModel?.sessionResource;
		const entry = session ? this.entries.get(session) : undefined;
		return entry && !entry.dismissed ? entry : undefined;
	}

	/** Whether a visible widget's input could show its session's suggestion over what it holds now. */
	private fits(w: IChatWidget): boolean {
		const entry = this.entryFor(w);
		if (!entry || !w.visible) {
			return false;
		}
		const current = w.inputEditor.getModel()?.getValue() ?? '';
		return !current.trim() || norm(suggestionText(entry.suggestion)).startsWith(norm(current));
	}

	/** Shows the session's suggestion in a visible widget's input, focused or not, and keeps it on blur. */
	private showIn(w: IChatWidget): void {
		if (!this.entryFor(w) || !w.visible) {
			return;
		}
		w.inputEditor.updateOptions({ inlineSuggest: { enabled: true, keepOnBlur: true } });
		InlineCompletionsController.get(w.inputEditor)?.model.get()?.trigger();
	}

	/** A widget switched sessions: show the new one's suggestion, or put the input back as configured. */
	private syncWidget(w: IChatWidget): void {
		// The input keeps an inline completion that is still valid (forward stability), so the last
		// session's suggestion would stay over this one's until the user typed.
		InlineCompletionsController.get(w.inputEditor)?.model.get()?.stop();
		if (this.entryFor(w)) {
			this.showIn(w);
		} else {
			this.restoreWidget(w);
		}
	}

	/**
	 * Drops what the session's inputs show now: an input keeps an inline completion that is still
	 * valid (forward stability), so a replaced suggestion would otherwise stay until the user types.
	 */
	private clearShown(session: URI): void {
		for (const w of this.chatWidgetService.getAllWidgets()) {
			if (w.viewModel?.sessionResource.toString() === session.toString()) {
				InlineCompletionsController.get(w.inputEditor)?.model.get()?.stop();
			}
		}
	}

	/** Restores the configured inline-suggestion setting and the placeholder on the inputs bound to a session. */
	private restore(session: URI): void {
		for (const w of this.chatWidgetService.getAllWidgets()) {
			if (w.viewModel?.sessionResource.toString() === session.toString()) {
				this.restoreWidget(w);
			}
		}
	}

	private restoreWidget(w: IChatWidget): void {
		const enabled = this.configurationService.getValue<boolean>(chatInputInlineCompletionsSetting) === true;
		w.inputEditor.updateOptions({ inlineSuggest: { enabled, keepOnBlur: false } });
		this.setPlaceholderHidden(w, false);
	}

	/** The placeholder each input had before a suggestion showed in it. */
	private readonly hiddenPlaceholders = new WeakMap<IChatWidget, string>();

	/**
	 * While a suggestion shows as ghost text in a session's inputs, their placeholder (it would trail
	 * the ghost text) gives way: an editor placeholder of one space renders nothing, and the chat
	 * input's own placeholder decoration yields to any editor placeholder, as it does to dictation's.
	 */
	private markShown(session: URI, shown: boolean): void {
		for (const w of this.chatWidgetService.getAllWidgets()) {
			if (w.viewModel?.sessionResource.toString() === session.toString()) {
				this.setPlaceholderHidden(w, shown);
			}
		}
	}

	private setPlaceholderHidden(w: IChatWidget, hidden: boolean): void {
		const editor = w.inputEditor;
		if (hidden && !this.hiddenPlaceholders.has(w)) {
			this.hiddenPlaceholders.set(w, editor.getOption(EditorOption.placeholder) ?? '');
			editor.updateOptions({ placeholder: HIDDEN_PLACEHOLDER });
		} else if (!hidden && this.hiddenPlaceholders.has(w)) {
			const previous = this.hiddenPlaceholders.get(w)!;
			this.hiddenPlaceholders.delete(w);
			if (editor.getOption(EditorOption.placeholder) === HIDDEN_PLACEHOLDER) {
				editor.updateOptions({ placeholder: previous });
			}
		}
	}

	private hostFor(session: URI): ActiveChatSessionHost {
		return this.observer.activeSessions.find(a => a.resource.toString() === session.toString())?.host ?? 'chatView';
	}

	private widgetFor(model: ITextModel): IChatWidget | undefined {
		return this.chatWidgetService.getAllWidgets().find(w => w.inputEditor.getModel() === model);
	}

	setSuggestion(owner: string, session: URI, suggestion: IChatInputSuggestion | undefined): boolean {
		const prev = this.entries.get(session);
		if (suggestion && prev?.suggestion.id !== suggestion.id && !this.takes(session, suggestion, prev)) {
			return false;
		}
		if (prev && (!suggestion || prev.suggestion.id !== suggestion.id)) {
			this.fire(session, prev, suggestion ? 'superseded' : 'invalidated');
		}
		if (suggestion) {
			this.entries.set(session, { owner, suggestion, shown: false });
		} else {
			this.entries.delete(session);
		}
		this.clearShown(session);
		this._onDidChangeSuggestions.fire(session);
		if (!suggestion) {
			this.restore(session);
			return true;
		}
		// Show it at once in every visible input on the session, focused or not.
		for (const w of this.chatWidgetService.getAllWidgets()) {
			if (w.viewModel?.sessionResource.toString() === session.toString()) {
				this.showIn(w);
			}
		}
		return true;
	}

	/**
	 * Whether a new suggestion may take the place of what the session's inputs offer now, as the user has
	 * them this moment. It must go on from every word they typed (case and spacing aside), else it would
	 * drop them. And while they type along the one there, or edit it after Tab took it in, that one stays,
	 * so the ghost text doesn't change under them.
	 */
	private takes(session: URI, next: IChatInputSuggestion, prev: IEntry | undefined): boolean {
		// An answer goes in the question's answer box while it shows; anything else in the chat input.
		const inAnswerBox = !!next.answer && this.answerSurfaces.has(session);
		const typed = (inAnswerBox
			? this.modelService.getModels().filter(m => getChatQuestionAnswerSessionResource(m.uri)?.toString() === session.toString()).map(m => m.getValue())
			: this.chatWidgetService.getAllWidgets().filter(w => w.viewModel?.sessionResource.toString() === session.toString()).map(w => w.inputEditor.getModel()?.getValue() ?? '')
		).filter(t => t.trim());
		if (!typed.length) {
			return true;
		}
		const textOf = (s: IChatInputSuggestion) => norm(inAnswerBox ? s.answer?.freeform ?? '' : suggestionText(s));
		if (!typed.every(t => textOf(next).startsWith(norm(t)))) {
			return false;
		}
		if (!prev || prev.dismissed) {
			return true;
		}
		// Taken in with Tab: theirs while the input still holds it (as a submission links to it), not once they cleared it.
		const editingTaken = !!prev.accepted && typed.every(t => norm(t).startsWith(norm(prev.accepted!.text).slice(0, Math.max(1, Math.min(prev.accepted!.chars, 20)))));
		return !editingTaken && !typed.every(t => textOf(prev.suggestion).startsWith(norm(t)));
	}

	getSuggestion(session: URI): (IChatInputSuggestion & { readonly owner: string }) | undefined {
		const e = this.entries.get(session);
		return e ? { ...e.suggestion, owner: e.owner } : undefined;
	}

	private readonly answerSurfaces = new ResourceMap<number>();

	claimAnswerSurface(session: URI): IDisposable {
		this.answerSurfaces.set(session, (this.answerSurfaces.get(session) ?? 0) + 1);
		return toDisposable(() => {
			const n = (this.answerSurfaces.get(session) ?? 1) - 1;
			if (n > 0) {
				this.answerSurfaces.set(session, n);
			} else {
				this.answerSurfaces.delete(session);
			}
		});
	}

	reportAnswer(session: URI, answer: { readonly kind: 'answer' | 'planDecision'; readonly selected: readonly string[]; readonly text: string }): void {
		const entry = this.entries.get(session);
		const suggested = entry?.suggestion.answer;
		const sameOptions = !!suggested?.selectedOptions?.length
			&& suggested.selectedOptions.length === answer.selected.length && suggested.selectedOptions.every(o => answer.selected.includes(o));
		const keptText = !!suggested?.freeform && !!answer.text && norm(answer.text).startsWith(norm(suggested.freeform).slice(0, 20));
		const accepted = !!entry && !!suggested && (sameOptions || keptText);
		if (entry && accepted && !entry.accepted) {
			this.fire(session, entry, 'accepted', { acceptedChars: keptText ? suggested!.freeform!.length : 0, selectedOptions: answer.selected });
		}
		const text = [answer.selected.join(', '), answer.text].filter(Boolean).join(' — ');
		// Linked when it matches the suggestion, or when its text was taken in (Tab) and then edited.
		const linked = entry && (accepted || entry.accepted);
		const acceptedChars = entry?.accepted?.chars ?? (keptText ? suggested!.freeform!.length : 0);
		this._onDidSubmitRequest.fire({
			session, requestId: generateUuid(), text, kind: answer.kind, host: this.hostFor(session),
			...(linked ? { fromSuggestion: { id: entry.suggestion.id, owner: entry.owner, acceptedChars } } : {}),
		});
		if (entry) {
			this.entries.delete(session);
			this._onDidChangeSuggestions.fire(session);
		}
	}

	reportAnswerInteraction(session: URI, state: 'shown' | 'accepted', acceptedChars?: number): void {
		const e = this.entries.get(session);
		if (!e?.suggestion.answer) {
			return;
		}
		if (state === 'shown') {
			if (!e.shown) {
				e.shown = true;
				this.fire(session, e, 'shown');
			}
			return;
		}
		const chars = acceptedChars ?? e.suggestion.answer.freeform?.length ?? 0;
		e.accepted = { chars, text: e.suggestion.answer.freeform?.slice(0, chars) ?? '' };
		this.fire(session, e, 'accepted', { acceptedChars: chars });
	}

	reportState(session: URI, id: string, state: ChatInputSuggestionState, host: ActiveChatSessionHost, details?: { acceptedChars?: number; reason?: string }): void {
		const e = this.entries.get(session);
		if (e && e.suggestion.id === id) {
			this._onDidChangeSuggestionState.fire({ id, session, owner: e.owner, state, host, ...details });
		}
	}

	private fire(session: URI, e: IEntry, state: ChatInputSuggestionState, details?: { acceptedChars?: number; reason?: string; selectedOptions?: readonly string[] }): void {
		this._onDidChangeSuggestionState.fire({ id: e.suggestion.id, session, owner: e.owner, state, host: this.hostFor(session), ...details });
	}

	private provide(model: ITextModel, position: Position, _context: InlineCompletionContext, _token: CancellationToken): ISuggestionList | undefined {
		// The free-form answer box of an open question or plan review: its suggested words.
		const answerSession = getChatQuestionAnswerSessionResource(model.uri);
		let session: URI | undefined;
		let text: string | undefined;
		let entry: IEntry | undefined;
		if (answerSession) {
			session = answerSession;
			entry = this.entries.get(session);
			text = entry?.suggestion.answer?.freeform;
		} else {
			const widget = this.widgetFor(model);
			session = widget?.viewModel?.sessionResource;
			// A session with no turn yet (a new-session composer) has nothing to reply to.
			if (!session || !widget?.viewModel?.model.hasRequests) {
				return undefined;
			}
			entry = this.entries.get(session);
			// While a question carousel or plan review shows, the answer goes there, not to the input.
			text = entry && !(entry.suggestion.answer && this.answerSurfaces.has(session)) ? suggestionText(entry.suggestion) : undefined;
		}
		if (!entry || entry.dismissed || !text) {
			return undefined;
		}
		const current = model.getValue();
		const end = model.getFullModelRange().getEndPosition();
		if (!position.equals(end)) {
			return undefined;
		}
		// Shown only on an empty input, or one holding a prefix of the suggestion; never over other text.
		if (current.trim() && !norm(text).startsWith(norm(current))) {
			if (!entry.shown) {
				this.fire(session, entry, 'hidden', { reason: 'userTypedFirst' });
			}
			return undefined;
		}
		const insertText = current && text.toLowerCase().startsWith(current.toLowerCase()) ? current + text.slice(current.length) : text;
		const item: ISuggestionItem = {
			insertText,
			range: new Range(1, 1, end.lineNumber, end.column),
			suggestionId: entry.suggestion.id,
			session,
			prefixLength: current.length,
		};
		return { items: [item], enableForwardStability: true };
	}

	private onShown(item: ISuggestionItem): void {
		if (!getChatQuestionAnswerSessionResource(item.session) && this.entries.has(item.session)) {
			this.markShown(item.session, true);
		}
		const e = this.entries.get(item.session);
		if (e && e.suggestion.id === item.suggestionId && !e.shown) {
			e.shown = true;
			this.fire(item.session, e, 'shown');
		}
	}

	private onAccepted(item: ISuggestionItem, chars: number, partial: boolean): void {
		const e = this.entries.get(item.session);
		if (e && e.suggestion.id === item.suggestionId) {
			const accepted = Math.max(0, chars);
			e.accepted = { chars: accepted, text: suggestionText(e.suggestion).slice(0, item.prefixLength + accepted) };
			this.fire(item.session, e, partial ? 'partiallyAccepted' : 'accepted', { acceptedChars: accepted });
		}
	}

	private onEnd(item: ISuggestionItem, reason: InlineCompletionEndOfLifeReason<ISuggestionItem>): void {
		const e = this.entries.get(item.session);
		if (!e || e.suggestion.id !== item.suggestionId) {
			return;
		}
		if (reason.kind !== InlineCompletionEndOfLifeReasonKind.Ignored) {
			this.markShown(item.session, false);
		}
		if (reason.kind === InlineCompletionEndOfLifeReasonKind.Accepted) {
			this.onAccepted(item, suggestionText(e.suggestion).length - item.prefixLength, false);
		} else if (reason.kind === InlineCompletionEndOfLifeReasonKind.Rejected) {
			e.dismissed = true;
			this.fire(item.session, e, 'rejected');
			this.restore(item.session);
		} else if (reason.userTypingDisagreed && e.shown) {
			this.fire(item.session, e, 'hidden', { reason: 'userTypingDisagreed' });
		}
	}
}
