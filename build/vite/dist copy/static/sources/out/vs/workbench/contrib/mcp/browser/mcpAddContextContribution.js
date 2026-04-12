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
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatContextPickService } from '../../chat/browser/attachments/chatContextPickService.js';
import { IMcpService } from '../common/mcpTypes.js';
import { McpResourcePickHelper } from './mcpResourceQuickAccess.js';
let McpAddContextContribution = class McpAddContextContribution extends Disposable {
    constructor(_chatContextPickService, _instantiationService, mcpService) {
        super();
        this._chatContextPickService = _chatContextPickService;
        this._instantiationService = _instantiationService;
        this._addContextMenu = this._register(new MutableDisposable());
        const hasServersWithResources = derived(reader => {
            let enabled = false;
            for (const server of mcpService.servers.read(reader)) {
                const cap = server.capabilities.read(undefined);
                if (cap === undefined) {
                    enabled = true; // until we know more
                }
                else if (cap & 16 /* McpCapability.Resources */) {
                    enabled = true;
                    break;
                }
            }
            return enabled;
        });
        this._register(autorun(reader => {
            const enabled = hasServersWithResources.read(reader);
            if (enabled && !this._addContextMenu.value) {
                this._registerAddContextMenu();
            }
            else {
                this._addContextMenu.clear();
            }
        }));
    }
    _registerAddContextMenu() {
        this._addContextMenu.value = this._chatContextPickService.registerChatContextItem({
            type: 'pickerPick',
            label: localize('mcp.addContext', "MCP Resources..."),
            icon: Codicon.mcp,
            isEnabled(widget) {
                return !!widget.attachmentCapabilities.supportsMCPAttachments;
            },
            asPicker: () => {
                const helper = this._instantiationService.createInstance(McpResourcePickHelper);
                return {
                    placeholder: localize('mcp.addContext.placeholder', "Select MCP Resource..."),
                    picks: (_query, token) => this._getResourcePicks(token, helper),
                    goBack: () => {
                        return helper.navigateBack();
                    },
                    dispose: () => {
                        helper.dispose();
                    }
                };
            },
        });
    }
    _getResourcePicks(token, helper) {
        const picksObservable = helper.getPicks(token);
        return derived(this, reader => {
            const pickItems = picksObservable.read(reader);
            const picks = [];
            for (const [server, resources] of pickItems.picks) {
                if (resources.length === 0) {
                    continue;
                }
                picks.push(McpResourcePickHelper.sep(server));
                for (const resource of resources) {
                    picks.push({
                        ...McpResourcePickHelper.item(resource),
                        asAttachment: () => helper.toAttachment(resource, server)
                    });
                }
            }
            return { picks, busy: pickItems.isBusy };
        });
    }
};
McpAddContextContribution = __decorate([
    __param(0, IChatContextPickService),
    __param(1, IInstantiationService),
    __param(2, IMcpService)
], McpAddContextContribution);
export { McpAddContextContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwQWRkQ29udGV4dENvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcEFkZENvbnRleHRDb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRixPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVuRyxPQUFPLEVBQW1CLHVCQUF1QixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDcEgsT0FBTyxFQUFFLFdBQVcsRUFBaUIsTUFBTSx1QkFBdUIsQ0FBQztBQUNuRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUU3RCxJQUFNLHlCQUF5QixHQUEvQixNQUFNLHlCQUEwQixTQUFRLFVBQVU7SUFFeEQsWUFDMEIsdUJBQWlFLEVBQ25FLHFCQUE2RCxFQUN2RSxVQUF1QjtRQUVwQyxLQUFLLEVBQUUsQ0FBQztRQUprQyw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQXlCO1FBQ2xELDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFIcEUsb0JBQWUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FBUTFFLE1BQU0sdUJBQXVCLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ2hELElBQUks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