/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gotoErrorWidget';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IMarker, MarkerSeverity, IRelatedInformation } from 'vs/platform/markers/common/markers';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/zoneWidget';
import { registerColor, oneOf } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, ITheme } from 'vs/platform/theme/common/themeService';
import { Color } from 'vs/base/common/color';
import { AccessibilitySupport } from 'vs/base/common/platform';
import { editorErrorForeground, editorErrorBorder, editorWarningForeground, editorWarningBorder, editorInfoForeground, editorInfoBorder } from 'vs/editor/common/view/editorColorRegistry';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { getBaseLabel } from 'vs/base/common/labels';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { Event, Emitter } from 'vs/base/common/event';

class MessageWidget {

	lines: number = 0;
	longestLineLength: number = 0;

	private readonly _editor: ICodeEditor;
	private readonly _messageBlock: HTMLSpanElement;
	private readonly _relatedBlock: HTMLSpanElement;
	private readonly _scrollable: ScrollableElement;
	private readonly _relatedDiagnostics = new WeakMap<HTMLElement, IRelatedInformation>();
	private readonly _disposables: IDisposable[] = [];

	constructor(parent: HTMLElement, editor: ICodeEditor, onRelatedInformation: (related: IRelatedInformation) => void, ) {
		this._editor = editor;

		const domNode = document.createElement('div');
		domNode.className = 'descriptioncontainer';
		domNode.setAttribute('aria-live', 'assertive');
		domNode.setAttribute('role', 'alert');

		this._messageBlock = document.createElement('span');
		domNode.appendChild(this._messageBlock);

		this._relatedBlock = document.createElement('div');
		domNode.appendChild(this._relatedBlock);
		this._disposables.push(dom.addStandardDisposableListener(this._relatedBlock, 'click', event => {
			event.preventDefault();
			const related = this._relatedDiagnostics.get(event.target);
			if (related) {
				onRelatedInformation(related);
			}
		}));

		this._scrollable = new ScrollableElement(domNode, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			useShadows: false,
			horizontalScrollbarSize: 3
		});
		dom.addClass(this._scrollable.getDomNode(), 'block');
		parent.appendChild(this._scrollable.getDomNode());
		this._disposables.push(this._scrollable.onScroll(e => domNode.style.left = `-${e.scrollLeft}px`));
		this._disposables.push(this._scrollable);
	}

	dispose(): void {
		dispose(this._disposables);
	}

	update({ source, message, relatedInformation }: IMarker): void {

		if (source) {
			this.lines = 0;
			this.longestLineLength = 0;
			const indent = new Array(source.length + 3 + 1).join(' ');
			const lines = message.split(/\r\n|\r|\n/g);
			for (let i = 0; i < lines.length; i++) {
				let line = lines[i];
				this.lines += 1;
				this.longestLineLength = Math.max(line.length, this.longestLineLength);
				if (i === 0) {
					message = `[${source}] ${line}`;
				} else {
					message += `\n${indent}${line}`;
				}
			}
		} else {
			this.lines = 1;
			this.longestLineLength = message.length;
		}

		dom.clearNode(this._relatedBlock);

		if (!isFalsyOrEmpty(relatedInformation)) {
			this._relatedBlock.style.paddingTop = `${Math.floor(this._editor.getConfiguration().lineHeight * .66)}px`;
			this.lines += 1;

			for (const related of relatedInformation) {

				let container = document.createElement('div');

				let relatedResource = document.createElement('span');
				dom.addClass(relatedResource, 'filename');
				relatedResource.innerHTML = `${getBaseLabel(related.resource)}(${related.startLineNumber}, ${related.startColumn}): `;
				this._relatedDiagnostics.set(relatedResource, related);

				let relatedMessage = document.createElement('span');
				relatedMessage.innerText = related.message;
				this._editor.applyFontInfo(relatedMessage);

				container.appendChild(relatedResource);
				container.appendChild(relatedMessage);

				this.lines += 1;
				this._relatedBlock.appendChild(container);
			}
		}

		this._messageBlock.innerText = message;
		this._editor.applyFontInfo(this._messageBlock);
		const width = Math.floor(this._editor.getConfiguration().fontInfo.typicalFullwidthCharacterWidth * this.longestLineLength);
		this._scrollable.setScrollDimensions({ scrollWidth: width });
	}

	layout(height: number, width: number): void {
		this._scrollable.setScrollDimensions({ width });
	}
}

export class MarkerNavigationWidget extends ZoneWidget {

	private _parentContainer: HTMLElement;
	private _container: HTMLElement;
	private _title: HTMLElement;
	private _message: MessageWidget;
	private _callOnDispose: IDisposable[] = [];
	private _severity: MarkerSeverity;
	private _backgroundColor: Color;
	private _onDidSelectRelatedInformation = new Emitter<IRelatedInformation>();

	readonly onDidSelectRelatedInformation: Event<IRelatedInformation> = this._onDidSelectRelatedInformation.event;

	constructor(
		editor: ICodeEditor,
		private _themeService: IThemeService
	) {
		super(editor, { showArrow: true, showFrame: true, isAccessible: true });
		this._severity = MarkerSeverity.Warning;
		this._backgroundColor = Color.white;

		this._applyTheme(_themeService.getTheme());
		this._callOnDispose.push(_themeService.onThemeChange(this._applyTheme.bind(this)));

		this.create();
	}

	private _applyTheme(theme: ITheme) {
		this._backgroundColor = theme.getColor(editorMarkerNavigationBackground);
		let colorId = editorMarkerNavigationError;
		if (this._severity === MarkerSeverity.Warning) {
			colorId = editorMarkerNavigationWarning;
		} else if (this._severity === MarkerSeverity.Info) {
			colorId = editorMarkerNavigationInfo;
		}
		let frameColor = theme.getColor(colorId);
		this.style({
			arrowColor: frameColor,
			frameColor: frameColor
		}); // style() will trigger _applyStyles
	}

	protected _applyStyles(): void {
		if (this._parentContainer) {
			this._parentContainer.style.backgroundColor = this._backgroundColor.toString();
		}
		super._applyStyles();
	}

	dispose(): void {
		this._callOnDispose = dispose(this._callOnDispose);
		super.dispose();
	}

	focus(): void {
		this._parentContainer.focus();
	}

	protected _fillContainer(container: HTMLElement): void {
		this._parentContainer = container;
		dom.addClass(container, 'marker-widget');
		this._parentContainer.tabIndex = 0;
		this._parentContainer.setAttribute('role', 'tooltip');

		this._container = document.createElement('div');
		container.appendChild(this._container);

		this._title = document.createElement('div');
		this._title.className = 'block title';
		this._container.appendChild(this._title);

		this._message = new MessageWidget(this._container, this.editor, related => this._onDidSelectRelatedInformation.fire(related));
		this._disposables.push(this._message);
	}

	show(where: Position, heightInLines: number): void {
		throw new Error('call showAtMarker');
	}

	showAtMarker(marker: IMarker, markerIdx: number, markerCount: number): void {
		// update:
		// * title
		// * message
		this._container.classList.remove('stale');
		this._title.innerHTML = nls.localize('title.wo_source', "({0}/{1})", markerIdx, markerCount);
		this._message.update(marker);

		// update frame color (only applied on 'show')
		this._severity = marker.severity;
		this._applyTheme(this._themeService.getTheme());

		// show
		let range = Range.lift(marker);
		let position = range.containsPosition(this.editor.getPosition()) ? this.editor.getPosition() : range.getStartPosition();
		super.show(position, this.computeRequiredHeight());

		this.editor.revealPositionInCenter(position, ScrollType.Smooth);

		if (this.editor.getConfiguration().accessibilitySupport !== AccessibilitySupport.Disabled) {
			this.focus();
		}
	}

	updateMarker(marker: IMarker): void {
		this._container.classList.remove('stale');
		this._message.update(marker);
	}

	showStale() {
		this._container.classList.add('stale');
		this._relayout();
	}

	protected _doLayout(heightInPixel: number, widthInPixel: number): void {
		this._message.layout(heightInPixel, widthInPixel);
		this._container.style.height = `${heightInPixel}px`;
	}

	protected _relayout(): void {
		super._relayout(this.computeRequiredHeight());
	}

	private computeRequiredHeight() {
		return 1 + this._message.lines;
	}
}

// theming

let errorDefault = oneOf(editorErrorForeground, editorErrorBorder);
let warningDefault = oneOf(editorWarningForeground, editorWarningBorder);
let infoDefault = oneOf(editorInfoForeground, editorInfoBorder);

export const editorMarkerNavigationError = registerColor('editorMarkerNavigationError.background', { dark: errorDefault, light: errorDefault, hc: errorDefault }, nls.localize('editorMarkerNavigationError', 'Editor marker navigation widget error color.'));
export const editorMarkerNavigationWarning = registerColor('editorMarkerNavigationWarning.background', { dark: warningDefault, light: warningDefault, hc: warningDefault }, nls.localize('editorMarkerNavigationWarning', 'Editor marker navigation widget warning color.'));
export const editorMarkerNavigationInfo = registerColor('editorMarkerNavigationInfo.background', { dark: infoDefault, light: infoDefault, hc: infoDefault }, nls.localize('editorMarkerNavigationInfo', 'Editor marker navigation widget info color.'));
export const editorMarkerNavigationBackground = registerColor('editorMarkerNavigation.background', { dark: '#2D2D30', light: Color.white, hc: '#0C141F' }, nls.localize('editorMarkerNavigationBackground', 'Editor marker navigation widget background.'));
