/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { Color } from '../../../../base/common/color.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { splitLines } from '../../../../base/common/strings.js';
import './media/gotoErrorWidget.css';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { ScrollType } from '../../../common/editorCommon.js';
import { peekViewTitleForeground, peekViewTitleInfoForeground, PeekViewWidget } from '../../peekView/browser/peekView.js';
import * as nls from '../../../../nls.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IMarker, IRelatedInformation, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { SeverityIcon } from '../../../../platform/severityIcon/browser/severityIcon.js';
import { contrastBorder, editorBackground, editorErrorBorder, editorErrorForeground, editorInfoBorder, editorInfoForeground, editorWarningBorder, editorWarningForeground, oneOf, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { IColorTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';

class MessageWidget {

	private _lines: number = 0;
	private _longestLineLength: number = 0;

	private readonly _editor: ICodeEditor;
	private readonly _messageBlock: HTMLDivElement;
	private readonly _relatedBlock: HTMLDivElement;
	private readonly _scrollable: ScrollableElement;
	private readonly _relatedDiagnostics = new WeakMap<HTMLElement, IRelatedInformation>();
	private readonly _disposables: DisposableStore = new DisposableStore();

	private _codeLink?: HTMLElement;

	constructor(
		parent: HTMLElement,
		editor: ICodeEditor,
		onRelatedInformation: (related: IRelatedInformation) => void,
		private readonly _openerService: IOpenerService,
		private readonly _labelService: ILabelService
	) {
		this._editor = editor;

		const domNode = document.createElement('div');
		domNode.className = 'descriptioncontainer';

		this._messageBlock = document.createElement('div');
		this._messageBlock.classList.add('message');
		this._messageBlock.setAttribute('aria-live', 'assertive');
		this._messageBlock.setAttribute('role', 'alert');
		domNode.appendChild(this._messageBlock);

		this._relatedBlock = document.createElement('div');
		domNode.appendChild(this._relatedBlock);
		this._disposables.add(dom.addStandardDisposableListener(this._relatedBlock, 'click', event => {
			event.preventDefault();
			const related = this._relatedDiagnostics.get(event.target);
			if (related) {
				onRelatedInformation(related);
			}
		}));

		this._scrollable = new ScrollableElement(domNode, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Auto,
			useShadows: false,
			horizontalScrollbarSize: 6,
			verticalScrollbarSize: 6
		});
		parent.appendChild(this._scrollable.getDomNode());
		this._disposables.add(this._scrollable.onScroll(e => {
			domNode.style.left = `-${e.scrollLeft}px`;
			domNode.style.top = `-${e.scrollTop}px`;
		}));
		this._disposables.add(this._scrollable);
	}

	dispose(): void {
		dispose(this._disposables);
	}

	update(marker: IMarker): void {
		const { source, message, relatedInformation, code } = marker;
		let sourceAndCodeLength = (source?.length || 0) + '()'.length;
		if (code) {
			if (typeof code === 'string') {
				sourceAndCodeLength += code.length;
			} else {
				sourceAndCodeLength += code.value.length;
			}
		}

		const lines = splitLines(message);
		this._lines = lines.length;
		this._longestLineLength = 0;
		for (const line of lines) {
			this._longestLineLength = Math.max(line.length + sourceAndCodeLength, this._longestLineLength);
		}

		dom.clearNode(this._messageBlock);
		this._messageBlock.setAttribute('aria-label', this.getAriaLabel(marker));
		this._editor.applyFontInfo(this._messageBlock);
		let lastLineElement = this._messageBlock;
		for (const line of lines) {
			lastLineElement = document.createElement('div');
			lastLineElement.innerText = line;
			if (line === '') {
				lastLineElement.style.height = this._messageBlock.style.lineHeight;
			}
			this._messageBlock.appendChild(lastLineElement);
		}
		if (source || code) {
			const detailsElement = document.createElement('span');
			detailsElement.classList.add('details');
			lastLineElement.appendChild(detailsElement);
			if (source) {
				const sourceElement = document.createElement('span');
				sourceElement.innerText = source;
				sourceElement.classList.add('source');
				detailsElement.appendChild(sourceElement);
			}
			if (code) {
				if (typeof code === 'string') {
					const codeElement = document.createElement('span');
					codeElement.innerText = `(${code})`;
					codeElement.classList.add('code');
					detailsElement.appendChild(codeElement);
				} else {
					this._codeLink = dom.$('a.code-link');
					this._codeLink.setAttribute('href', `${code.target.toString()}`);

					this._codeLink.onclick = (e) => {
						this._openerService.open(code.target, { allowCommands: true });
						e.preventDefault();
						e.stopPropagation();
					};

					const codeElement = dom.append(this._codeLink, dom.$('span'));
					codeElement.innerText = code.value;
					detailsElement.appendChild(this._codeLink);
				}
			}
		}

		dom.clearNode(this._relatedBlock);
		this._editor.applyFontInfo(this._relatedBlock);
		if (isNonEmptyArray(relatedInformation)) {
			const relatedInformationNode = this._relatedBlock.appendChild(document.createElement('div'));
			relatedInformationNode.style.paddingTop = `${Math.floor(this._editor.getOption(EditorOption.lineHeight) * 0.66)}px`;
			this._lines += 1;

			for (const related of relatedInformation) {

				const container = document.createElement('div');

				const relatedResource = document.createElement('a');
				relatedResource.classList.add('filename');
				relatedResource.innerText = `${this._labelService.getUriBasenameLabel(related.resource)}(${related.startLineNumber}, ${related.startColumn}): `;
				relatedResource.title = this._labelService.getUriLabel(related.resource);
				this._relatedDiagnostics.set(relatedResource, related);

				const relatedMessage = document.createElement('span');
				relatedMessage.innerText = related.message;

				container.appendChild(relatedResource);
				container.appendChild(relatedMessage);

				this._lines += 1;
				relatedInformationNode.appendChild(container);
			}
		}

		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
		const scrollWidth = Math.ceil(fontInfo.typicalFullwidthCharacterWidth * this._longestLineLength * 0.75);
		const scrollHeight = fontInfo.lineHeight * this._lines;
		this._scrollable.setScrollDimensions({ scrollWidth, scrollHeight });
	}

	layout(height: number, width: number): void {
		this._scrollable.getDomNode().style.height = `${height}px`;
		this._scrollable.getDomNode().style.width = `${width}px`;
		this._scrollable.setScrollDimensions({ width, height });
	}

	getHeightInLines(): number {
		return Math.min(17, this._lines);
	}

	private getAriaLabel(marker: IMarker): string {
		let severityLabel = '';
		switch (marker.severity) {
			case MarkerSeverity.Error:
				severityLabel = nls.localize('Error', "Error");
				break;
			case MarkerSeverity.Warning:
				severityLabel = nls.localize('Warning', "Warning");
				break;
			case MarkerSeverity.Info:
				severityLabel = nls.localize('Info', "Info");
				break;
			case MarkerSeverity.Hint:
				severityLabel = nls.localize('Hint', "Hint");
				break;
		}

		let ariaLabel = nls.localize('marker aria', "{0} at {1}. ", severityLabel, marker.startLineNumber + ':' + marker.startColumn);
		const model = this._editor.getModel();
		if (model && (marker.startLineNumber <= model.getLineCount()) && (marker.startLineNumber >= 1)) {
			const lineContent = model.getLineContent(marker.startLineNumber);
			ariaLabel = `${lineContent}, ${ariaLabel}`;
		}
		return ariaLabel;
	}
}

export class MarkerNavigationWidget extends PeekViewWidget {

	static readonly TitleMenu = new MenuId('gotoErrorTitleMenu');

	private _parentContainer!: HTMLElement;
	private _container!: HTMLElement;
	private _icon!: HTMLElement;
	private _message!: MessageWidget;
	private readonly _callOnDispose = new DisposableStore();
	private _severity: MarkerSeverity;
	private _backgroundColor?: Color;
	private readonly _onDidSelectRelatedInformation = new Emitter<IRelatedInformation>();
	private _heightInPixel!: number;

	readonly onDidSelectRelatedInformation: Event<IRelatedInformation> = this._onDidSelectRelatedInformation.event;

	constructor(
		editor: ICodeEditor,
		@IThemeService private readonly _themeService: IThemeService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IMenuService private readonly _menuService: IMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILabelService private readonly _labelService: ILabelService
	) {
		super(editor, { showArrow: true, showFrame: true, isAccessible: true, frameWidth: 1 }, instantiationService);
		this._severity = MarkerSeverity.Warning;
		this._backgroundColor = Color.white;

		this._applyTheme(_themeService.getColorTheme());
		this._callOnDispose.add(_themeService.onDidColorThemeChange(this._applyTheme.bind(this)));

		this.create();
	}

	private _applyTheme(theme: IColorTheme) {
		this._backgroundColor = theme.getColor(editorMarkerNavigationBackground);
		let colorId = editorMarkerNavigationError;
		let headerBackground = editorMarkerNavigationErrorHeader;

		if (this._severity === MarkerSeverity.Warning) {
			colorId = editorMarkerNavigationWarning;
			headerBackground = editorMarkerNavigationWarningHeader;
		} else if (this._severity === MarkerSeverity.Info) {
			colorId = editorMarkerNavigationInfo;
			headerBackground = editorMarkerNavigationInfoHeader;
		}

		const frameColor = theme.getColor(colorId);
		const headerBg = theme.getColor(headerBackground);

		this.style({
			arrowColor: frameColor,
			frameColor: frameColor,
			headerBackgroundColor: headerBg,
			primaryHeadingColor: theme.getColor(peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
		}); // style() will trigger _applyStyles
	}

	protected override _applyStyles(): void {
		if (this._parentContainer) {
			this._parentContainer.style.backgroundColor = this._backgroundColor ? this._backgroundColor.toString() : '';
		}
		super._applyStyles();
	}

	override dispose(): void {
		this._callOnDispose.dispose();
		super.dispose();
	}

	focus(): void {
		this._parentContainer.focus();
	}

	protected override _fillHead(container: HTMLElement): void {
		super._fillHead(container);

		this._disposables.add(this._actionbarWidget!.actionRunner.onWillRun(e => this.editor.focus()));

		const menu = this._menuService.getMenuActions(MarkerNavigationWidget.TitleMenu, this._contextKeyService);
		const actions = getFlatActionBarActions(menu);
		this._actionbarWidget!.push(actions, { label: false, icon: true, index: 0 });
	}

	protected override _fillTitleIcon(container: HTMLElement): void {
		this._icon = dom.append(container, dom.$(''));
	}

	protected _fillBody(container: HTMLElement): void {
		this._parentContainer = container;
		container.classList.add('marker-widget');
		this._parentContainer.tabIndex = 0;
		this._parentContainer.setAttribute('role', 'tooltip');

		this._container = document.createElement('div');
		container.appendChild(this._container);

		this._message = new MessageWidget(this._container, this.editor, related => this._onDidSelectRelatedInformation.fire(related), this._openerService, this._labelService);
		this._disposables.add(this._message);
	}

	override show(): void {
		throw new Error('call showAtMarker');
	}

	showAtMarker(marker: IMarker, markerIdx: number, markerCount: number): void {
		// update:
		// * title
		// * message
		this._container.classList.remove('stale');
		this._message.update(marker);

		// update frame color (only applied on 'show')
		this._severity = marker.severity;
		this._applyTheme(this._themeService.getColorTheme());

		// show
		const range = Range.lift(marker);
		const editorPosition = this.editor.getPosition();
		const position = editorPosition && range.containsPosition(editorPosition) ? editorPosition : range.getStartPosition();
		super.show(position, this.computeRequiredHeight());

		const model = this.editor.getModel();
		if (model) {
			const detail = markerCount > 1
				? nls.localize('problems', "{0} of {1} problems", markerIdx, markerCount)
				: nls.localize('change', "{0} of {1} problem", markerIdx, markerCount);
			this.setTitle(basename(model.uri), detail);
		}
		this._icon.className = `codicon ${SeverityIcon.className(MarkerSeverity.toSeverity(this._severity))}`;

		this.editor.revealPositionNearTop(position, ScrollType.Smooth);
		this.editor.focus();
	}

	updateMarker(marker: IMarker): void {
		this._container.classList.remove('stale');
		this._message.update(marker);
	}

	showStale() {
		this._container.classList.add('stale');
		this._relayout();
	}

	protected override _doLayoutBody(heightInPixel: number, widthInPixel: number): void {
		super._doLayoutBody(heightInPixel, widthInPixel);
		this._heightInPixel = heightInPixel;
		this._message.layout(heightInPixel, widthInPixel);
		this._container.style.height = `${heightInPixel}px`;
	}

	protected override _onWidth(widthInPixel: number): void {
		this._message.layout(this._heightInPixel, widthInPixel);
	}

	protected override _relayout(): void {
		super._relayout(this.computeRequiredHeight());
	}

	private computeRequiredHeight() {
		return 3 + this._message.getHeightInLines();
	}
}

// theming

const errorDefault = oneOf(editorErrorForeground, editorErrorBorder);
const warningDefault = oneOf(editorWarningForeground, editorWarningBorder);
const infoDefault = oneOf(editorInfoForeground, editorInfoBorder);

const editorMarkerNavigationError = registerColor('editorMarkerNavigationError.background', { dark: errorDefault, light: errorDefault, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('editorMarkerNavigationError', 'Editor marker navigation widget error color.'));
const editorMarkerNavigationErrorHeader = registerColor('editorMarkerNavigationError.headerBackground', { dark: transparent(editorMarkerNavigationError, .1), light: transparent(editorMarkerNavigationError, .1), hcDark: null, hcLight: null }, nls.localize('editorMarkerNavigationErrorHeaderBackground', 'Editor marker navigation widget error heading background.'));

const editorMarkerNavigationWarning = registerColor('editorMarkerNavigationWarning.background', { dark: warningDefault, light: warningDefault, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('editorMarkerNavigationWarning', 'Editor marker navigation widget warning color.'));
const editorMarkerNavigationWarningHeader = registerColor('editorMarkerNavigationWarning.headerBackground', { dark: transparent(editorMarkerNavigationWarning, .1), light: transparent(editorMarkerNavigationWarning, .1), hcDark: '#0C141F', hcLight: transparent(editorMarkerNavigationWarning, .2) }, nls.localize('editorMarkerNavigationWarningBackground', 'Editor marker navigation widget warning heading background.'));

const editorMarkerNavigationInfo = registerColor('editorMarkerNavigationInfo.background', { dark: infoDefault, light: infoDefault, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize('editorMarkerNavigationInfo', 'Editor marker navigation widget info color.'));
const editorMarkerNavigationInfoHeader = registerColor('editorMarkerNavigationInfo.headerBackground', { dark: transparent(editorMarkerNavigationInfo, .1), light: transparent(editorMarkerNavigationInfo, .1), hcDark: null, hcLight: null }, nls.localize('editorMarkerNavigationInfoHeaderBackground', 'Editor marker navigation widget info heading background.'));

const editorMarkerNavigationBackground = registerColor('editorMarkerNavigation.background', editorBackground, nls.localize('editorMarkerNavigationBackground', 'Editor marker navigation widget background.'));
