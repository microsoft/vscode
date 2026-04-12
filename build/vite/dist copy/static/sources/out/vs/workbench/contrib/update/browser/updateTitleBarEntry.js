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
import * as dom from '../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { computeProgressPercent, isMajorMinorVersionChange } from '../common/updateUtils.js';
import { waitForState } from '../../../../base/common/observable.js';
import './media/updateTitleBarEntry.css';
import { UpdateTooltip } from './updateTooltip.js';
const UPDATE_TITLE_BAR_ACTION_ID = 'workbench.actions.updateIndicator';
const UPDATE_TITLE_BAR_CONTEXT = new RawContextKey('updateTitleBar', false);
const ACTIONABLE_STATES = ["available for download" /* StateType.AvailableForDownload */, "downloaded" /* StateType.Downloaded */, "ready" /* StateType.Ready */];
const DETAILED_STATES = [...ACTIONABLE_STATES, "checking for updates" /* StateType.CheckingForUpdates */, "downloading" /* StateType.Downloading */, "updating" /* StateType.Updating */, "overwriting" /* StateType.Overwriting */];
const LAST_KNOWN_VERSION_KEY = 'updateTitleBarEntry/lastKnownVersion';
registerAction2(class UpdateIndicatorTitleBarAction extends Action2 {
    constructor() {
        super({
            id: UPDATE_TITLE_BAR_ACTION_ID,
            title: localize('updateIndicatorTitleBarAction', 'Update'),
            f1: false,
            menu: [{
                    id: MenuId.TitleBarAdjacentCenter,
                    order: 0,
                    when: UPDATE_TITLE_BAR_CONTEXT,
                }]
        });
    }
    async run() { }
});
/**
 * Displays update status and actions in the title bar.
 */
let UpdateTitleBarContribution = class UpdateTitleBarContribution extends Disposable {
    constructor(actionViewItemService, chatService, configurationService, contextKeyService, hostService, instantiationService, productService, storageService, updateService) {
        super();
        this.chatService = chatService;
        this.configurationService = configurationService;
        this.hostService = hostService;
        this.productService = productService;
        this.storageService = storageService;
        this.tooltipVisible = false;
        this.pendingShow = this._register(new MutableDisposable());
        if (isWeb) {
            return; // Electron only
        }
        this.context = UPDATE_TITLE_BAR_CONTEXT.bindTo(contextKeyService);
        this.tooltip = this._register(instantiationService.createInstance(UpdateTooltip));
        this.state = updateService.state;
        this._register(updateService.onStateChange((state) => {
            this.state = state;
            this.onStateChange();
        }));
        this._register(actionViewItemService.register(MenuId.TitleBarAdjacentCenter, UPDATE_TITLE_BAR_ACTION_ID, (action, options) => {
            this.entry = instantiationService.createInstance(UpdateTitleBarEntry, action, options, this.tooltip, () => {
                this.tooltipVisible = false;
                if (!ACTIONABLE_STATES.includes(this.state.type) && !DETAILED_STATES.includes(this.state.type)) {
                    this.context.set(false);
                }
            });
            if (this.tooltipVisible) {
                this.entry.showTooltip();
            }
            return this.entry;
        }));
        this._register(CommandsRegistry.registerCommand('_update.showUpdateInfo', (_accessor, markdown) => this.showUpdateInfo(markdown)));
        void this.onStateChange(true);
    }
    async showUpdateInfo(markdown) {
        const rendered = await this.tooltip.renderPostInstall(markdown);
        if (rendered) {
            this.tooltipVisible = true;
            this.context.set(true);
            this.entry?.showTooltip(true);
        }
    }
    async onStateChange(startup = false) {
        this.pendingShow.clear();
        if (ACTIONABLE_STATES.includes(this.state.type)) {
            await this.setContextWhenChatIdle(true);
        }
        else {
            this.context.set(false);
        }
        if (this.tooltipVisible || !await this.hostService.hadLastFocus()) {
            this.tooltip.renderState(this.state);
            return;
        }
        let showTooltip = startup && this.detectVersionChange();
        if (showTooltip && this.configurationService.getValue('update.showPostInstallInfo') !== false) {
            showTooltip = await this.tooltip.renderPostInstall();
        }
        else {
            this.tooltip.renderState(this.state);
            switch (this.state.type) {
                case "disabled" /* StateType.Disabled */:
                    if (startup) {
                        const reason = this.state.reason;
                        showTooltip = reason === 5 /* DisablementReason.InvalidConfiguration */ || reason === 6 /* DisablementReason.RunningAsAdmin */;
                    }
                    break;
                case "idle" /* StateType.Idle */:
                    showTooltip = !!this.state.error;
                    break;
                case "downloading" /* StateType.Downloading */:
                case "updating" /* StateType.Updating */:
                case "overwriting" /* StateType.Overwriting */:
                    this.context.set(this.state.explicit);
                    break;
                case "restarting" /* StateType.Restarting */:
                    this.context.set(true);
                    break;
            }
        }
        if (showTooltip) {
            this.tooltipVisible = true;
            this.context.set(true);
            this.entry?.showTooltip();
        }
    }
    async setContextWhenChatIdle(value) {
        if (!this.chatService.requestInProgressObs.get()) {
            this.context.set(value);
            return;
        }
        const cts = new CancellationTokenSource();
        this.pendingShow.value = toDisposable(() => cts.dispose(true));
        try {
            await waitForState(this.chatService.requestInProgressObs, inProgress => !inProgress, undefined, cts.token);
            this.context.set(value);
        }
        catch {
            // cancelled — a newer state change superseded this one
        }
    }
    detectVersionChange() {
        let from;
        try {
            from = this.storageService.getObject(LAST_KNOWN_VERSION_KEY, -1 /* StorageScope.APPLICATION */);
        }
        catch { }
        const to = {
            version: this.productService.version,
            commit: this.productService.commit,
            timestamp: Date.now(),
        };
        if (from?.commit === to.commit) {
            return false;
        }
        this.storageService.store(LAST_KNOWN_VERSION_KEY, JSON.stringify(to), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        if (from) {
            return isMajorMinorVersionChange(from.version, to.version);
        }
        return false;
    }
};
UpdateTitleBarContribution = __decorate([
    __param(0, IActionViewItemService),
    __param(1, IChatService),
    __param(2, IConfigurationService),
    __param(3, IContextKeyService),
    __param(4, IHostService),
    __param(5, IInstantiationService),
    __param(6, IProductService),
    __param(7, IStorageService),
    __param(8, IUpdateService)
], UpdateTitleBarContribution);
export { UpdateTitleBarContribution };
/**
 * Custom action view item for the update indicator in the title bar.
 */
let UpdateTitleBarEntry = class UpdateTitleBarEntry extends BaseActionViewItem {
    constructor(action, options, tooltip, onUserDismissedTooltip, commandService, hoverService, telemetryService, updateService) {
        super(undefined, action, options);
        this.tooltip = tooltip;
        this.onUserDismissedTooltip = onUserDismissedTooltip;
        this.commandService = commandService;
        this.hoverService = hoverService;
        this.telemetryService = telemetryService;
        this.updateService = updateService;
        this.showTooltipOnRender = false;
        this.action.run = () => this.runAction();
        this._register(this.updateService.onStateChange(state => this.onStateChange(state)));
    }
    render(container) {
        super.render(container);
        this.content = dom.append(container, dom.$('.update-indicator'));
        this.updateTooltip();
        this.onStateChange(this.updateService.state);
        if (this.showTooltipOnRender) {
            this.showTooltipOnRender = false;
            dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => this.showTooltip());
        }
    }
    showTooltip(focus = false) {
        if (!this.element?.isConnected) {
            this.showTooltipOnRender = true;
            return;
        }
        this.hoverService.showInstantHover({
            content: this.tooltip.domNode,
            target: {
                targetElements: [this.element],
                dispose: () => {
                    if (!!this.element?.isConnected) {
                        this.onUserDismissedTooltip();
                    }
                }
            },
            persistence: { sticky: true },
            appearance: { showPointer: true, compact: true },
        }, focus);
    }
    getHoverContents() {
        return this.tooltip.domNode;
    }
    async runAction() {
        let commandId;
        switch (this.updateService.state.type) {
            case "available for download" /* StateType.AvailableForDownload */:
                commandId = 'update.downloadNow';
                break;
            case "downloaded" /* StateType.Downloaded */:
                commandId = 'update.install';
                break;
            case "ready" /* StateType.Ready */:
                commandId = 'update.restart';
                break;
            default:
                this.showTooltip(true);
                return;
        }
        this.telemetryService.publicLog2('workbenchActionExecuted', { id: commandId, from: 'titlebar' });
        await this.commandService.executeCommand(commandId);
    }
    onStateChange(state) {
        if (!this.content) {
            return;
        }
        dom.clearNode(this.content);
        this.content.classList.remove('prominent', 'progress-indefinite', 'progress-percent', 'update-disabled');
        this.content.style.removeProperty('--update-progress');
        const label = dom.append(this.content, dom.$('.indicator-label'));
        switch (state.type) {
            case "disabled" /* StateType.Disabled */:
                label.textContent = localize('updateIndicator.update', "Update");
                this.content.classList.add('update-disabled');
                break;
            case "checking for updates" /* StateType.CheckingForUpdates */:
                label.textContent = localize('updateIndicator.checking', "Checking...");
                this.renderProgressState(this.content);
                break;
            case "overwriting" /* StateType.Overwriting */:
                label.textContent = localize('updateIndicator.overwriting', "Updating...");
                this.renderProgressState(this.content);
                break;
            case "available for download" /* StateType.AvailableForDownload */:
            case "downloaded" /* StateType.Downloaded */:
            case "ready" /* StateType.Ready */:
                label.textContent = localize('updateIndicator.update', "Update");
                this.content.classList.add('prominent');
                break;
            case "downloading" /* StateType.Downloading */:
                label.textContent = localize('updateIndicator.downloading', "Downloading...");
                this.renderProgressState(this.content, computeProgressPercent(state.downloadedBytes, state.totalBytes));
                break;
            case "updating" /* StateType.Updating */:
                label.textContent = localize('updateIndicator.installing', "Installing...");
                this.renderProgressState(this.content, computeProgressPercent(state.currentProgress, state.maxProgress));
                break;
            case "restarting" /* StateType.Restarting */:
                label.textContent = localize('updateIndicator.restarting', "Restarting...");
                this.renderProgressState(this.content);
                break;
            default:
                label.textContent = localize('updateIndicator.update', "Update");
                break;
        }
    }
    renderProgressState(content, percentage) {
        if (percentage !== undefined) {
            content.classList.add('progress-percent');
            content.style.setProperty('--update-progress', `${percentage}%`);
        }
        else {
            content.classList.add('progress-indefinite');
        }
    }
};
UpdateTitleBarEntry = __decorate([
    __param(4, ICommandService),
    __param(5, IHoverService),
    __param(6, ITelemetryService),
    __param(7, IUpdateService)
], UpdateTitleBarEntry);
export { UpdateTitleBarEntry };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlVGl0bGVCYXJFbnRyeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3VwZGF0ZS9icm93c2VyL3VwZGF0ZVRpdGxlQmFyRW50cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsa0JBQWtCLEVBQThCLE1BQU0sMERBQTBELENBQUM7QUFHMUgsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNyRyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEgsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxP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