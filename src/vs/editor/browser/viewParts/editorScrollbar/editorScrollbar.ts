/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { ScrollableElementCreationOptions, ScrollableElementChangeOptions } from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';
import { IOverviewRulerLayoutInfo, ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { IConfiguration, IConfigurationChangedEvent, INewScrollPosition } from 'vs/editor/common/editorCommon';
import { ClassNames } from 'vs/editor/browser/editorBrowser';
import { PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { Scrollable } from 'vs/base/common/scrollable';

function addPropertyIfPresent(src: any, dst: any, prop: string): void {
	if (src.hasOwnProperty(prop)) {
		dst[prop] = src[prop];
	}
}

export class EditorScrollbar implements IDisposable {

	private scrollable: Scrollable;
	private configuration: IConfiguration;

	private toDispose: IDisposable[];
	private linesContent: HTMLElement;
	private scrollbar: ScrollableElement;

	constructor(scrollable: Scrollable, configuration: IConfiguration, linesContent: HTMLElement, viewDomNode: HTMLElement, overflowGuardDomNode: HTMLElement) {
		this.toDispose = [];
		this.scrollable = scrollable;
		this.configuration = configuration;
		this.linesContent = linesContent;

		let configScrollbarOpts = this.configuration.editor.viewInfo.scrollbar;

		let scrollbarOptions: ScrollableElementCreationOptions = {
			canUseTranslate3d: this.configuration.editor.viewInfo.canUseTranslate3d,
			listenOnDomNode: viewDomNode,
			vertical: configScrollbarOpts.vertical,
			horizontal: configScrollbarOpts.horizontal,
			className: ClassNames.SCROLLABLE_ELEMENT + ' ' + this.configuration.editor.viewInfo.theme,
			useShadows: false,
			lazyRender: true,
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

		this.scrollbar = new ScrollableElement(linesContent, scrollbarOptions, this.scrollable);
		PartFingerprints.write(this.scrollbar.getDomNode(), PartFingerprint.ScrollableElement);

		this.toDispose.push(this.scrollbar);

		this.toDispose.push(this.configuration.onDidChange((e: IConfigurationChangedEvent) => {
			this.scrollbar.updateClassName(ClassNames.SCROLLABLE_ELEMENT + ' ' + this.configuration.editor.viewInfo.theme);
			if (e.viewInfo.scrollbar || e.viewInfo.canUseTranslate3d) {
				let newOpts: ScrollableElementChangeOptions = {
					canUseTranslate3d: this.configuration.editor.viewInfo.canUseTranslate3d,
					handleMouseWheel: this.configuration.editor.viewInfo.scrollbar.handleMouseWheel,
					mouseWheelScrollSensitivity: this.configuration.editor.viewInfo.scrollbar.mouseWheelScrollSensitivity
				};
				this.scrollbar.updateOptions(newOpts);
			}
		}));

		// When having a zone widget that calls .focus() on one of its dom elements,
		// the browser will try desperately to reveal that dom node, unexpectedly
		// changing the .scrollTop of this.linesContent

		let onBrowserDesperateReveal = (domNode: HTMLElement, lookAtScrollTop: boolean, lookAtScrollLeft: boolean) => {
			const scrollState = this.scrollable.getState();
			let newScrollPosition: INewScrollPosition = {};

			if (lookAtScrollTop) {
				let deltaTop = domNode.scrollTop;
				if (deltaTop) {
					newScrollPosition.scrollTop = scrollState.scrollTop + deltaTop;
					domNode.scrollTop = 0;
				}
			}

			if (lookAtScrollLeft) {
				let deltaLeft = domNode.scrollLeft;
				if (deltaLeft) {
					newScrollPosition.scrollLeft = scrollState.scrollLeft + deltaLeft;
					domNode.scrollLeft = 0;
				}
			}

			this.scrollable.updateState(newScrollPosition);
		};

		// I've seen this happen both on the view dom node & on the lines content dom node.
		this.toDispose.push(dom.addDisposableListener(viewDomNode, 'scroll', (e: Event) => onBrowserDesperateReveal(viewDomNode, true, true)));
		this.toDispose.push(dom.addDisposableListener(linesContent, 'scroll', (e: Event) => onBrowserDesperateReveal(linesContent, true, false)));
		this.toDispose.push(dom.addDisposableListener(overflowGuardDomNode, 'scroll', (e: Event) => onBrowserDesperateReveal(overflowGuardDomNode, true, false)));
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	public renderScrollbar(): void {
		this.scrollbar.renderNow();
	}

	public getOverviewRulerLayoutInfo(): IOverviewRulerLayoutInfo {
		return this.scrollbar.getOverviewRulerLayoutInfo();
	}

	public getScrollbarContainerDomNode(): HTMLElement {
		return this.scrollbar.getDomNode();
	}

	public delegateVerticalScrollbarMouseDown(browserEvent: MouseEvent): void {
		this.scrollbar.delegateVerticalScrollbarMouseDown(browserEvent);
	}

	public getVerticalSliderVerticalCenter(): number {
		return this.scrollbar.getVerticalSliderVerticalCenter();
	}
}
