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
var ChatViewTitleControl_1;
import './media/chatViewTitleControl.css';
import { addDisposableListener, EventType, h } from '../../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { Gesture, EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { AgentSessionsPicker } from '../../agentSessions/agentSessionsPicker.js';
let ChatViewTitleControl = class ChatViewTitleControl extends Disposable {
    static { ChatViewTitleControl_1 = this; }
    static { this.DEFAULT_TITLE = localize('chat', "Chat"); }
    static { this.PICK_AGENT_SESSION_ACTION_ID = 'workbench.action.chat.pickAgentSession'; }
    constructor(container, delegate, instantiationService) {
        super();
        this.container = container;
        this.delegate = delegate;
        this.instantiationService = instantiationService;
        this._onDidChangeHeight = this._register(new Emitter());
        this.onDidChangeHeight = this._onDidChangeHeight.event;
        this.title = undefined;
        this.titleLabel = this._register(new MutableDisposable());
        this.modelDisposables = this._register(new MutableDisposable());
        this.lastKnownHeight = 0;
        this.render(this.container);
        this.registerActions();
    }
    registerActions() {
        const that = this;
        this._register(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: ChatViewTitleControl_1.PICK_AGENT_SESSION_ACTION_ID,
                    title: localize('chat.pickAgentSession', "Pick Agent Session"),
                    f1: false,
                    menu: [{
                            id: MenuId.ChatViewSessionTitleNavigationToolbar,
                            group: 'navigation',
                            order: 2
                        }]
                });
            }
            async run(accessor) {
                const instantiationService = accessor.get(IInstantiationService);
                const agentSessionsPicker = instantiationService.createInstance(AgentSessionsPicker, that.titleLabel.value?.element, undefined);
                await agentSessionsPicker.pickAgentSession();
            }
        }));
    }
    render(parent) {
        const elements = h('div.chat-view-title-container', [
            h('div.chat-view-title-inner', [
                h('div.chat-view-title-navigation-toolbar@navigationToolbar'),
                h('div.chat-view-title-actions-toolbar@actionsToolbar'),
            ]),
        ]);
        // Toolbar on the left
        this.navigationToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, elements.navigationToolbar, MenuId.ChatViewSessionTitleNavigationToolbar, {
            actionViewItemProvider: (action) => {
                if (action.id === ChatViewTitleControl_1.PICK_AGENT_SESSION_ACTION_ID) {
                    this.titleLabel.value = new ChatViewTitleLabel(action);
                    this.titleLabel.value.updateTitle(this.title ?? ChatViewTitleControl_1.DEFAULT_TITLE);
                    return this.titleLabel.value;
                }
                return undefined;
            },
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            menuOptions: { shouldForwardArgs: true }
        }));
        // Actions toolbar on the right
        this.actionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, elements.actionsToolbar, MenuId.ChatViewSessionTitleToolbar, {
            menuOptions: { shouldForwardArgs: true },
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */
        }));
        // Title controls
        this.titleContainer = elements.root;
        this._register(Gesture.addTarget(this.titleContainer));
        for (const eventType of [TouchEventType.Tap, EventType.CLICK]) {
            this._register(addDisposableListener(this.titleContainer, eventType, () => {
                this.delegate.focusChat();
            }));
        }
        parent.appendChild(this.titleContainer);
    }
    update(model) {
        this.model = model;
        this.modelDisposables.value = model?.onDidChange(e => {
            if (e.kind === 'setCustomTitle' || e.kind === 'addRequest') {
                this.doUpdate();
            }
        });
        this.doUpdate();
    }
    doUpdate() {
        const markdownTitle = new MarkdownString(this.model?.title ?? '');
        this.title = renderAsPlaintext(markdownTitle);
        this.updateTitle(this.title ?? ChatViewTitleControl_1.DEFAULT_TITLE);
        const context = this.model && {
            $mid: 19 /* MarshalledId.ChatViewContext */,
            sessionResource: this.model.sessionResource
        };
        if (this.navigationToolbar) {
            this.navigationToolbar.context = context;
        }
        if (this.actionsToolbar) {
            this.actionsToolbar.context = context;
        }
    }
    updateTitle(title) {
        if (!this.titleContainer) {
            return;
        }
        this.titleContainer.classList.toggle('visible', this.shouldRender());
        this.titleLabel.value?.updateTitle(title);
        const currentHeight = this.getHeight();
        if (currentHeight !== this.lastKnownHeight) {
            this.lastKnownHeight = currentHeight;
            this._onDidChangeHeight.fire();
        }
    }
    shouldRender() {
        return !!this.model?.title; // we need a chat showing and not being empty
    }
    getHeight() {
        if (!this.titleContainer || this.titleContainer.style.display === 'none') {
            return 0;
        }
        return this.titleContainer.offsetHeight;
    }
};
ChatViewTitleControl = ChatViewTitleControl_1 = __decorate([
    __param(2, IInstantiationService)
], ChatViewTitleControl);
export { ChatViewTitleControl };
class ChatViewTitleLabel extends ActionViewItem {
    constructor(action, options) {
        super(null, action, { ...options, icon: false, label: true });
        this.titleLabel = undefined;
    }
    render(container) {
        super.render(container);
        container.classList.add('chat-view-title-action-item');
        this.label?.classList.add('chat-view-title-label-container');
        this.titleLabel = this.label?.appendChild(h('span.chat-view-title-label').root);
        this.updateLabel();
    }
    updateTitle(title) {
        this.title = title;
        this.updateLabel();
    }
    updateLabel() {
        if (!this.titleLabel) {
            return;
        }
        if (this.title) {
            this.titleLabel.textContent = this.title;
        }
        else {
            this.titleLabel.textContent = '';
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFZpZXdUaXRsZUNvbnRyb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0SG9zdHMvdmlld1BhbmUvY2hhdFZpZXdUaXRsZUNvbnRyb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sa0NBQWtDLENBQUM7QUFDMUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM1RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsSUFBSSxjQUFjLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUUzRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFzQixvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSxrRUFBa0UsQ0FBQztBQUczSCxPQUFPLEVBQUUsY0FBYyxFQUEwQixNQUFNLGdFQUFnRSxDQUFDO0FBRXhILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBTTFFLElBQU0sb0JBQW9CLEdBQTFCLE1BQU0sb0JBQXFC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