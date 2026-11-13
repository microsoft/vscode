/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatHostPart.css';
import { $, append, getComputedStyle } from '../../../../base/browser/dom.js';
import { LayoutPriority } from '../../../../base/browser/ui/splitview/splitview.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContentPart } from '../../../services/editor/common/editorGroupsService.js';
import { getFloatingEditorVerticalMargins, getFloatingEditorVerticalOuterEdges, getFloatingPaneCompositeHorizontalMargins, IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { Part } from '../../part.js';

/**
 * The chat part of a window: a part of the workbench grid, beside the editor area, that shows the content a feature gives
 * it, such as an editor part with chats. It knows nothing of that content but its size and its layout. A feature that
 * shows a chat part creates it while the window starts (see `Layout.registerPart`), and hides or shows it through the
 * layout service.
 */
export class ChatHostPart extends Part {

	/** The least width of the part, whatever its content needs less. */
	static readonly MINIMUM_WIDTH = 280;

	override readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	override readonly minimumHeight: number = 0;
	override readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	/** The editor area takes the width a window gains or loses first; the chat part keeps its own. */
	readonly priority = LayoutPriority.Low;

	private _content: IContentPart | undefined;
	private readonly _contentListener = this._register(new MutableDisposable());
	private _contentArea: HTMLElement | undefined;
	private _horizontalMargins = 0;
	private _visible = false;
	/** The widths of the edge of what it shows, read once, until they can change: its content, the theme, or the window's classes change. */
	private _contentEdge: ICardEdge | undefined;

	constructor(
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super(Parts.CHAT_PART, { hasTitle: false }, themeService, storageService, layoutService);
	}

	override get minimumWidth(): number {
		return Math.max(ChatHostPart.MINIMUM_WIDTH, this._content?.minimumWidth ?? 0) + this._horizontalMargins;
	}

	/** Shows `content`, until the returned disposable is disposed; the owner of the content disposes the content. */
	setContent(content: IContentPart): IDisposable {
		// What it showed stops showing: its owner still disposes it, and disposing its handle then leaves this content alone
		const previous = this._content;
		if (previous && previous !== content) {
			(previous.element as HTMLElement).remove();
			previous.setVisible(false);
		}
		this._content = content;
		this._contentEdge = undefined;
		this._contentArea?.appendChild(content.element as HTMLElement);
		this._contentListener.value = content.onDidChange(() => this._onDidChange.fire(undefined));
		content.setVisible(this._visible);
		this.relayoutContent();
		// Its least width follows what it shows: the grid sizes it again
		this._onDidChange.fire(undefined);
		return toDisposable(() => {
			if (this._content === content) {
				this._content = undefined;
				this._contentListener.clear();
				(content.element as HTMLElement).remove();
				this._onDidChange.fire(undefined);
			}
		});
	}

	/** Moves focus into what the part shows. */
	focusContent(): void {
		this._content?.activeGroup.focus();
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		// The edge of what it shows follows the window's classes, such as for Modern UI, floating panels, or their density.
		// The window lays out as they change, before this observer runs: lay out what it shows again, at its new edge
		const classObserver = new MutationObserver(() => {
			this._contentEdge = undefined;
			this.relayoutContent();
		});
		classObserver.observe(this.layoutService.mainContainer, { attributes: true, attributeFilter: ['class'] });
		this._register(toDisposable(() => classObserver.disconnect()));

		this.element = parent;
		this._contentArea = append(parent, $('.content'));
		if (this._content) {
			this._contentArea.appendChild(this._content.element as HTMLElement);
		}
		return this._contentArea;
	}

	override layout(width: number, height: number, top: number, left: number): void {
		super.layout(width, height, top, left);

		// With floating panels the part floats as a card, as the editor beside it does, and reserves the same margins
		let marginLeft = 0, marginRight = 0, marginTop = 0, marginBottom = 0;
		if (this.layoutService.isFloatingPanelsEnabled()) {
			({ left: marginLeft, right: marginRight } = getFloatingPaneCompositeHorizontalMargins(this.layoutService, Parts.CHAT_PART));
			({ top: marginTop, bottom: marginBottom } = getFloatingEditorVerticalMargins(this.layoutService, mainWindow));
		}
		// The edge it shares with the title bar is drawn as the other cards at that edge draw it (chatHostPart.css)
		this.element.classList.toggle('floating-part-outer-top', getFloatingEditorVerticalOuterEdges(this.layoutService).top);
		this.element.style.margin = `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`;
		this.element.style.width = `calc(100% - ${marginLeft + marginRight}px)`;
		this.element.style.height = `calc(100% - ${marginTop + marginBottom}px)`;
		this._horizontalMargins = marginLeft + marginRight;

		// It draws no frame (chatHostPart.css). What it shows draws its own card edge, such as an editor part the editor card's
		// edge (editorBorder.css), inside its box: it lays out within that edge, which the part would clip otherwise
		const edge = this._content ? this._getContentEdge(this._content.element as HTMLElement) : NO_EDGE;
		const contentWidth = Math.max(0, width - marginLeft - marginRight - edge.left - edge.right);
		const contentHeight = Math.max(0, height - marginTop - marginBottom - edge.top - edge.bottom);
		this._content?.layout(contentWidth, contentHeight, top + marginTop + edge.top, left + marginLeft + edge.left);
	}

	override updateStyles(): void {
		super.updateStyles();
		this._contentEdge = undefined;
	}

	private _getContentEdge(element: HTMLElement): ICardEdge {
		if (this._contentEdge) {
			return this._contentEdge;
		}
		const edge = getCardEdge(element);
		// Not yet in the window, it has no styles to read: read them again on the next layout
		if (element.isConnected) {
			this._contentEdge = edge;
		}
		return edge;
	}

	override setVisible(visible: boolean): void {
		this._visible = visible;
		this._content?.setVisible(visible);
		super.setVisible(visible);
	}

	private relayoutContent(): void {
		const dimension = this.dimension;
		const position = this.contentPosition;
		if (dimension && position) {
			this.layout(dimension.width, dimension.height, position.top, position.left);
		}
	}

	toJSON(): object {
		return { type: Parts.CHAT_PART };
	}
}

interface ICardEdge {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

const NO_EDGE: ICardEdge = { top: 0, right: 0, bottom: 0, left: 0 };

/** The widths of the border that `element` draws, as its styles give them. */
function getCardEdge(element: HTMLElement): ICardEdge {
	const style = getComputedStyle(element);
	const width = (value: string) => parseFloat(value) || 0;
	return { top: width(style.borderTopWidth), right: width(style.borderRightWidth), bottom: width(style.borderBottomWidth), left: width(style.borderLeftWidth) };
}
