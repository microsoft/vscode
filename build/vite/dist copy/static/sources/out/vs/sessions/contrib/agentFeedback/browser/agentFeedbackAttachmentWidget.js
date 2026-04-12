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
import './media/agentFeedbackAttachment.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as event from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { AgentFeedbackHover } from './agentFeedbackHover.js';
/**
 * Attachment widget that renders "N comments" with a comment icon
 * and a custom hover showing all feedback items with actions.
 */
let AgentFeedbackAttachmentWidget = class AgentFeedbackAttachmentWidget extends Disposable {
    constructor(_attachment, options, container, _instantiationService) {
        super();
        this._attachment = _attachment;
        this._instantiationService = _instantiationService;
        this._onDidDelete = this._store.add(new event.Emitter());
        this.onDidDelete = this._onDidDelete.event;
        this._onDidOpen = this._store.add(new event.Emitter());
        this.onDidOpen = this._onDidOpen.event;
        this.element = dom.append(container, dom.$('.chat-attached-context-attachment.agent-feedback-attachment'));
        this.element.tabIndex = 0;
        this.element.role = 'button';
        // Icon
        const iconSpan = dom.$('span');
        iconSpan.classList.add(...ThemeIcon.asClassNameArray(Codicon.comment));
        const pillIcon = dom.$('div.chat-attached-context-pill', {}, iconSpan);
        this.element.appendChild(pillIcon);
        // Label
        const label = dom.$('span.chat-attached-context-custom-text', {}, this._attachment.name);
        this.element.appendChild(label);
        const deletionCurrentlyNotSupported = true;
        // Clear button
        if (options.supportsDeletion && !deletionCurrentlyNotSupported) {
            const clearBtn = dom.append(this.element, dom.$('.chat-attached-context-clear-button'));
            const clearIcon = dom.$('span');
            clearIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
            clearBtn.appendChild(clearIcon);
            clearBtn.title = localize('removeAttachment', "Remove");
            this._store.add(dom.addDisposableListener(clearBtn, dom.EventType.CLICK, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._onDidDelete.fire(e);
            }));
            if (options.shouldFocusClearButton) {
                clearBtn.focus();
            }
        }
        // Aria label
        this.element.ariaLabel = localize('chat.agentFeedback', "Attached agent feedback, {0}", this._attachment.name);
        // Custom interactive hover
        this._store.add(this._instantiationService.createInstance(AgentFeedbackHover, this.element, this._attachment, options.supportsDeletion));
    }
};
AgentFeedbackAttachmentWidget = __decorate([
    __param(3, IInstantiationService)
], AgentFeedbackAttachmentWidget);
export { AgentFeedbackAttachmentWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFja0F0dGFjaG1lbnRXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2FnZW50RmVlZGJhY2svYnJvd3Nlci9hZ2VudEZlZWRiYWNrQXR0YWNobWVudFdpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLHFDQUFxQyxDQUFDO0FBQzdDLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxLQUFLLEtBQUssTUFBTSxrQ0FBa0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFN0Q7OztHQUdHO0FBQ0ksSUFBTSw2QkFBNkIsR0FBbkMsTUFBTSw2QkFBOEIsU0FBUSxVQUFVO0lBVTVELFlBQ2tCLFdBQXdDLEVBQ3pELE9BQXVFLEVBQ3ZFLFNBQXNCLEVBQ0MscUJBQTZEO1FBRXBGLEtBQUssRUFBRSxDQUFDO1FBTFMsZ0JBQVcsR0FBWCxXQUFXLENBQTZCO1FBR2pCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFWcEUsaUJBQVksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQVMsQ0FBQyxDQUFDO1FBQ25FLGdCQUFXLEdBQUcsSUFB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