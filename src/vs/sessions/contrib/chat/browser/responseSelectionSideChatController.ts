/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Menu } from '../../../../base/browser/ui/menu/menu.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { clamp } from '../../../../base/common/numbers.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { editorSelectionBackground, editorSelectionForeground } from '../../../../platform/theme/common/colors/editorColors.js';
import { defaultMenuStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { IChatWidget } from '../../../../workbench/contrib/chat/browser/chat.js';
import { FeedbackInputWidget } from '../../agentFeedback/browser/feedbackInputWidget.js';
import { logResponseSelectionWidgetAction, type ResponseSelectionWidgetVariant } from '../../../common/sessionsTelemetry.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ChatInteractivity, IChat, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IResolvedResponseSelection, resolveResponseSelection } from './responseSelectionResolver.js';
import { createAndSendSideChat } from './sideChatOrchestration.js';

/**
 * Name of the CSS custom highlight that stands in for the native selection
 * once the browser collapses it.
 */
const selectionHighlightName = 'chat-response-selection';

export const AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING = 'chat.agentSessions.responseSelectionMenu.enabled';

// Highlight pseudo-elements inherit custom properties from the root element
// only, so they cannot see the `--vscode-*` theme variables (which are scoped
// to `.monaco-workbench`); the color has to be baked into the rule instead.
registerThemingParticipant((theme, collector) => {
	const background = theme.getColor(editorSelectionBackground);
	if (!background) {
		return;
	}
	// High contrast themes select with an opaque background and rely on the
	// paired foreground to keep the text readable.
	const foreground = theme.getColor(editorSelectionForeground);
	collector.addRule(`::highlight(${selectionHighlightName}) {
		background-color: ${background};
		${foreground ? `color: ${foreground};` : ''}
	}`);
});

/**
 * The highlight registry is per-window and shared by every chat view in it, so
 * all controllers contribute ranges to one registered {@link Highlight} rather
 * than overwriting each other's entry.
 */
function getSelectionHighlight(targetWindow: Window & typeof globalThis): Highlight | undefined {
	const registry = targetWindow.CSS?.highlights;
	if (!registry) {
		return undefined; // CSS Custom Highlight API unavailable
	}
	let highlight = registry.get(selectionHighlightName);
	if (!highlight) {
		highlight = new targetWindow.Highlight();
		registry.set(selectionHighlightName, highlight);
	}
	return highlight;
}

/**
 * Bounding box of the range's *visible* line boxes. `Range.getBoundingClientRect`
 * includes the empty box a line selection leaves at the start of the following
 * block, which would push the affordance a line too far down.
 */
function getVisibleBoundingRect(range: Range): { top: number; bottom: number; left: number } | undefined {
	let top = Number.POSITIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	let left = Number.POSITIVE_INFINITY;
	for (const rect of range.getClientRects()) {
		if (rect.width === 0 || rect.height === 0) {
			continue;
		}
		top = Math.min(top, rect.top);
		bottom = Math.max(bottom, rect.bottom);
		left = Math.min(left, rect.left);
	}
	if (bottom === Number.NEGATIVE_INFINITY) {
		const fallback = range.getBoundingClientRect();
		return fallback.width || fallback.height ? fallback : undefined;
	}
	return { top, bottom, left };
}

/**
 * Owns Agents-window actions for text selected within one assistant response.
 * The default is the existing input; the experiment adds an action menu before it.
 */
export class ResponseSelectionSideChatController extends Disposable {

	private readonly _input: FeedbackInputWidget;
	private readonly _menuDomNode: HTMLElement;
	private readonly _menu: Menu;
	private readonly _quoteAction: Action;
	private readonly _chatInteractivity = this._register(new MutableDisposable());
	private _visibleSurface: 'input' | 'menu' | undefined;
	private _visibleVariant: ResponseSelectionWidgetVariant | undefined;
	private _resolved: IResolvedResponseSelection | undefined;
	/** Range currently painted via the CSS custom highlight, if any. */
	private _paintedRange: Range | undefined;
	/** Pins the transcript while a selection or the question input is active. */
	private readonly _autoScrollHold = this._register(new MutableDisposable<IDisposable>());
	private _chat: IChat | undefined;
	/** Bumped on a genuine chat navigation/force-dismiss so a stale submission's completion/error handler can no-op. */
	private _generation = 0;

	constructor(
		private readonly _widget: IChatWidget,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsPartService private readonly _sessionsPartService: ISessionsPartService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._input = this._register(new FeedbackInputWidget({
			placeholder: localize('sessions.selectionSideChat.placeholder', "Ask Question"),
			ariaLabel: localize('sessions.selectionSideChat.ariaLabel', "Ask a question about the selected response text"),
			getMaxContentWidth: () => this._widget.domNode.clientWidth,
			primaryAction: {
				label: localize('sessions.selectionSideChat.ask', "Ask Question"),
				icon: Codicon.arrowUpCompact,
				keybindingLabel: localize('sessions.selectionSideChat.enter', "Enter"),
			},
		}));
		this._widget.domNode.appendChild(this._input.domNode);

		this._menuDomNode = dom.$('.context-view.chat-response-selection-menu');
		this._menuDomNode.style.position = 'absolute';
		this._menuDomNode.style.zIndex = '10000';
		this._menuDomNode.style.display = 'none';
		this._widget.domNode.appendChild(this._menuDomNode);

		const askQuestionAction = this._register(new Action(
			'sessions.responseSelection.askWithBtw',
			localize('sessions.responseSelection.askWithBtw', "Ask with /btw"),
			ThemeIcon.asClassName(Codicon.commentDiscussion),
			true,
			() => this._openQuestionInput(),
		));
		this._quoteAction = this._register(new Action(
			'sessions.responseSelection.quote',
			localize('sessions.responseSelection.quote', "Quote"),
			ThemeIcon.asClassName(Codicon.quote),
			false,
			() => this._quoteSelection(),
		));
		const copyAction = this._register(new Action(
			'sessions.responseSelection.copy',
			localize('sessions.responseSelection.copy', "Copy"),
			ThemeIcon.asClassName(Codicon.copy),
			true,
			() => this._copySelection(),
		));
		this._menu = this._register(new Menu(this._menuDomNode, [
			askQuestionAction,
			this._quoteAction,
			new Separator(),
			copyAction,
		], {
			ariaLabel: localize('sessions.responseSelection.menuAriaLabel', "Selected response text actions"),
		}, defaultMenuStyles));
		this._register(this._menu.onDidCancel(() => this._dismiss()));
		this._register(dom.addStandardDisposableListener(this._menuDomNode, 'mousedown', e => e.preventDefault()));

		this._register(this._input.onDidTriggerPrimary(() => this._submit()));
		this._register(dom.addStandardDisposableListener(this._input.inputElement, 'keydown', e => {
			if (e.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this._dismiss();
				return;
			}
			if (e.keyCode === KeyCode.Enter) {
				if (e.browserEvent.isComposing || e.shiftKey) {
					// Let IME composition finish, or Shift+Enter insert a newline.
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				this._submit();
			}
		}));
		this._register(dom.addStandardDisposableListener(this._input.inputElement, 'keypress', e => {
			e.stopPropagation();
		}));
		this._register(dom.addStandardDisposableListener(this._input.inputElement, 'input', () => {
			this._input.autoSize();
			this._input.updateActionEnabled();
		}));

		const window = dom.getWindow(this._widget.domNode);
		this._register(dom.addDisposableListener(window.document, 'selectionchange', () => this._onSelectionChange()));
		// The transcript is a virtualized list that scrolls by transform, so it
		// never fires a DOM scroll event; follow its own scroll event instead.
		// The capture-phase DOM listener additionally covers nested scrollers
		// (a scrollable code block within a response).
		this._register(this._widget.onDidScroll(() => this._reposition()));
		this._register(dom.addDisposableListener(this._widget.domNode, 'scroll', () => this._reposition(), true));
		this._register(toDisposable(() => this._paintHighlight(undefined)));
	}

	/**
	 * Tracks which chat the current transcript belongs to, for side-chat
	 * creation. `ChatView` re-invokes this for the same chat on unrelated
	 * observable changes, so only force-dismiss on a genuine resource change.
	 */
	setChat(chat: IChat): void {
		const changedChat = !this._chat || this._chat.resource.toString() !== chat.resource.toString();
		this._chat = chat;
		this._chatInteractivity.value = autorun(reader => {
			this._quoteAction.enabled = chat.interactivity.read(reader) === ChatInteractivity.Full;
		});
		if (changedChat) {
			this._dismiss(true);
		}
	}

	private _onSelectionChange(): void {
		// Reflect the new selection state first: every branch below (including
		// the early returns) needs the hold to match what is currently selected.
		this._updateAutoScrollHold();
		// The browser can collapse the document selection when focus moves into
		// the affordance. Keep the captured range until focus genuinely leaves.
		if (this._hasAffordanceFocus()) {
			this._syncHighlight();
			return;
		}
		// A pending submission owns the overlay until the view changes (see
		// `_dismiss`); don't let an incidental selection change reposition or
		// swap the captured selection out from under it.
		if (this._input.isBusy) {
			this._syncHighlight();
			return;
		}
		const resolved = resolveResponseSelection(this._widget);
		if (!resolved) {
			this._dismiss();
			return;
		}
		this._resolved = resolved;
		this._showFor();
	}

	/**
	 * Pins the transcript while the user is working with a selection: a growing
	 * response that scrolls itself to the bottom would otherwise drag the text
	 * out from under the selection (and the affordance anchored to it). Covers
	 * any selection in the transcript, not just ones that resolve to a single
	 * response, since auto-scrolling mid-drag is disruptive either way.
	 */
	private _updateAutoScrollHold(): void {
		const shouldHold = !!this._resolved || this._hasTranscriptSelection();
		if (shouldHold) {
			this._autoScrollHold.value ??= this._widget.holdAutoScroll();
		} else {
			this._autoScrollHold.clear();
		}
	}

	private _hasTranscriptSelection(): boolean {
		const selection = dom.getWindow(this._widget.domNode).getSelection();
		if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) {
			return false;
		}
		const range = selection.getRangeAt(0);
		// Scoped to the transcript specifically: selecting text elsewhere in the
		// chat view (a banner, the input) says nothing about wanting the
		// transcript to hold still.
		return this._widget.transcriptDomNode.contains(range.commonAncestorContainer);
	}

	/**
	 * Keeps the captured selection visible. The native selection disappears as
	 * soon as focus moves into the "Ask Question" input, so a CSS custom
	 * highlight takes over painting the range for as long as the affordance is
	 * open; while the native selection still covers it the browser paints it
	 * and the highlight stays off so the two never stack.
	 */
	private _syncHighlight(): void {
		const range = this._resolved?.range;
		const nativeSelection = dom.getWindow(this._widget.domNode).getSelection();
		const paintedNatively = !!nativeSelection && !nativeSelection.isCollapsed && !!nativeSelection.toString().trim();
		this._paintHighlight(range && !paintedNatively ? range : undefined);
	}

	private _paintHighlight(range: Range | undefined): void {
		if (this._paintedRange === range) {
			return;
		}
		const highlight = getSelectionHighlight(dom.getWindow(this._widget.domNode));
		if (!highlight) {
			return;
		}
		if (this._paintedRange) {
			highlight.delete(this._paintedRange);
		}
		if (range) {
			highlight.add(range);
		}
		this._paintedRange = range;
	}

	private _showFor(): void {
		const wasVisible = this._visibleSurface !== undefined;
		const variant = this._visibleVariant ?? this._getConfiguredVariant();
		this._visibleVariant = variant;
		if (variant === 'actionMenu' && this._visibleSurface !== 'input') {
			this._input.hide();
			this._menuDomNode.style.display = '';
			this._visibleSurface = 'menu';
		} else {
			this._menuDomNode.style.display = 'none';
			this._input.show();
			this._input.autoSize();
			this._input.updateActionEnabled();
			this._visibleSurface = 'input';
		}
		if (!wasVisible) {
			logResponseSelectionWidgetAction(this._telemetryService, variant, 'shown');
		}
		this._syncHighlight();
		this._reposition();
	}

	private _openQuestionInput(): void {
		if (!this._resolved) {
			return;
		}
		logResponseSelectionWidgetAction(this._telemetryService, this._visibleVariant ?? this._getConfiguredVariant(), 'askQuestionOpened');
		this._menuDomNode.style.display = 'none';
		this._input.show();
		this._input.autoSize();
		this._input.updateActionEnabled();
		this._visibleSurface = 'input';
		this._reposition();
		this._input.inputElement.focus();
		this._syncHighlight();
	}

	private _quoteSelection(): void {
		const resolved = this._resolved;
		if (!resolved || this._chat?.interactivity.get() !== ChatInteractivity.Full) {
			return;
		}
		const variant = this._visibleVariant ?? this._getConfiguredVariant();
		const existingInput = this._widget.getInput();
		const separator = existingInput.length > 0 && !existingInput.endsWith('\n') ? '\n' : '';
		logResponseSelectionWidgetAction(this._telemetryService, variant, 'quote');
		this._dismiss();
		this._widget.setInput(`${existingInput}${separator}${formatBlockquote(resolved.text)}`);
		this._widget.focusInput();
		status(localize('sessions.responseSelection.quoted', "Quoted selection inserted."));
	}

	private async _copySelection(): Promise<void> {
		const resolved = this._resolved;
		if (!resolved) {
			return;
		}
		const variant = this._visibleVariant ?? this._getConfiguredVariant();
		logResponseSelectionWidgetAction(this._telemetryService, variant, 'copy');
		this._dismiss();
		try {
			await this._clipboardService.writeText(resolved.text);
			status(localize('sessions.responseSelection.copied', "Selected response text copied."));
		} catch (err) {
			this._logService.error('[responseSelection] Failed to copy selected response text', err);
			this._notificationService.error(localize('sessions.responseSelection.copyFailed', "The selected response text could not be copied."));
		}
	}

	private _getConfiguredVariant(): ResponseSelectionWidgetVariant {
		return this._configurationService.getValue<boolean>(AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING) ? 'actionMenu' : 'askQuestionInput';
	}

	private _hasAffordanceFocus(): boolean {
		return dom.isAncestorOfActiveElement(this._input.domNode) || dom.isAncestorOfActiveElement(this._menuDomNode);
	}

	/**
	 * Re-anchors the affordance to the (live) selection range. Called on every
	 * transcript scroll so the overlay tracks the text it belongs to instead of
	 * staying pinned where the selection used to be.
	 */
	private _reposition(): void {
		const resolved = this._resolved;
		const surface = this._visibleSurface;
		if (!resolved || !surface) {
			return;
		}
		const selectionRect = getVisibleBoundingRect(resolved.range);
		if (!selectionRect) {
			// The transcript is virtualized, so scrolling far enough removes the
			// selected row. Removing a node re-homes any live range onto the
			// surviving parent, collapsing it, so the range still looks attached
			// but no longer covers anything. The anchored text cannot come back
			// — re-rendering builds new nodes — so dismiss rather than leave the
			// input pointing at nothing and the transcript pinned forever.
			this._dismiss();
			return;
		}
		const overlay = surface === 'menu' ? this._menuDomNode : this._input.domNode;
		overlay.style.display = '';

		// The overlay is a child of the widget, so its coordinates are relative
		// to that, but it is confined to the scrollable transcript: once the
		// selection scrolls past an edge the overlay parks at that edge instead
		// of drifting over the chat input or off the window.
		const originRect = this._widget.domNode.getBoundingClientRect();
		const bounds = this._transcriptBounds();
		const gap = 4;
		const overlayWidth = overlay.offsetWidth;
		const overlayHeight = overlay.offsetHeight;

		const minLeft = bounds.left - originRect.left;
		const maxLeft = Math.max(minLeft, minLeft + bounds.width - overlayWidth);
		const left = clamp(selectionRect.left - originRect.left, minLeft, maxLeft);

		const minTop = bounds.top - originRect.top;
		const maxTop = Math.max(minTop, minTop + bounds.height - overlayHeight);
		let top: number;
		if (surface === 'menu') {
			top = selectionRect.top - originRect.top - overlayHeight - gap;
			if (top < minTop) {
				top = selectionRect.bottom - originRect.top + gap;
			}
		} else {
			top = selectionRect.bottom - originRect.top + gap;
			if (top > maxTop) {
				// Not enough room below the selection: prefer placing it above instead.
				const aboveTop = selectionRect.top - originRect.top - overlayHeight - gap;
				top = aboveTop >= minTop ? aboveTop : maxTop;
			}
		}
		top = clamp(top, minTop, maxTop);

		overlay.style.top = `${top}px`;
		overlay.style.left = `${left}px`;
	}

	/**
	 * Box the overlay is confined to, in viewport coordinates: the scrollable
	 * transcript, further clipped to the window so it can never render out of
	 * sight on a small window.
	 */
	private _transcriptBounds(): { top: number; left: number; width: number; height: number } {
		const rect = this._widget.transcriptDomNode.getBoundingClientRect();
		const viewport = dom.getWindow(this._widget.domNode);
		const top = Math.max(rect.top, 0);
		const left = Math.max(rect.left, 0);
		const bottom = Math.min(rect.top + rect.height, viewport.innerHeight);
		const right = Math.min(rect.left + rect.width, viewport.innerWidth);
		return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
	}

	/**
	 * Dismisses the input. While a submission is pending (`_input.isBusy`),
	 * only a genuine view change (`force`, from {@link setChat}) may dismiss
	 * it — outside interactions like Escape or selection invalidation must not
	 * race the in-flight create/open/send.
	 */
	private _dismiss(force = false): void {
		if (!force && this._input.isBusy) {
			return;
		}
		if (force) {
			// A genuine navigation: bump the generation so a stale submission's completion/error handler no-ops.
			this._generation++;
		}
		const hadFocus = this._hasAffordanceFocus();
		this._resolved = undefined;
		this._paintHighlight(undefined);
		this._updateAutoScrollHold();
		this._input.setBusy(false);
		this._input.hide();
		this._menuDomNode.style.display = 'none';
		this._input.clearInput();
		this._visibleSurface = undefined;
		this._visibleVariant = undefined;
		if (hadFocus) {
			// Hiding the focused affordance would otherwise leave focus stranded on
			// the body; return it to the transcript it was invoked from.
			this._widget.focusResponseItem(true);
		}
	}

	private _submit(): void {
		const resolved = this._resolved;
		const chat = this._chat;
		const query = this._input.inputElement.value.trim();
		if (!resolved || !chat || !query || this._input.isBusy) {
			return;
		}
		logResponseSelectionWidgetAction(this._telemetryService, this._visibleVariant ?? this._getConfiguredVariant(), 'askQuestionSubmitted');

		const found = this._sessionsManagementService.getSessionForChatResource(chat.resource);
		if (!found) {
			this._notificationService.warn(localize('sessions.selectionSideChat.sessionUnavailable', "A side chat cannot be created from this conversation."));
			return;
		}
		const { session } = found;
		if (session.status.get() === SessionStatus.Untitled || session.isArchived.get() || !session.capabilities.get().supportsSideChat) {
			this._notificationService.warn(localize('sessions.selectionSideChat.unsupported', "This conversation does not support side chats."));
			return;
		}

		// Keep the overlay visible with a busy state instead of eagerly
		// dismissing: opening the created side chat naturally dismisses it via
		// `setChat`; on failure the question and normal controls are restored
		// below so the user can retry.
		this._input.setBusy(true, localize('sessions.selectionSideChat.busy', "Asking question…"));
		const generation = this._generation;
		createAndSendSideChat(this._sessionsManagementService, this._sessionsService, this._sessionsPartService, session, chat.resource, resolved.response.requestId, { query }, { text: resolved.text })
			.then(() => {
				// A stale completion after a genuine navigation force-dismissed this overlay must no-op.
				if (this._generation !== generation) {
					return;
				}
				// `setChat` (fired by the view change from opening the side
				// chat) normally dismisses this overlay already; clear busy
				// defensively in case that doesn't happen.
				this._input.setBusy(false);
			})
			.catch(err => {
				this._logService.error('[selectionSideChat] Failed to create side chat', err);
				if (this._generation !== generation) {
					return;
				}
				this._notificationService.error(localize('sessions.selectionSideChat.createFailed', "The side chat could not be created."));
				this._input.setBusy(false);
				this._input.inputElement.value = query;
				this._input.autoSize();
				this._input.updateActionEnabled();
				this._input.inputElement.focus();
			});
	}
}

function formatBlockquote(text: string): string {
	return `${text.split('\n').map(line => `> ${line}`).join('\n')}\n\n`;
}
