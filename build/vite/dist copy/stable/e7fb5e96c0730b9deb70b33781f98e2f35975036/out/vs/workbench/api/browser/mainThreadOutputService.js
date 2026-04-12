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
var MainThreadOutputService_1;
import { Registry } from '../../../platform/registry/common/platform.js';
import { Extensions, IOutputService, OUTPUT_VIEW_ID, OutputChannelUpdateMode } from '../../services/output/common/output.js';
import { MainContext, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { URI } from '../../../base/common/uri.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Event } from '../../../base/common/event.js';
import { IViewsService } from '../../services/views/common/viewsService.js';
import { isNumber } from '../../../base/common/types.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IStatusbarService } from '../../services/statusbar/browser/statusbar.js';
import { localize } from '../../../nls.js';
let MainThreadOutputService = class MainThreadOutputService extends Disposable {
    static { MainThreadOutputService_1 = this; }
    static { this._extensionIdPool = new Map(); }
    constructor(extHostContext, outputService, viewsService, configurationService, statusbarService) {
        super();
        this._outputStatusItem = this._register(new MutableDisposable());
        this._outputService = outputService;
        this._viewsService = viewsService;
        this._configurationService = configurationService;
        this._statusbarService = statusbarService;
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostOutputService);
        const setVisibleChannel = () => {
            const visibleChannel = this._viewsService.isViewVisible(OUTPUT_VIEW_ID) ? this._outputService.getActiveChannel() : undefined;
            this._proxy.$setVisibleChannel(visibleChannel ? visibleChannel.id : null);
            this._outputStatusItem.value = undefined;
        };
        this._register(Event.any(this._outputService.onActiveOutputChannel, Event.filter(this._viewsService.onDidChangeViewVisibility, ({ id }) => id === OUTPUT_VIEW_ID))(() => setVisibleChannel()));
        setVisibleChannel();
    }
    async $register(label, file, languageId, extensionId) {
        const idCounter = (MainThreadOutputService_1._extensionIdPool.get(extensionId) || 0) + 1;
        MainThreadOutputService_1._extensionIdPool.set(extensionId, idCounter);
        const id = `extension-output-${extensionId}-#${idCounter}-${label}`;
        const resource = URI.revive(file);
        Registry.as(Extensions.OutputChannels).registerChannel({ id, label, source: { resource }, log: false, languageId, extensionId });
        this._register(toDisposable(() => this.$dispose(id)));
        return id;
    }
    async $update(channelId, mode, till) {
        const channel = this._getChannel(channelId);
        if (channel) {
            if (mode === OutputChannelUpdateMode.Append) {
                channel.update(mode);
            }
            else if (isNumber(till)) {
                channel.update(mode, till);
            }
        }
    }
    async $reveal(channelId, preserveFocus) {
        const channel = this._getChannel(channelId);
        if (!channel) {
            return;
        }
        const viewsToShowQuietly = this._configurationService.getValue('workbench.view.showQuietly') ?? {};
        if (!this._viewsService.isViewVisible(OUTPUT_VIEW_ID) && viewsToShowQuietly[OUTPUT_VIEW_ID]) {
            this._showChannelQuietly(channel);
            return;
        }
        this._outputService.showChannel(channel.id, preserveFocus);
    }
    // Show status bar indicator
    _showChannelQuietly(channel) {
        const statusProperties = {
            name: localize('status.showOutput', "Show Output"),
            text: '$(output)',
            ariaLabel: localize('status.showOutputAria', "Show {0} Output Channel", channel.label),
            command: `workbench.action.output.show.${channel.id}`,
            tooltip: localize('status.showOutputTooltip', "Show {0} Output Channel", channel.label),
            kind: 'prominent'
        };
        if (!this._outputStatusItem.value) {
            this._outputStatusItem.value = this._statusbarService.addEntry(statusProperties, 'status.view.showQuietly', 1 /* StatusbarAlignment.RIGHT */, { location: { id: 'status.notifications', priority: Number.NEGATIVE_INFINITY }, alignment: 0 /* StatusbarAlignment.LEFT */ });
        }
        else {
            this._outputStatusItem.value.update(statusProperties);
        }
    }
    async $close(channelId) {
        if (this._viewsService.isViewVisible(OUTPUT_VIEW_ID)) {
            const activeChannel = this._outputService.getActiveChannel();
            if (activeChannel && channelId === activeChannel.id) {
                this._viewsService.closeView(OUTPUT_VIEW_ID);
            }
        }
    }
    async $dispose(channelId) {
        const channel = this._getChannel(channelId);
        channel?.dispose();
    }
    _getChannel(channelId) {
        return this._outputService.getChannel(channelId);
    }
};
MainThreadOutputService = MainThreadOutputService_1 = __decorate([
    extHostNamedCustomer(MainContext.MainThreadOutputService),
    __param(1, IOutputService),
    __param(2, IViewsService),
    __param(3, IConfigurationService),
    __param(4, IStatusbarService)
], MainThreadOutputService);
export { MainThreadOutputService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZE91dHB1dFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZE91dHB1dFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsVUFBVSxFQUEwQixjQUFjLEVBQWtCLGNBQWMsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JLLE9BQU8sRUFBZ0MsV0FBVyxFQUE2QixjQUFjLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNySSxPQUFPLEVBQUUsb0JBQW9CLEVBQW1CLE1BQU0sc0RBQXNELENBQUM7QUFDN0csT0FBTyxFQUFpQixHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBNEMsaUJBQWlCLEVBQXNCLE1BQU0sK0NBQStDLENBQUM7QUFDaEosT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBR3BDLElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXdCLFNBQVEsVUFBVTs7YUFFdkMscUJBQWdCLEdBQUcsSUFBSSxHQUFHLEVBQWtCLEFBQTVCLENB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