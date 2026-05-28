/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { localize } from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { observableContextKey } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IChatInlineAnchorPeekTarget, IChatInlineAnchorPhonePresenter, IChatInlineAnchorPhonePresenterImpl } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatInlineAnchorPhonePresenter.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { IMobileContentSheetApi, showMobileContentSheet } from '../../../../browser/parts/mobile/mobilePickerSheet.js';

const $ = DOM.$;

/**
 * Maximum number of context lines shown around the anchor's range
 * inside the peek sheet. Keeps the snippet readable on a phone screen
 * without forcing a giant scroll surface.
 */
const PEEK_CONTEXT_LINES = 3;

/**
 * Hard cap on the snippet length read from the file. Anchors usually
 * point at a single function or a few-line region, but we guard
 * against pathological cases (e.g. a one-line minified file) so the
 * sheet body never grows unbounded.
 */
const PEEK_MAX_SNIPPET_CHARS = 4_000;

/**
 * Sessions-side implementation of {@link IChatInlineAnchorPhonePresenter}.
 *
 * On phone-layout viewports of the agents window, intercepts taps on
 * inline file/symbol anchors (rendered by `InlineAnchorWidget` inside
 * chat markdown) and surfaces a bottom-sheet "peek" of the target:
 * the resource path, its language label, an optional snippet preview
 * read via {@link ITextFileService}, and quick actions to open the
 * file in the editor or copy a link to it. Workbench code does not
 * depend on the sheet primitive: it only sees the
 * {@link IChatInlineAnchorPhonePresenter} decorator interface, so this
 * wiring stays out of the workbench layer.
 */
class MobileInlineAnchorPeekPresenter extends Disposable implements IChatInlineAnchorPhonePresenterImpl {

	readonly enabled: IObservable<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IEditorService private readonly _editorService: IEditorService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ILabelService private readonly _labelService: ILabelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();

		// Track the phone-layout context key (`sessionsIsPhoneLayout`)
		// so the inline-anchor click handler re-evaluates `enabled`
		// the moment the viewport crosses the phone breakpoint. This
		// key is the source of truth for "is this viewport
		// phone-classified" — the layout policy updates it through the
		// workbench's main `layout()` pass.
		const isPhoneCtx = observableContextKey<boolean>('sessionsIsPhoneLayout', contextKeyService);
		this.enabled = derived(this, reader => isPhoneCtx.read(reader) === true);
	}

	async showAnchorPeek(anchor: IChatInlineAnchorPeekTarget): Promise<void> {
		// Read the snippet asynchronously BEFORE opening the sheet so
		// we don't show an empty placeholder while the file load is in
		// flight. If the read fails (binary, scheme without provider,
		// permissions error, …) we just skip the preview and keep the
		// path / language header + action buttons.
		const snippet = await this._tryReadSnippet(anchor);

		await showMobileContentSheet(
			this._layoutService.mainContainer,
			anchor.symbolName ?? this._labelService.getUriBasenameLabel(anchor.uri),
			(bodyContainer, api) => this._renderBody(bodyContainer, api, anchor, snippet),
			{
				caption: this._labelService.getUriLabel(anchor.uri, { relative: true }),
			},
		);
	}

	private _renderBody(
		bodyContainer: HTMLElement,
		api: IMobileContentSheetApi,
		anchor: IChatInlineAnchorPeekTarget,
		snippet: IAnchorSnippet | undefined,
	): IDisposable {
		const store = new DisposableStore();
		const root = DOM.append(bodyContainer, $('div.mobile-inline-anchor-peek'));

		// -- Metadata header ------------------------------------------
		// File path (full fsPath when available, otherwise the URI's
		// label) plus the resolved language id. Both rows are
		// selectable so the user can long-press to copy on iOS.
		const meta = DOM.append(root, $('div.mobile-inline-anchor-peek-meta'));

		const pathRow = DOM.append(meta, $('div.mobile-inline-anchor-peek-row'));
		DOM.append(pathRow, $('span.mobile-inline-anchor-peek-row-label')).textContent = localize('mobileInlineAnchorPeek.path', "Path");
		const pathValue = DOM.append(pathRow, $('span.mobile-inline-anchor-peek-row-value'));
		pathValue.textContent = this._formatPath(anchor);

		const languageRow = DOM.append(meta, $('div.mobile-inline-anchor-peek-row'));
		DOM.append(languageRow, $('span.mobile-inline-anchor-peek-row-label')).textContent = localize('mobileInlineAnchorPeek.language', "Language");
		DOM.append(languageRow, $('span.mobile-inline-anchor-peek-row-value')).textContent = this._resolveLanguageLabel(anchor);

		if (anchor.range) {
			const rangeRow = DOM.append(meta, $('div.mobile-inline-anchor-peek-row'));
			DOM.append(rangeRow, $('span.mobile-inline-anchor-peek-row-label')).textContent = localize('mobileInlineAnchorPeek.range', "Range");
			const rangeValue = DOM.append(rangeRow, $('span.mobile-inline-anchor-peek-row-value'));
			rangeValue.textContent = this._formatRange(anchor);
		}

		// -- Snippet preview ------------------------------------------
		if (snippet) {
			const snippetWrap = DOM.append(root, $('div.mobile-inline-anchor-peek-snippet'));
			snippetWrap.setAttribute('aria-label', localize('mobileInlineAnchorPeek.snippet', "Preview"));
			const pre = DOM.append(snippetWrap, $('pre.mobile-inline-anchor-peek-code'));
			pre.textContent = snippet.text;
			if (snippet.startLine > 1 || snippet.truncated) {
				const hint = DOM.append(snippetWrap, $('div.mobile-inline-anchor-peek-snippet-hint'));
				hint.textContent = snippet.truncated
					? localize('mobileInlineAnchorPeek.snippetTruncatedFrom', "Lines {0}+ (truncated)", snippet.startLine)
					: localize('mobileInlineAnchorPeek.snippetFrom', "Starting at line {0}", snippet.startLine);
			}
		}

		// -- Action row -----------------------------------------------
		const actions = DOM.append(root, $('div.mobile-inline-anchor-peek-actions'));

		const openButton = this._createActionButton(
			actions,
			Codicon.goToFile,
			localize('mobileInlineAnchorPeek.openInEditor', "Open in Editor"),
		);
		store.add(DOM.addDisposableListener(openButton, 'click', e => {
			e.preventDefault();
			api.close();
			void this._openInEditor(anchor);
		}));

		const copyButton = this._createActionButton(
			actions,
			Codicon.copy,
			localize('mobileInlineAnchorPeek.copyLink', "Copy Link"),
		);
		store.add(DOM.addDisposableListener(copyButton, 'click', e => {
			e.preventDefault();
			void this._copyLink(anchor);
			api.close();
		}));

		return store;
	}

	private _createActionButton(parent: HTMLElement, icon: ThemeIcon, label: string): HTMLButtonElement {
		const button = DOM.append(parent, $('button.mobile-inline-anchor-peek-action', { type: 'button' })) as HTMLButtonElement;
		button.setAttribute('aria-label', label);
		const iconHost = DOM.append(button, $('span.mobile-inline-anchor-peek-action-icon'));
		iconHost.classList.add(...ThemeIcon.asClassNameArray(icon));
		DOM.append(button, $('span.mobile-inline-anchor-peek-action-label')).textContent = label;
		return button;
	}

	private _formatPath(anchor: IChatInlineAnchorPeekTarget): string {
		// Prefer the full fsPath for local resources (gives the user
		// the most context on iOS Files-style mental models); fall
		// back to the URI's friendly label for non-file schemes.
		if (anchor.uri.scheme === 'file') {
			return anchor.uri.fsPath;
		}
		return this._labelService.getUriLabel(anchor.uri);
	}

	private _formatRange(anchor: IChatInlineAnchorPeekTarget): string {
		const range = anchor.range!;
		if (range.startLineNumber === range.endLineNumber) {
			return localize('mobileInlineAnchorPeek.singleLine', "Line {0}", range.startLineNumber);
		}
		return localize('mobileInlineAnchorPeek.multiLine', "Lines {0}-{1}", range.startLineNumber, range.endLineNumber);
	}

	private _resolveLanguageLabel(anchor: IChatInlineAnchorPeekTarget): string {
		const languageId = this._languageService.guessLanguageIdByFilepathOrFirstLine(anchor.uri);
		if (!languageId) {
			return localize('mobileInlineAnchorPeek.languageUnknown', "Plain Text");
		}
		return this._languageService.getLanguageName(languageId) ?? languageId;
	}

	private async _tryReadSnippet(anchor: IChatInlineAnchorPeekTarget): Promise<IAnchorSnippet | undefined> {
		try {
			const content = await this._textFileService.read(anchor.uri, { acceptTextOnly: true });
			const lines = content.value.split(/\r?\n/);
			if (lines.length === 0) {
				return undefined;
			}

			let startLine: number;
			let endLine: number;
			if (anchor.range) {
				startLine = Math.max(1, anchor.range.startLineNumber - PEEK_CONTEXT_LINES);
				endLine = Math.min(lines.length, anchor.range.endLineNumber + PEEK_CONTEXT_LINES);
			} else {
				// No range — show the first chunk of the file so the
				// user gets a sense of what the file holds.
				startLine = 1;
				endLine = Math.min(lines.length, 2 * PEEK_CONTEXT_LINES + 1);
			}

			let snippetText = lines.slice(startLine - 1, endLine).join('\n');
			let truncated = false;
			if (snippetText.length > PEEK_MAX_SNIPPET_CHARS) {
				snippetText = snippetText.slice(0, PEEK_MAX_SNIPPET_CHARS);
				truncated = true;
			}

			return { text: snippetText, startLine, truncated };
		} catch {
			return undefined;
		}
	}

	private async _openInEditor(anchor: IChatInlineAnchorPeekTarget): Promise<void> {
		try {
			await this._editorService.openEditor({
				resource: anchor.uri,
				options: anchor.range
					? { selection: anchor.range, pinned: true }
					: { pinned: true },
			});
		} catch (err) {
			this._notificationService.warn(localize('mobileInlineAnchorPeek.openError', "Could not open file: {0}", err instanceof Error ? err.message : String(err)));
		}
	}

	private async _copyLink(anchor: IChatInlineAnchorPeekTarget): Promise<void> {
		// Web clipboard support is limited — `writeResources` typically
		// no-ops in browsers and `writeText` is the only universally
		// available primitive. Write the formatted string so a plain
		// paste into another app (Notes, Mail, …) lands the
		// human-readable label. We do not also call `writeResources`
		// because on iOS Safari calling it after `writeText` clears
		// the pasteboard.
		try {
			const text = anchor.uri.scheme === 'file' ? anchor.uri.fsPath : anchor.uri.toString();
			await this._clipboardService.writeText(text);
		} catch (err) {
			this._notificationService.warn(localize('mobileInlineAnchorPeek.copyError', "Could not copy link: {0}", err instanceof Error ? err.message : String(err)));
		}
	}
}

interface IAnchorSnippet {
	readonly text: string;
	readonly startLine: number;
	readonly truncated: boolean;
}

class MobileInlineAnchorPeekContribution extends Disposable implements IWorkbenchContribution {

	private readonly _registration = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@IChatInlineAnchorPhonePresenter presenter: IChatInlineAnchorPhonePresenter,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const impl = this._register(instantiationService.createInstance(MobileInlineAnchorPeekPresenter));

		// Keep the registration mounted for the lifetime of the
		// contribution. The workbench presenter's `enabled` observable
		// already gates the actual peek sheet path on phone layout,
		// so no dynamic mount/unmount is needed here.
		this._registration.value = presenter.setImpl(impl);
	}
}

registerWorkbenchContribution2(
	'mobileInlineAnchorPeek',
	MobileInlineAnchorPeekContribution,
	WorkbenchPhase.BlockStartup,
);
