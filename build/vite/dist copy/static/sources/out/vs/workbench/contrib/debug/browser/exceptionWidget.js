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
import './media/exceptionWidget.css';
import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { ZoneWidget } from '../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import { EDITOR_CONTRIBUTION_ID } from '../common/debug.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { LinkDetector } from './linkDetector.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../base/common/actions.js';
import { widgetClose } from '../../../../platform/theme/common/iconRegistry.js';
const $ = dom.$;
// theming
const debugExceptionWidgetBorder = registerColor('debugExceptionWidget.border', '#a31515', nls.localize('debugExceptionWidgetBorder', 'Exception widget border color.'));
const debugExceptionWidgetBackground = registerColor('debugExceptionWidget.background', { dark: '#420b0d', light: '#f1dfde', hcDark: '#420b0d', hcLight: '#f1dfde' }, nls.localize('debugExceptionWidgetBackground', 'Exception widget background color.'));
let ExceptionWidget = class ExceptionWidget extends ZoneWidget {
    constructor(editor, exceptionInfo, debugSession, shouldScroll, themeService, instantiationService) {
        super(editor, { showFrame: true, showArrow: true, isAccessible: true, frameWidth: 1, className: 'exception-widget-container' });
        this.exceptionInfo = exceptionInfo;
        this.debugSession = debugSession;
        this.shouldScroll = shouldScroll;
        this.instantiationService = instantiationService;
        this.applyTheme(themeService.getColorTheme());
        this._disposables.add(themeService.onDidColorThemeChange(this.applyTheme.bind(this)));
        this.create();
        const onDidLayoutChangeScheduler = new RunOnceScheduler(() => this._doLayout(undefined, undefined), 50);
        this._disposables.add(this.editor.onDidLayoutChange(() => onDidLayoutChangeScheduler.schedule()));
        this._disposables.add(onDidLayoutChangeScheduler);
    }
    applyTheme(theme) {
        this.backgroundColor = theme.getColor(debugExceptionWidgetBackground);
        const frameColor = theme.getColor(debugExceptionWidgetBorder);
        this.style({
            arrowColor: frameColor,
            frameColor: frameColor
        }); // style() will trigger _applyStyles
    }
    _applyStyles() {
        if (this.container) {
            this.container.style.backgroundColor = this.backgroundColor ? this.backgroundColor.toString() : '';
        }
        super._applyStyles();
    }
    _fillContainer(container) {
        this.setCssClass('exception-widget');
        // Set the font size and line height to the one from the editor configuration.
        const fontInfo = this.editor.getOption(59 /* EditorOption.fontInfo */);
        container.style.fontSize = `${fontInfo.fontSize}px`;
        container.style.lineHeight = `${fontInfo.lineHeight}px`;
        container.tabIndex = 0;
        const title = $('.title');
        const label = $('.label');
        dom.append(title, label);
        const actions = $('.actions');
        dom.append(title, actions);
        label.textContent = this.exceptionInfo.id ? nls.localize('exceptionThrownWithId', 'Exception has occurred: {0}', this.exceptionInfo.id) : nls.localize('exceptionThrown', 'Exception has occurred.');
        let ariaLabel = label.textContent;
        const actionBar = this._disposables.add(new ActionBar(actions));
        actionBar.push(new Action('editor.closeExceptionWidget', nls.localize('close', "Close"), ThemeIcon.asClassName(widgetClose), true, async () => {
            const contribution = this.editor.getContribution(EDITOR_CONTRIBUTION_ID);
            contribution?.closeExceptionWidget();
        }), { label: false, icon: true });
        dom.append(container, title);
        if (this.exceptionInfo.description) {
            const description = $('.description');
            description.textContent = this.exceptionInfo.description;
            ariaLabel += ', ' + this.exceptionInfo.description;
            dom.append(container, description);
        }
        if (this.exceptionInfo.details && this.exceptionInfo.details.stackTrace) {
            const stackTrace = $('.stack-trace');
            const linkDetector = this.instantiationService.createInstance(LinkDetector);
            const hoverBehaviour = {
                store: this._disposables,
                type: 0 /* DebugLinkHoverBehavior.Rich */,
            };
            const linkedStackTrace = linkDetector.linkify(this.exceptionInfo.details.stackTrace, hoverBehaviour, true, this.debugSession ? this.debugSession.root : undefined, undefined);
            stackTrace.appendChild(linkedStackTrace);
            dom.append(container, stackTrace);
            ariaLabel += ', ' + this.exceptionInfo.details.stackTrace;
        }
        container.setAttribute('aria-label', ariaLabel);
    }
    _doLayout(_heightInPixel, _widthInPixel) {
        // Reload the height with respect to the exception text content and relayout it to match the line count.
        this.container.style.height = 'initial';
        const lineHeight = this.editor.getOption(75 /* EditorOption.lineHeight */);
        const arrowHeight = Math.round(lineHeight / 3);
        const computedLinesNumber = Math.ceil((this.container.offsetHeight + arrowHeight) / lineHeight);
        this._relayout(computedLinesNumber);
    }
    revealRange(range, isLastLine) {
        // Only reveal/scroll if this widget should scroll
        // For inactive editors, skip the reveal to prevent scrolling
        if (this.shouldScroll()) {
            super.revealRange(range, isLastLine);
        }
    }
    focus() {
        // Focus into the container for accessibility purposes so the exception and stack trace gets read
        this.container?.focus();
    }
    hasFocus() {
        if (!this.container) {
            return false;
        }
        return dom.isAncestorOfActiveElement(this.container);
    }
    getWhitespaceHeight() {
        // Returns the height of the whitespace zone from the editor's whitespaces
        // This is more accurate than the container height as it includes the actual zone dimensions
        if (!this._viewZone || !this._viewZone.id) {
            return 0;
        }
        const whitespaces = this.editor.getWhitespaces();
        const whitespace = whitespaces.find(ws => ws.id === this._viewZone.id);
        return whitespace ? whitespace.height : 0;
    }
};
ExceptionWidget = __decorate([
    __param(4, IThemeService),
    __param(5, IInstantiationService)
], ExceptionWidget);
export { ExceptionWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhjZXB0aW9uV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9leGNlcHRpb25XaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyw2QkFBNkIsQ0FBQztBQUNyQyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBRXpGLE9BQU8sRUFBMkQsc0JBQXNCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNySCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsYUFBYSxFQUFlLE1BQU0sbURBQW1ELENBQUM7QUFDL0YsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNuRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQTBELFlBQVksRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRXpHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBR2hGLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFaEIsVUFBVTtBQUVWLE1BQU0sMEJBQTBCLEdBQUcsYUFBYSxDQUFDLDZCQUE2QixFQUFFLFNBQVMsRUFBRSxHQUFH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