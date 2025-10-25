/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { FastDomNode, createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { IOverviewRulerLayoutInfo, SmoothScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollableElementChangeOptions, ScrollableElementCreationOptions } from '../../../../base/browser/ui/scrollbar/scrollableElementOptions.js';
import { PartFingerprint, PartFingerprints, ViewPart } from '../../view/viewPart.js';
import { INewScrollPosition, ScrollType } from '../../../common/editorCommon.js';
import { RenderingContext, RestrictedRenderingContext } from '../../view/renderingContext.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import * as viewEvents from '../../../common/viewEvents.js';
import { getThemeTypeSelector } from '../../../../platform/theme/common/themeService.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IMouseWheelEvent } from '../../../../base/browser/mouseEvent.js';

/**
 * The editor scrollbar built on VS Code's scrollable element that sits beside
 * the minimap.
 */
export class EditorScrollbar extends ViewPart {

	private readonly scrollbar: SmoothScrollableElement;
	private readonly scrollbarDomNode: FastDomNode<HTMLElement>;

	constructor(
		context: ViewContext,
		linesContent: FastDomNode<HTMLElement>,
		viewDomNode: FastDomNode<HTMLElement>,
		overflowGuardDomNode: FastDomNode<HTMLElement>
	) {
		super(context);


		const options = this._context.configuration.options;
		const scrollbar = options.get(EditorOption.scrollbar);
		const mouseWheelScrollSensitivity = options.get(EditorOption.mouseWheelScrollSensitivity);
		const fastScrollSensitivity = options.get(EditorOption.fastScrollSensitivity);
		const scrollPredominantAxis = options.get(EditorOption.scrollPredominantAxis);
		const inertialScroll = options.get(EditorOption.inertialScroll);

		const scrollbarOptions: ScrollableElementCreationOptions = {
			listenOnDomNode: viewDomNode.domNode,
			className: 'editor-scrollable' + ' ' + getThemeTypeSelector(context.theme.type),
			useShadows: false,
			lazyRender: true,

			vertical: scrollbar.vertical,
			horizontal: scrollbar.horizontal,
			verticalHasArrows: scrollbar.verticalHasArrows,
			horizontalHasArrows: scrollbar.horizontalHasArrows,
			verticalScrollbarSize: scrollbar.verticalScrollbarSize,
			verticalSliderSize: scrollbar.verticalSliderSize,
			horizontalScrollbarSize: scrollbar.horizontalScrollbarSize,
			horizontalSliderSize: scrollbar.horizontalSliderSize,
			handleMouseWheel: scrollbar.handleMouseWheel,
			alwaysConsumeMouseWheel: scrollbar.alwaysConsumeMouseWheel,
			arrowSize: scrollbar.arrowSize,
			mouseWheelScrollSensitivity: mouseWheelScrollSensitivity,
			fastScrollSensitivity: fastScrollSensitivity,
			scrollPredominantAxis: scrollPredominantAxis,
			scrollByPage: scrollbar.scrollByPage,
			inertialScroll: inertialScroll,
		};

		this.scrollbar = this._register(new SmoothScrollableElement(linesContent.domNode, scrollbarOptions, this._context.viewLayout.getScrollable()));
		PartFingerprints.write(this.scrollbar.getDomNode(), PartFingerprint.ScrollableElement);

		this.scrollbarDomNode = createFastDomNode(this.scrollbar.getDomNode());
		this.scrollbarDomNode.setPosition('absolute');
		this._setLayout();

		// When having a zone widget that calls .focus() on one of its dom elements,
		// the browser will try desperately to reveal that dom node, unexpectedly
		// changing the .scrollTop of this.linesContent

		const onBrowserDesperateReveal = (domNode: HTMLElement, lookAtScrollTop: boolean, lookAtScrollLeft: boolean) => {
			const newScrollPosition: INewScrollPosition = {};

			if (lookAtScrollTop) {
				const deltaTop = domNode.scrollTop;
				if (deltaTop) {
					newScrollPosition.scrollTop = this._context.viewLayout.getCurrentScrollTop() + deltaTop;
					domNode.scrollTop = 0;
				}
			}

			if (lookAtScrollLeft) {
				const deltaLeft = domNode.scrollLeft;
				if (deltaLeft) {
					newScrollPosition.scrollLeft = this._context.viewLayout.getCurrentScrollLeft() + deltaLeft;
					domNode.scrollLeft = 0;
				}
			}

			this._context.viewModel.viewLayout.setScrollPosition(newScrollPosition, ScrollType.Immediate);
		};

		// I've seen this happen both on the view dom node & on the lines content dom node.
		this._register(dom.addDisposableListener(viewDomNode.domNode, 'scroll', (e: Event) => onBrowserDesperateReveal(viewDomNode.domNode, true, true)));
		this._register(dom.addDisposableListener(linesContent.domNode, 'scroll', (e: Event) => onBrowserDesperateReveal(linesContent.domNode, true, false)));
		this._register(dom.addDisposableListener(overflowGuardDomNode.domNode, 'scroll', (e: Event) => onBrowserDesperateReveal(overflowGuardDomNode.domNode, true, false)));
		this._register(dom.addDisposableListener(this.scrollbarDomNode.domNode, 'scroll', (e: Event) => onBrowserDesperateReveal(this.scrollbarDomNode.domNode, true, false)));
	}

	public override dispose(): void {
		super.dispose();
	}

	private _setLayout(): void {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this.scrollbarDomNode.setLeft(layoutInfo.contentLeft);

		const minimap = options.get(EditorOption.minimap);
		const side = minimap.side;
		if (side === 'right') {
			this.scrollbarDomNode.setWidth(layoutInfo.contentWidth + layoutInfo.minimap.minimapWidth);
		} else {
			this.scrollbarDomNode.setWidth(layoutInfo.contentWidth);
		}
		this.scrollbarDomNode.setHeight(layoutInfo.height);
	}

	public getOverviewRulerLayoutInfo(): IOverviewRulerLayoutInfo {
		return this.scrollbar.getOverviewRulerLayoutInfo();
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this.scrollbarDomNode;
	}

	public delegateVerticalScrollbarPointerDown(browserEvent: PointerEvent): void {
		this.scrollbar.delegateVerticalScrollbarPointerDown(browserEvent);
	}

	public delegateScrollFromMouseWheelEvent(browserEvent: IMouseWheelEvent) {
		this.scrollbar.delegateScrollFromMouseWheelEvent(browserEvent);
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (
			e.hasChanged(EditorOption.scrollbar)
			|| e.hasChanged(EditorOption.mouseWheelScrollSensitivity)
			|| e.hasChanged(EditorOption.fastScrollSensitivity)
		) {
			const options = this._context.configuration.options;
			const scrollbar = options.get(EditorOption.scrollbar);
			const mouseWheelScrollSensitivity = options.get(EditorOption.mouseWheelScrollSensitivity);
			const fastScrollSensitivity = options.get(EditorOption.fastScrollSensitivity);
			const scrollPredominantAxis = options.get(EditorOption.scrollPredominantAxis);
			const newOpts: ScrollableElementChangeOptions = {
				vertical: scrollbar.vertical,
				horizontal: scrollbar.horizontal,
				verticalScrollbarSize: scrollbar.verticalScrollbarSize,
				horizontalScrollbarSize: scrollbar.horizontalScrollbarSize,
				scrollByPage: scrollbar.scrollByPage,
				handleMouseWheel: scrollbar.handleMouseWheel,
				mouseWheelScrollSensitivity: mouseWheelScrollSensitivity,
				fastScrollSensitivity: fastScrollSensitivity,
				scrollPredominantAxis: scrollPredominantAxis
			};
			this.scrollbar.updateOptions(newOpts);
		}
		if (e.hasChanged(EditorOption.layoutInfo)) {
			this._setLayout();
		}
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return true;
	}
	public override onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean {
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
