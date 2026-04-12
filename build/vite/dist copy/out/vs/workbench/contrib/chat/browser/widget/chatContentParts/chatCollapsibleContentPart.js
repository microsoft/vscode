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
import { $ } from '../../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { renderFileWidgets } from './chatInlineAnchorWidget.js';
let ChatCollapsibleContentPart = class ChatCollapsibleContentPart extends Disposable {
    get icon() {
        return this._overrideIcon.get();
    }
    set icon(value) {
        this._overrideIcon.set(value, undefined);
    }
    constructor(title, context, hoverMessage, hoverService, configurationService) {
        super();
        this.title = title;
        this.hoverMessage = hoverMessage;
        this.hoverService = hoverService;
        this._renderedTitleWithWidgets = this._register(new MutableDisposable());
        this._isExpanded = observableValue(this, false);
        this._overrideIcon = observableValue(this, undefined);
        this._contentInitialized = false;
        this.element = context.element;
        this.hasFollowingContent = context.contentIndex + 1 < context.content.length;
        this._showCheckmarks = observableConfigValue("accessibility.chat.showCheckmarks" /* AccessibilityWorkbenchSettingId.ShowChatCheckmarks */, false, configurationService);
    }
    get domNode() {
        this._domNode ??= this.init();
        return this._domNode;
    }
    init() {
        const referencesLabel = this.title;
        const buttonElement = $('.chat-used-context-label', undefined);
        const collapseButton = this._register(new ButtonWithIcon(buttonElement, {
            buttonBackground: undefined,
            buttonBorder: undefined,
            buttonForeground: undefined,
            buttonHoverBackground: undefined,
            buttonSecondaryBackground: undefined,
            buttonSecondaryForeground: undefined,
            buttonSecondaryHoverBackground: undefined,
            buttonSeparator: undefined
        }));
        this._collapseButton = collapseButton;
        this._domNode = $('.chat-used-context', undefined, buttonElement);
        collapseButton.label = referencesLabel;
        // Add hover chevron indicator on the right (decorative, hide from screen readers)
        const hoverChevron = $('span.chat-collapsible-hover-chevron.codicon.codicon-chevron-right', { 'aria-hidden': 'true' });
        collapseButton.element.appendChild(hoverChevron);
        if (this.hoverMessage) {
            this._register(this.hoverService.setupDelayedHover(collapseButton.iconElement, {
                content: this.hoverMessage,
                style: 1 /* HoverStyle.Pointer */,
            }));
        }
        this._register(collapseButton.onDidClick(() => {
            const value = this._isExpanded.get();
            this._isExpanded.set(!value, undefined);
        }));
        // Initialize the expanded state based on the subclass's isExpanded() method
        this._isExpanded.set(this.isExpanded(), undefined);
        this._register(autorun(r => {
            const expanded = this._isExpanded.read(r);
            const overrideIcon = this._overrideIcon.read(r);
            const showCheckmarks = this._showCheckmarks.read(r);
            if (overrideIcon) {
                collapseButton.icon = overrideIcon;
            }
            this._domNode?.classList.toggle('show-checkmarks', showCheckmarks);
            // Update hover chevron direction
            hoverChevron.classList.toggle('codicon-chevron-right', !expanded);
            hoverChevron.classList.toggle('codicon-chevron-down', expanded);
            this._domNode?.classList.toggle('chat-used-context-collapsed', !expanded);
            this.updateAriaLabel(collapseButton.element, typeof referencesLabel === 'string' ? referencesLabel : referencesLabel.value, expanded);
            // Lazy initialization: render content only when expanded for the first time
            if ((expanded || this.shouldInitEarly()) && !this._contentInitialized) {
                this._contentInitialized = true;
                this._contentElement = this.initContent();
                this._domNode?.appendChild(this._contentElement);
            }
        }));
        return this._domNode;
    }
    shouldInitEarly() {
        return false;
    }
    updateAriaLabel(element, label, expanded) {
        element.ariaLabel = label;
        element.ariaExpanded = String(expanded);
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
    get expanded() {
        return this._isExpanded;
    }
    isExpanded() {
        return this._isExpanded.get();
    }
    setExpanded(value) {
        this._isExpanded.set(value, undefined);
    }
    setTitle(title) {
        this.title = title;
        if (this._collapseButton) {
            this._collapseButton.label = title;
            this.updateAriaLabel(this._collapseButton.element, title, this.isExpanded());
        }
    }
    // Render collapsible dropdown title with widgets
    setTitleWithWidgets(content, instantiationService, chatMarkdownAnchorService, chatContentMarkdownRenderer) {
        if (this._store.isDisposed || !this._collapseButton) {
            return;
        }
        const result = chatContentMarkdownRenderer.render(content);
        result.element.classList.add('collapsible-title-content');
        renderFileWidgets(result.element, instantiationService, chatMarkdownAnchorService, this._store);
        const labelElement = this._collapseButton.labelElement;
        labelElement.textContent = '';
        labelElement.appendChild(result.element);
        const textContent = result.element.textContent || '';
        this.updateAriaLabel(this._collapseButton.element, textContent, this.isExpanded());
        this._renderedTitleWithWidgets.value = result;
    }
};
ChatCollapsibleContentPart = __decorate([
    __param(3, IHoverService),
    __param(4, IConfigurationService)
], ChatCollapsibleContentPart);
export { ChatCollapsibleContentPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUdwRixPQUFPLEVBQUUsVUFBVSxFQUFlLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEcsT0FBTyxFQUFFLE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFLaEgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFRekQsSUFBZSwwQkFBMEIsR0FBekMsTUFBZSwwQkFBMkIsU0FBUSxVQUFVO0lBY2xFLElBQVcsSUFBSTtRQUNkLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNqQyxDQUFDO0lBRUQsSUFBVyxJQUFJLENBQUMsS0FBNEI7UUFDM0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFJRCxZQUNTLEtBQStCLEVBQ3ZDLE9BQXNDLEVBQ3JCLFlBQXlDLEVBQzNDLFlBQThDLEVBQ3RD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