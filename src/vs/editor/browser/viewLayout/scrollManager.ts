/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import {IOverviewRulerLayoutInfo, IScrollableElement, IScrollableElementCreationOptions} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {ScrollableElement} from 'vs/base/browser/ui/scrollbar/scrollableElementImpl';
import {EventType, IConfiguration, IConfigurationChangedEvent, IScrollEvent, IViewEventBus} from 'vs/editor/common/editorCommon';
import {EditorScrollable} from 'vs/editor/common/viewLayout/editorScrollable';
import {ClassNames} from 'vs/editor/browser/editorBrowser';

function addPropertyIfPresent(src:any, dst:any, prop:string): void {
	if (src.hasOwnProperty(prop)) {
		dst[prop] = src[prop];
	}
}

export class ScrollManager implements IDisposable {

	private configuration: IConfiguration;
	private privateViewEventBus:IViewEventBus;

	private toDispose:IDisposable[];
	private scrollable: EditorScrollable;
	private linesContent: HTMLElement;
	private scrollbar: IScrollableElement;

	constructor(scrollable:EditorScrollable, configuration:IConfiguration, privateViewEventBus:IViewEventBus, linesContent:HTMLElement, viewDomNode:HTMLElement, overflowGuardDomNode:HTMLElement) {
		this.toDispose = [];
		this.scrollable = scrollable;
		this.configuration = configuration;
		this.privateViewEventBus = privateViewEventBus;
		this.linesContent = linesContent;

		this.toDispose.push(this.scrollable.addScrollListener((e:IScrollEvent) => {
			this.privateViewEventBus.emit(EventType.ViewScrollChanged, e);
		}));

		var configScrollbarOpts = this.configuration.editor.scrollbar;

		var scrollbarOptions:IScrollableElementCreationOptions = {
			scrollable: this.scrollable,
			listenOnDomNode: viewDomNode,
			vertical: configScrollbarOpts.vertical,
			horizontal: configScrollbarOpts.horizontal,
			className: ClassNames.SCROLLABLE_ELEMENT + ' ' + this.configuration.editor.theme,
			useShadows: false,
			saveLastScrollTimeOnClassName: ClassNames.VIEW_LINE
		};
		addPropertyIfPresent(configScrollbarOpts, scrollbarOptions, 'verticalHasArrows');
		addPropertyIfPresent(configScrollbarOpts, scrollbarOptions, 'horizontalHasArrows');
		addPropertyIfPresent(configScrollbarOpts, scrollbarOptions, 'verticalScrollbarSize');
		addPropertyIfPresent(configScrollbarOpts, scrollbarOptions, 'verticalSliderSize');
		addPropertyIfPresent(configScrollbarOpts, scrollbarOptions, 'horizontalScrollbarSize');
		addPropertyIfPresent(configScrollbarOpts, scrollbarOptions, 'horizontalSliderSize');
		addPropertyIfPresent(configScrollbarOpts, scrollbarOptions, 'handleMouseWheel');
		addPropertyIfPresent(configScrollbarOpts, scrollbarOptions, 'arrowSize');
		addPropertyIfPresent(configScrollbarOpts, scrollbarOptions, 'mouseWheelScrollSensitivity');


		this.scrollbar = new ScrollableElement(linesContent, scrollbarOptions, {
			width: this.configuration.editor.layoutInfo.contentWidth,
			height: this.configuration.editor.layoutInfo.contentHeight,
		});
		this.toDispose.push(this.scrollbar);

		this.toDispose.push(this.scrollable.addInternalSizeChangeListener(() => {
			this.scrollbar.onElementInternalDimensions();
		}));
		this.toDispose.push(this.configuration.onDidChange((e:IConfigurationChangedEvent) => {
			this.scrollbar.updateClassName(this.configuration.editor.theme);
			if (e.scrollbar) {
				this.scrollbar.updateOptions(this.configuration.editor.scrollbar);
			}
		}));

		// When having a zone widget that calls .focus() on one of its dom elements,
		// the browser will try desperately to reveal that dom node, unexpectedly
		// changing the .scrollTop of this.linesContent

		var onBrowserDesperateReveal = (domNode:HTMLElement, lookAtScrollTop:boolean, lookAtScrollLeft:boolean) => {
			if (lookAtScrollTop) {
				var deltaTop = domNode.scrollTop;
				if (deltaTop) {
					this.scrollable.setScrollTop(this.scrollable.getScrollTop() + deltaTop);
					domNode.scrollTop = 0;
				}
			}

			if (lookAtScrollLeft) {
				var deltaLeft = domNode.scrollLeft;
				if (deltaLeft) {
					this.scrollable.setScrollLeft(this.scrollable.getScrollLeft() + deltaLeft);
					domNode.scrollLeft = 0;
				}
			}
		};

		// I've seen this happen both on the view dom node & on the lines content dom node.
		this.toDispose.push(dom.addDisposableListener(viewDomNode, 'scroll', (e:Event) => onBrowserDesperateReveal(viewDomNode, true, true)));
		this.toDispose.push(dom.addDisposableListener(linesContent, 'scroll', (e:Event) => onBrowserDesperateReveal(linesContent, true, false)));
		this.toDispose.push(dom.addDisposableListener(overflowGuardDomNode, 'scroll', (e:Event) => onBrowserDesperateReveal(overflowGuardDomNode, true, false)));
	}

	public dispose(): void {
		this.toDispose = disposeAll(this.toDispose);
	}

	public onSizeProviderLayoutChanged(): void {
		if (this.scrollbar) {
			this.scrollbar.onElementDimensions({
				width: this.configuration.editor.layoutInfo.contentWidth,
				height: this.configuration.editor.layoutInfo.contentHeight,
			});
		}
	}

	public getOverviewRulerLayoutInfo(): IOverviewRulerLayoutInfo {
		if (this.scrollbar) {
			return this.scrollbar.getOverviewRulerLayoutInfo();
		}
		return null;
	}

	public getScrollbarContainerDomNode(): HTMLElement {
		if (this.scrollbar) {
			return this.scrollbar.getDomNode();
		}
		return this.linesContent;
	}

	public delegateVerticalScrollbarMouseDown(browserEvent:MouseEvent): void {
		if (this.scrollbar) {
			this.scrollbar.delegateVerticalScrollbarMouseDown(browserEvent);
		}
	}
}
