/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { HoverStyle } from '../../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../../base/browser/ui/hover/hoverWidget.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { FileKind } from '../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IOpenEditorOptions, registerOpenEditorListeners } from '../../../../../../platform/editor/browser/editor.js';
import './media/chatCodeBlockPill.css';

const $ = dom.$;

/**
 * The shared DOM + styling for a "code block pill" — the small chip rendered in
 * chat output that announces a file edit (e.g. "file.ts Edited +5 -2").
 *
 * This class is intentionally agnostic of where the diff information comes
 * from. Subclasses or callers feed in URI, status icon/label, +/- counts, and
 * an optional progress percentage. Two consumers exist today:
 *
 * - {@link CollapsedCodeBlock} (chat editing pipeline) wires the pill to an
 *   {@link IChatEditingSession} so the status and diff update as edits stream
 *   in.
 * - {@link ChatExternalEditContentPart} (agent host pipeline) renders a static
 *   pill from data already provided by the agent host.
 */
export class ChatEditPillElement extends Disposable {

	readonly element: HTMLElement;
	protected readonly pillElement: HTMLElement;
	protected readonly statusIndicatorContainer: HTMLElement;
	protected readonly statusIconEl: HTMLElement;
	protected readonly statusLabelEl: HTMLElement;
	protected readonly progressFillEl: HTMLElement;
	protected readonly fileIconEl: HTMLElement;
	protected readonly fileIconLabelEl: HTMLElement;
	protected readonly labelDetailEl: HTMLElement;

	private readonly _hover = this._register(new MutableDisposable());
	private _tooltip: string | undefined;

	private _uri: URI | undefined;
	get uri(): URI | undefined { return this._uri; }

	private _statusIconClasses: string[] = [];
	private _pillIconClasses: string[] = [];

	private _labelAddedEl: HTMLElement | undefined;
	private _labelRemovedEl: HTMLElement | undefined;

	private readonly _onDidClick = this._register(new Emitter<IOpenEditorOptions>());
	/** Fires when the pill is activated (click / keyboard). Carries the standard open-editor options. */
	readonly onDidClick: Event<IOpenEditorOptions> = this._onDidClick.event;

	private readonly _onDidContextMenu = this._register(new Emitter<StandardMouseEvent>());
	/** Fires on right-click. Subclasses can present a context menu. */
	readonly onDidContextMenu: Event<StandardMouseEvent> = this._onDidContextMenu.event;

	constructor(
		@ILabelService protected readonly labelService: ILabelService,
		@IModelService protected readonly modelService: IModelService,
		@ILanguageService protected readonly languageService: ILanguageService,
		@IHoverService protected readonly hoverService: IHoverService,
	) {
		super();

		this.element = $('div.chat-codeblock-pill-container');

		this.statusIndicatorContainer = $('div.status-indicator-container');
		this.statusIconEl = $('span.status-icon');
		this.statusLabelEl = $('span.status-label', {}, '');
		this.statusIndicatorContainer.append(this.statusIconEl, this.statusLabelEl);

		this.pillElement = $('.chat-codeblock-pill-widget');
		this.pillElement.tabIndex = 0;
		this.pillElement.classList.add('show-file-icons');
		this.pillElement.role = 'button';
		this.progressFillEl = $('span.progress-fill');
		this.fileIconEl = $('span.icon');
		this.fileIconLabelEl = $('span.icon-label', {}, '');
		this.labelDetailEl = $('span.label-detail', {}, '');
		this.pillElement.append(this.progressFillEl, this.fileIconEl, this.fileIconLabelEl, this.labelDetailEl);

		this.element.append(this.statusIndicatorContainer, this.pillElement);

		this._register(registerOpenEditorListeners(this.pillElement, opts => this._onDidClick.fire(opts)));
		this._register(dom.addDisposableListener(this.pillElement, dom.EventType.CONTEXT_MENU, e => {
			const event = new StandardMouseEvent(dom.getWindow(e), e);
			dom.EventHelper.stop(e, true);
			this._onDidContextMenu.fire(event);
		}));
	}

	/**
	 * Renders or updates the file icon + name. Call this whenever the URI
	 * changes; also resets the +added / -removed counters since they no
	 * longer apply to the previous file.
	 */
	setUri(uri: URI): void {
		this._uri = uri;
		const iconText = this.labelService.getUriBasenameLabel(uri);
		this.fileIconLabelEl.textContent = iconText;
		const fileKind = uri.path.endsWith('/') ? FileKind.FOLDER : FileKind.FILE;
		this.fileIconEl.classList.remove(...this._pillIconClasses);
		this._pillIconClasses = getIconClasses(this.modelService, this.languageService, uri, fileKind);
		this.fileIconEl.classList.add(...this._pillIconClasses);
		this.setTooltip(this.labelService.getUriLabel(uri, { relative: true }));
	}

	/**
	 * Updates the leading status indicator (icon + textual label). Pass
	 * `undefined` to clear the icon.
	 */
	setStatus(icon: ThemeIcon | undefined, label: string): void {
		this.statusIconEl.classList.remove(...this._statusIconClasses);
		this._statusIconClasses = icon ? ThemeIcon.asClassNameArray(icon) : [];
		if (this._statusIconClasses.length > 0) {
			this.statusIconEl.classList.add(...this._statusIconClasses);
		}
		this.statusLabelEl.textContent = label;
	}

	/**
	 * Sets the trailing detail label (e.g. "Generating edits...", "(35%)").
	 * Pass an empty string to clear.
	 */
	setLabelDetail(text: string): void {
		this.labelDetailEl.textContent = text;
	}

	/**
	 * Renders the progress-fill animation behind the pill. `percent` is in
	 * the range [0, 100]. Pass `undefined` (or omit) to clear.
	 */
	setProgressFill(percent: number | undefined): void {
		if (typeof percent === 'number') {
			this.progressFillEl.style.width = `${percent}%`;
			this.pillElement.classList.add('progress-filling');
		} else {
			this.progressFillEl.style.width = '0%';
			this.pillElement.classList.remove('progress-filling');
		}
	}

	/**
	 * Renders the +added / -removed counters at the trailing end of the pill
	 * and sets the aria label to a localized summary. Pass `undefined` to
	 * hide the counters.
	 */
	setDiff(diff: { added: number; removed: number } | undefined): void {
		if (!diff) {
			this._labelAddedEl?.remove();
			this._labelRemovedEl?.remove();
			this._labelAddedEl = undefined;
			this._labelRemovedEl = undefined;
			return;
		}
		if (!this._labelAddedEl) {
			this._labelAddedEl = this.pillElement.appendChild($('span.label-added'));
		}
		if (!this._labelRemovedEl) {
			this._labelRemovedEl = this.pillElement.appendChild($('span.label-removed'));
		}
		this._labelAddedEl.textContent = `+${diff.added}`;
		this._labelRemovedEl.textContent = `-${diff.removed}`;
	}

	/**
	 * Sets the screen-reader announcement for the pill.
	 */
	setAriaLabel(label: string): void {
		this.element.ariaLabel = label;
	}

	/**
	 * Sets the delayed hover tooltip text. Re-using the existing hover binding
	 * so subsequent calls just swap the displayed text.
	 */
	setTooltip(tooltip: string): void {
		this._tooltip = tooltip;
		if (!this._hover.value) {
			this._hover.value = this.hoverService.setupDelayedHover(this.pillElement, () => ({
				content: this._tooltip!,
				style: HoverStyle.Pointer,
				position: { hoverPosition: HoverPosition.BELOW },
				persistence: { hideOnKeyDown: true },
			}));
		}
	}
}
