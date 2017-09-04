/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as dom from 'vs/base/browser/dom';
import { ScrollableElementCreationOptions, ScrollableElementChangeOptions } from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';
import { IOverviewRulerLayoutInfo, SmoothScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { INewScrollPosition } from 'vs/editor/common/editorCommon';
import { ViewPart, PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { getThemeTypeSelector } from 'vs/platform/theme/common/themeService';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { ISimplifiedMouseEvent } from 'vs/base/browser/ui/scrollbar/abstractScrollbar';

export class EditorScrollbar extends ViewPart {

	private scrollbar: SmoothScrollableElement;
	private scrollbarDomNode: FastDomNode<HTMLElement>;

	constructor(
		context: ViewContext,
		linesContent: FastDomNode<HTMLElement>,
		viewDomNode: FastDomNode<HTMLElement>,
		overflowGuardDomNode: FastDomNode<HTMLElement>
	) {
		super(context);

		const editor = this._context.configuration.editor;
		const configScrollbarOpts = editor.viewInfo.scrollbar;

		let scrollbarOptions: ScrollableElementCreationOptions = {
			listenOnDomNode: viewDomNode.domNode,
			className: 'editor-scrollable' + ' ' + getThemeTypeSelector(context.theme.type),
			useShadows: false,
			lazyRender: true,

			vertical: configScrollbarOpts.vertical,
			horizontal: configScrollbarOpts.horizontal,
			verticalHasArrows: configScrollbarOpts.verticalHasArrows,
			horizontalHasArrows: configScrollbarOpts.horizontalHasArrows,
			verticalScrollbarSize: configScrollbarOpts.verticalScrollbarSize,
			verticalSliderSize: configScrollbarOpts.verticalSliderSize,
			horizontalScrollbarSize: configScrollbarOpts.horizontalScrollbarSize,
			horizontalSliderSize: configScrollbarOpts.horizontalSliderSize,
			handleMouseWheel: configScrollbarOpts.handleMouseWheel,
			arrowSize: configScrollbarOpts.arrowSize,
			mouseWheelScrollSensitivity: configScrollbarOpts.mouseWheelScrollSensitivity,
		};

		this.scrollbar = this._register(new SmoothScrollableElement(linesContent.domNode, scrollbarOptions, this._context.viewLayout.scrollable));
		PartFingerprints.write(this.scrollbar.getDomNode(), PartFingerprint.ScrollableElement);

		this.scrollbarDomNode = createFastDomNode(this.scrollbar.getDomNode());
		this.scrollbarDomNode.setPosition('absolute');
		this._setLayout();

		// When having a zone widget that calls .focus() on one of its dom elements,
		// the browser will try desperately to reveal that dom node, unexpectedly
		// changing the .scrollTop of this.linesContent

		let onBrowserDesperateReveal = (domNode: HTMLElement, lookAtScrollTop: boolean, lookAtScrollLeft: boolean) => {
			let newScrollPosition: INewScrollPosition = {};

			if (lookAtScrollTop) {
				let deltaTop = domNode.scrollTop;
				if (deltaTop) {
					newScrollPosition.scrollTop = this._context.viewLayout.getCurrentScrollTop() + deltaTop;
					domNode.scrollTop = 0;
				}
			}

			if (lookAtScrollLeft) {
				let deltaLeft = domNode.scrollLeft;
				if (deltaLeft) {
					newScrollPosition.scrollLeft = this._context.viewLayout.getCurrentScrollLeft() + deltaLeft;
					domNode.scrollLeft = 0;
				}
			}

			this._context.viewLayout.setScrollPositionNow(newScrollPosition);
		};

		// I've seen this happen both on the view dom node & on the lines content dom node.
		this._register(dom.addDisposableListener(viewDomNode.domNode, 'scroll', (e: Event) => onBrowserDesperateReveal(viewDomNode.domNode, true, true)));
		this._register(dom.addDisposableListener(linesContent.domNode, 'scroll', (e: Event) => onBrowserDesperateReveal(linesContent.domNode, true, false)));
		this._register(dom.addDisposableListener(overflowGuardDomNode.domNode, 'scroll', (e: Event) => onBrowserDesperateReveal(overflowGuardDomNode.domNode, true, false)));
	}

	public dispose(): void {
		super.dispose();
	}

	private _setLayout(): void {
		const layoutInfo = this._context.configuration.editor.layoutInfo;

		this.scrollbarDomNode.setLeft(layoutInfo.contentLeft);
		this.scrollbarDomNode.setWidth(layoutInfo.contentWidth + layoutInfo.minimapWidth);
		this.scrollbarDomNode.setHeight(layoutInfo.contentHeight);
	}

	public getOverviewRulerLayoutInfo(): IOverviewRulerLayoutInfo {
		return this.scrollbar.getOverviewRulerLayoutInfo();
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this.scrollbarDomNode;
	}

	public delegateVerticalScrollbarMouseDown(browserEvent: IMouseEvent): void {
		this.scrollbar.delegateVerticalScrollbarMouseDown(browserEvent);
	}

	public delegateSliderMouseDown(e: ISimplifiedMouseEvent, onDragFinished: () => void): void {
		this.scrollbar.delegateSliderMouseDown(e, onDragFinished);
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.viewInfo) {
			const editor = this._context.configuration.editor;
			let newOpts: ScrollableElementChangeOptions = {
				handleMouseWheel: editor.viewInfo.scrollbar.handleMouseWheel,
				mouseWheelScrollSensitivity: editor.viewInfo.scrollbar.mouseWheelScrollSensitivity
			};
			this.scrollbar.updateOptions(newOpts);
		}
		if (e.layoutInfo) {
			this._setLayout();
		}
		return true;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return true;
	}
	public onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean {
		this.scrollbar.updateClassName('editor-scrollable' + ' ' + getThemeTypeSelector(this._context.theme.type));
		return true;
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to do
	}

	public render(ctx: RestrictedRenderingContext): void {
		this.scrollbar.renderNow();
	}
}
