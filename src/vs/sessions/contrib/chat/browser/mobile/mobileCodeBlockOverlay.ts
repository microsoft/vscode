/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../browser/parts/mobile/contributions/media/mobileOverlayViews.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { generateTokensCSSForColorMap } from '../../../../../editor/common/languages/supports/tokenization.js';
import {
	hasMultipleTokenClasses,
	LANGUAGE_ID_ALIAS,
	regexTokenizeLines,
	tokenizeFileLines,
} from '../../../../browser/parts/mobile/contributions/mobileSyntaxHighlight.js';
import { installPulldownDismiss } from '../../../../browser/parts/mobile/contributions/mobilePulldownDismiss.js';
import { IsPhoneLayoutContext } from '../../../../common/contextkeys.js';

const $ = DOM.$;

/**
 * Command id for opening the {@link MobileCodeBlockOverlay}.
 *
 * Accepts {@link IMobileCodeBlockOverlayData} as the single argument.
 * Phone-only. Mirrors `sessions.mobile.openDiffView` in shape and
 * lifecycle (module-level slot, self-dispose on Back tap).
 */
export const MOBILE_OPEN_CODEBLOCK_OVERLAY_COMMAND_ID = 'sessions.mobile.openCodeBlockOverlay';

/**
 * Data passed to {@link MobileCodeBlockOverlay} when opening the
 * overlay. `code` is the raw text content; `languageId` is the chat
 * code fence's language hint (e.g. `'typescript'`, `'ts'`, `'python'`)
 * — we normalise it against {@link LANGUAGE_ID_ALIAS} before handing
 * off to the tokenizer. `title` overrides the default header label
 * (which is the resolved language id or the localized fallback).
 */
export interface IMobileCodeBlockOverlayData {
	readonly code: string;
	readonly languageId: string | undefined;
	readonly title?: string;
}

/**
 * Full-viewport overlay for a single chat code block on phone-layout
 * viewports.
 *
 * Mirrors the {@link MobileDiffView} pattern — same `mobile-overlay-*`
 * chrome (header with back button + title + trailing action, scrollable
 * body) — but renders a single `<pre>` with Monaco-quality syntax
 * highlighting (or a regex fallback for languages whose TextMate
 * grammar is not loaded in the agents window). Header carries a copy
 * action that writes the raw code to the clipboard and shows a brief
 * "Copied" badge.
 *
 * The header doubles as a pull-down drag handle: dragging it past the
 * commit threshold dismisses the overlay.
 */
export class MobileCodeBlockOverlay extends Disposable {

	private readonly _onDidDispose = this._register(new Emitter<void>());
	/**
	 * Fires when this overlay has been disposed (either externally or
	 * because the user tapped Back). Used by the contribution to clear
	 * its `MutableDisposable<MobileCodeBlockOverlay>` slot so the slot
	 * value tracks "no overlay open" correctly.
	 */
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private readonly viewStore = this._register(new DisposableStore());

	private disposed = false;
	/**
	 * Bumped on every body render so late-arriving `tokenizeFileLines`
	 * promises know to drop their results when the overlay has been
	 * disposed before tokenization finished.
	 */
	private renderGeneration = 0;

	private readonly code: string;
	private readonly resolvedLanguageId: string;
	private readonly displayTitle: string;

	private contentArea!: HTMLElement;
	private copyBadgeEl!: HTMLElement;
	private copyBadgeTimer = this._register(new MutableDisposable());

	constructor(
		workbenchContainer: HTMLElement,
		data: IMobileCodeBlockOverlayData,
		private readonly languageService: ILanguageService,
	) {
		super();

		this.code = data.code;
		this.resolvedLanguageId = this.resolveLanguageId(data.languageId);
		this.displayTitle = data.title ?? (this.resolvedLanguageId !== 'plaintext'
			? this.resolvedLanguageId
			: localize('codeBlockOverlay.defaultTitle', "Code block"));

		this.render(workbenchContainer);
		void this.renderBody();
	}

	private render(workbenchContainer: HTMLElement): void {
		// -- Root overlay -----------------------------------------
		const overlay = DOM.append(workbenchContainer, $('div.mobile-overlay-view'));
		this.viewStore.add(DOM.addDisposableListener(overlay, DOM.EventType.CONTEXT_MENU, e => e.preventDefault()));
		this.viewStore.add(toDisposable(() => overlay.remove()));

		// -- Header -----------------------------------------------
		const header = DOM.append(overlay, $('div.mobile-overlay-header'));

		const backBtn = DOM.append(header, $('button.mobile-overlay-back-btn', { type: 'button' })) as HTMLButtonElement;
		backBtn.setAttribute('aria-label', localize('codeBlockOverlay.back', "Back"));
		DOM.append(backBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronLeft));
		DOM.append(backBtn, $('span.back-btn-label')).textContent = localize('codeBlockOverlay.backLabel', "Back");
		this.viewStore.add(Gesture.addTarget(backBtn));
		this.viewStore.add(DOM.addDisposableListener(backBtn, DOM.EventType.CLICK, () => this.dispose()));
		this.viewStore.add(DOM.addDisposableListener(backBtn, TouchEventType.Tap, () => this.dispose()));

		const info = DOM.append(header, $('div.mobile-overlay-header-info'));
		DOM.append(info, $('div.mobile-overlay-header-title')).textContent = this.displayTitle;

		// Copy action sits on the trailing edge of the header. The
		// "Copied" badge is mounted alongside the button and toggled
		// visible for ~1.5s on successful copy. Both controls live in
		// the same flex slot so the badge appears in-place when shown.
		const trailing = DOM.append(header, $('div.mobile-codeblock-overlay-header-trailing'));

		this.copyBadgeEl = DOM.append(trailing, $('span.mobile-codeblock-overlay-copied-badge'));
		this.copyBadgeEl.textContent = localize('codeBlockOverlay.copied', "Copied");
		this.copyBadgeEl.style.display = 'none';
		this.copyBadgeEl.setAttribute('aria-live', 'polite');

		const copyBtn = DOM.append(trailing, $('button.mobile-codeblock-overlay-copy-btn', { type: 'button' })) as HTMLButtonElement;
		copyBtn.setAttribute('aria-label', localize('codeBlockOverlay.copyAria', "Copy code"));
		DOM.append(copyBtn, $('span')).classList.add(...ThemeIcon.asClassNameArray(Codicon.copy));
		DOM.append(copyBtn, $('span.copy-btn-label')).textContent = localize('codeBlockOverlay.copyLabel', "Copy");
		this.viewStore.add(Gesture.addTarget(copyBtn));
		const onCopy = () => this.copyToClipboard();
		this.viewStore.add(DOM.addDisposableListener(copyBtn, DOM.EventType.CLICK, onCopy));
		this.viewStore.add(DOM.addDisposableListener(copyBtn, TouchEventType.Tap, onCopy));

		// -- Body -------------------------------------------------
		const body = DOM.append(overlay, $('div.mobile-overlay-body'));
		const scrollWrapper = DOM.append(body, $('div.mobile-overlay-scroll'));
		this.contentArea = DOM.append(scrollWrapper, $('pre.mobile-codeblock-overlay-pre'));

		// Pull-down dismiss on the header drag handle. Back- and copy-
		// button taps still work normally — only downward drags past a
		// small dead zone are claimed by the gesture.
		this.viewStore.add(installPulldownDismiss(overlay, header, () => this.dispose()));
	}

	private async renderBody(): Promise<void> {
		this.renderGeneration++;
		const generation = this.renderGeneration;

		// Show plain text immediately so the user sees content while
		// the async tokenizer warms up. Tokenized HTML replaces this
		// once `tokenizeFileLines` resolves.
		this.contentArea.textContent = this.code;

		const tokenized = await tokenizeFileLines(this.languageService, this.code, this.resolvedLanguageId);
		if (this.disposed || generation !== this.renderGeneration) {
			return;
		}

		// Real tokenization produces multiple distinct mtk* classes; if
		// every non-empty line collapses to `mtk1`, the grammar is not
		// loaded and we fall back to the regex tokenizer that emits
		// `mobile-diff-tok-*` classes (themed in mobileOverlayViews.css).
		const hasRealTokens = hasMultipleTokenClasses(tokenized);
		const lines = hasRealTokens ? tokenized : regexTokenizeLines(this.code, this.resolvedLanguageId);

		// Inject a per-overlay <style> block carrying the Monaco token
		// colour-map so `mtkN` classes resolve to colours. Not needed
		// for the regex fallback (which uses themed CSS classes), but
		// we still nest the style element inside the content area so
		// it's torn down when the overlay is disposed.
		DOM.clearNode(this.contentArea);
		if (hasRealTokens) {
			const colorMap = TokenizationRegistry.getColorMap();
			if (colorMap) {
				const styleEl = document.createElement('style');
				styleEl.textContent = generateTokensCSSForColorMap(colorMap);
				this.contentArea.appendChild(styleEl);
			}
		}

		const code = DOM.append(this.contentArea, $('code.mobile-codeblock-overlay-code'));
		// Newline-join the per-line HTML — `<pre>` preserves the breaks
		// in the rendered text without needing per-line wrapper divs.
		code.innerHTML = lines.join('\n');
	}

	private resolveLanguageId(raw: string | undefined): string {
		if (!raw) {
			return 'plaintext';
		}
		const normalized = raw.toLowerCase().trim();
		if (!normalized) {
			return 'plaintext';
		}
		// Aliases (`ts`, `py`, `sh`) map to the canonical id used by
		// both the TextMate grammar registry and the regex fallback's
		// lang-family table.
		const aliased = LANGUAGE_ID_ALIAS[normalized] ?? normalized;
		if (this.languageService.isRegisteredLanguageId(aliased)) {
			return aliased;
		}
		// Case-insensitive name lookup (`JavaScript` → `javascript`).
		const byName = this.languageService.getLanguageIdByLanguageName(aliased);
		if (byName) {
			return byName;
		}
		// Unknown id — pass through to the regex fallback. The
		// tokenizer's `LANG_FAMILY` table will pick this up if it's a
		// known family; otherwise it falls back to `'generic'`.
		return aliased;
	}

	private async copyToClipboard(): Promise<void> {
		// Prefer `navigator.clipboard.writeText` on browsers that grant
		// the permission in this context; fall back to a transient
		// textarea + `execCommand('copy')` for older / restricted
		// environments. The fallback mirrors the workbench
		// `BrowserClipboardService` behaviour without pulling that
		// service in for a single string write.
		let ok = false;
		try {
			await navigator.clipboard.writeText(this.code);
			ok = true;
		} catch {
			ok = this.copyViaExecCommand();
		}
		if (ok) {
			this.showCopiedBadge();
		}
	}

	private copyViaExecCommand(): boolean {
		const activeDocument = this.contentArea.ownerDocument ?? document;
		const textArea = activeDocument.createElement('textarea');
		// Off-screen but still in the DOM so `select()` works.
		textArea.style.position = 'fixed';
		textArea.style.top = '0';
		textArea.style.left = '0';
		textArea.style.width = '1px';
		textArea.style.height = '1px';
		textArea.style.opacity = '0';
		textArea.style.pointerEvents = 'none';
		textArea.setAttribute('aria-hidden', 'true');
		textArea.value = this.code;
		activeDocument.body.appendChild(textArea);
		try {
			textArea.select();
			return activeDocument.execCommand('copy');
		} catch {
			return false;
		} finally {
			textArea.remove();
		}
	}

	private showCopiedBadge(): void {
		this.copyBadgeEl.style.display = '';
		const handle = setTimeout(() => {
			if (this.disposed) {
				return;
			}
			this.copyBadgeEl.style.display = 'none';
		}, 1500);
		this.copyBadgeTimer.value = toDisposable(() => clearTimeout(handle));
	}

	override dispose(): void {
		this.disposed = true;
		// Notify external slot-holders before any registered disposables
		// (including the emitter itself) get torn down by `super.dispose()`.
		this._onDidDispose.fire();
		this.viewStore.dispose();
		super.dispose();
	}
}

/**
 * Opens a {@link MobileCodeBlockOverlay} for the given code block.
 * Returns the overlay instance; dispose it to close.
 */
export function openMobileCodeBlockOverlay(
	container: HTMLElement,
	data: IMobileCodeBlockOverlayData,
	languageService: ILanguageService,
): MobileCodeBlockOverlay {
	return new MobileCodeBlockOverlay(container, data, languageService);
}

// -- Command registration -----------------------------------------------------

// Module-level slot for the active overlay so a re-invocation of the
// command (e.g. a stray double-tap on the expand affordance) closes the
// prior overlay before opening a new one. The overlay self-disposes
// when the user taps Back; we listen for `onDidDispose` to clear the
// slot so `MutableDisposable.value === undefined` correctly tracks
// "no overlay open" and stale references are never kept around.
const activeOverlay = new MutableDisposable<MobileCodeBlockOverlay>();

class MobileOpenCodeBlockOverlayAction extends Action2 {
	constructor() {
		super({
			id: MOBILE_OPEN_CODEBLOCK_OVERLAY_COMMAND_ID,
			title: localize2('mobileOpenCodeBlock', 'Open Code Block'),
			precondition: IsPhoneLayoutContext,
			f1: false,
		});
	}

	run(accessor: ServicesAccessor, data: IMobileCodeBlockOverlayData): void {
		if (!data || typeof data.code !== 'string') {
			return;
		}
		const layoutService = accessor.get(ILayoutService);
		const languageService = accessor.get(ILanguageService);

		activeOverlay.value = openMobileCodeBlockOverlay(layoutService.mainContainer, data, languageService);
		// Clear the slot when the overlay tears itself down (back tap)
		// so the slot value tracks "no overlay open" correctly. The
		// equality guard ensures a newer overlay that has already
		// replaced `value` doesn't get stomped on by the prior
		// overlay's `onDidDispose` firing late.
		const view = activeOverlay.value;
		Event.once(view.onDidDispose)(() => {
			if (activeOverlay.value === view) {
				activeOverlay.clear();
			}
		});
	}
}

registerAction2(MobileOpenCodeBlockOverlayAction);
