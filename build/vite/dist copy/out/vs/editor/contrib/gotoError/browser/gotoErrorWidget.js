/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MarkerNavigationWidget_1;
import * as dom from '../../../../base/browser/dom.js';
import { ScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { Color } from '../../../../base/common/color.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { splitLines } from '../../../../base/common/strings.js';
import './media/gotoErrorWidget.css';
import { Range } from '../../../common/core/range.js';
import { peekViewTitleForeground, peekViewTitleInfoForeground, PeekViewWidget } from '../../peekView/browser/peekView.js';
import * as nls from '../../../../nls.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { SeverityIcon } from '../../../../base/browser/ui/severityIcon/severityIcon.js';
import { contrastBorder, editorBackground, editorErrorBorder, editorErrorForeground, editorInfoBorder, editorInfoForeground, editorWarningBorder, editorWarningForeground, oneOf, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
class MessageWidget {
    constructor(parent, editor, onRelatedInformation, _openerService, _labelService) {
        this._openerService = _openerService;
        this._labelService = _labelService;
        this._lines = 0;
        this._longestLineLength = 0;
        this._relatedDiagnostics = new WeakMap();
        this._disposables = new DisposableStore();
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
            horizontal: 1 /* ScrollbarVisibility.Auto */,
            vertical: 1 /* ScrollbarVisibility.Auto */,
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
    dispose() {
        dispose(this._disposables);
    }
    update(marker) {
        const { source, message, relatedInformation, code } = marker;
        let sourceAndCodeLength = (source?.length || 0) + '()'.length;
        if (code) {
            if (typeof code === 'string') {
                sourceAndCodeLength += code.length;
            }
            else {
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
                }
                else {
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
            relatedInformationNode.style.paddingTop = `${Math.floor(this._editor.getOption(75 /* EditorOption.lineHeight */) * 0.66)}px`;
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
        const fontInfo = this._editor.getOption(59 /* EditorOption.fontInfo */);
        const scrollWidth = Math.ceil(fontInfo.typicalFullwidthCharacterWidth * this._longestLineLength * 0.75);
        const scrollHeight = fontInfo.lineHeight * this._lines;
        this._scrollable.setScrollDimensions({ scrollWidth, scrollHeight });
    }
    layout(height, width) {
        this._scrollable.getDomNode().style.height = `${height}px`;
        this._scrollable.getDomNode().style.width = `${width}px`;
        this._scrollable.setScrollDimensions({ width, height });
    }
    getHeightInLines() {
        return Math.min(17, this._lines);
    }
    getAriaLabel(marker) {
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
let MarkerNavigationWidget = class MarkerNavigationWidget extends PeekViewWidget {
    static { MarkerNavigationWidget_1 = this; }
    static { this.TitleMenu = new MenuId('gotoErrorTitleMenu'); }
    constructor(editor, _themeService, _openerService, _menuService, instantiationService, _contextKeyService, _labelService) {
        super(editor, { showArrow: true, showFrame: true, isAccessible: true, frameWidth: 1 }, instantiationService);
        this._themeService = _themeService;
        this._openerService = _openerService;
        this._menuService = _menuService;
        this._contextKeyService = _contextKeyService;
        this._labelService = _labelService;
        this._callOnDispose = new DisposableStore();
        this._onDidSelectRelatedInformation = new Emitter();
        this.onDidSelectRelatedInformation = this._onDidSelectRelatedInformation.event;
        this._severity = MarkerSeverity.Warning;
        this._backgroundColor = Color.white;
        this._applyTheme(_themeService.getColorTheme());
        this._callOnDispose.add(_themeService.onDidColorThemeChange(this._applyTheme.bind(this)));
        this.create();
    }
    _applyTheme(theme) {
        this._backgroundColor = theme.getColor(editorMarkerNavigationBackground);
        let colorId = editorMarkerNavigationError;
        let headerBackground = editorMarkerNavigationErrorHeader;
        if (this._severity === MarkerSeverity.Warning) {
            colorId = editorMarkerNavigationWarning;
            headerBackground = editorMarkerNavigationWarningHeader;
        }
        else if (this._severity === MarkerSeverity.Info) {
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
    _applyStyles() {
        if (this._parentContainer) {
            this._parentContainer.style.backgroundColor = this._backgroundColor ? this._backgroundColor.toString() : '';
        }
        super._applyStyles();
    }
    dispose() {
        this._callOnDispose.dispose();
        this._onDidSelectRelatedInformation.dispose();
        super.dispose();
    }
    focus() {
        this._parentContainer.focus();
    }
    _fillHead(container) {
        super._fillHead(container);
        this._disposables.add(this._actionbarWidget.actionRunner.onWillRun(e => this.editor.focus()));
        const menu = this._menuService.getMenuActions(MarkerNavigationWidget_1.TitleMenu, this._contextKeyService);
        const actions = getFlatActionBarActions(menu);
        this._actionbarWidget.push(actions, { label: false, icon: true, index: 0 });
    }
    _fillTitleIcon(container) {
        this._icon = dom.append(container, dom.$(''));
    }
    _fillBody(container) {
        this._parentContainer = container;
        container.classList.add('marker-widget');
        this._parentContainer.tabIndex = 0;
        this._parentContainer.setAttribute('role', 'tooltip');
        this._container = document.createElement('div');
        container.appendChild(this._container);
        this._message = new MessageWidget(this._container, this.editor, related => this._onDidSelectRelatedInformation.fire(related), this._openerService, this._labelService);
        this._disposables.add(this._message);
    }
    show() {
        throw new Error('call showAtMarker');
    }
    showAtMarker(marker, markerIdx, markerCount) {
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
        this.editor.revealPositionInCenterIfOutsideViewport(position, 0 /* ScrollType.Smooth */);
        this.editor.focus();
    }
    updateMarker(marker) {
        this._container.classList.remove('stale');
        this._message.update(marker);
    }
    showStale() {
        this._container.classList.add('stale');
        this._relayout();
    }
    _doLayoutBody(heightInPixel, widthInPixel) {
        super._doLayoutBody(heightInPixel, widthInPixel);
        this._heightInPixel = heightInPixel;
        this._message.layout(heightInPixel, widthInPixel);
        this._container.style.height = `${heightInPixel}px`;
    }
    _onWidth(widthInPixel) {
        this._message.layout(this._heightInPixel, widthInPixel);
    }
    _relayout() {
        super._relayout(this.computeRequiredHeight());
    }
    computeRequiredHeight() {
        return 3 + this._message.getHeightInLines();
    }
};
MarkerNavigationWidget = MarkerNavigationWidget_1 = __decorate([
    __param(1, IThemeService),
    __param(2, IOpenerService),
    __param(3, IMenuService),
    __param(4, IInstantiationService),
    __param(5, IContextKeyService),
    __param(6, ILabelService)
], MarkerNavigationWidget);
export { MarkerNavigationWidget };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ290b0Vycm9yV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZ290b0Vycm9yL2Jyb3dzZXIvZ290b0Vycm9yV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLDZCQUE2QixDQUFDO0FBR3JDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV0RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsMkJBQTJCLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDMUgsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxxQkFBcUIs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