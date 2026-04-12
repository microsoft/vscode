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
import { Codicon } from '../../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IPreferencesService } from '../../../../../services/preferences/common/preferences.js';
import { ChatConfiguration } from '../../constants.js';
import { extractUrlPatterns, getPatternLabel, isUrlApproved } from './chatUrlFetchingPatterns.js';
const trashButton = {
    iconClass: ThemeIcon.asClassName(Codicon.trash),
    tooltip: localize('delete', "Delete")
};
let ChatUrlFetchingConfirmationContribution = class ChatUrlFetchingConfirmationContribution {
    constructor(_getURLS, _configurationService, _quickInputService, _preferencesService) {
        this._getURLS = _getURLS;
        this._configurationService = _configurationService;
        this._quickInputService = _quickInputService;
        this._preferencesService = _preferencesService;
        this.canUseDefaultApprovals = false;
    }
    getPreConfirmAction(ref) {
        return this._checkApproval(ref, true);
    }
    getPostConfirmAction(ref) {
        return this._checkApproval(ref, false);
    }
    _checkApproval(ref, checkRequest) {
        const urls = this._getURLS(ref.parameters);
        if (!urls || urls.length === 0) {
            return undefined;
        }
        const approvedUrls = this._getApprovedUrls();
        // Check if all URLs are approved
        const allApproved = urls.every(url => {
            try {
                const uri = URI.parse(url);
                return isUrlApproved(uri, approvedUrls, checkRequest);
            }
            catch {
                return false;
            }
        });
        if (allApproved) {
            return {
                type: 2 /* ToolConfirmKind.Setting */,
                id: ChatConfiguration.AutoApprovedUrls
            };
        }
        return undefined;
    }
    getPreConfirmActions(ref) {
        return this._getConfirmActions(ref, true);
    }
    getPostConfirmActions(ref) {
        return this._getConfirmActions(ref, false);
    }
    _getConfirmActions(ref, forRequest) {
        const urls = this._getURLS(ref.parameters);
        if (!urls || urls.length === 0) {
            return [];
        }
        //remove query strings
        const urlsWithoutQuery = urls.map(u => u.split('?')[0]);
        const actions = [];
        // Get unique URLs (may have duplicates)
        const uniqueUrls = Array.from(new Set(urlsWithoutQuery)).map(u => URI.parse(u));
        // For each URL, get its patterns
        const urlPatterns = new ResourceMap(uniqueUrls.map(u => [u, extractUrlPatterns(u)]));
        // If only one URL, show quick actions for specific patterns
        if (urlPatterns.size === 1) {
            const uri = uniqueUrls[0];
            const patterns = urlPatterns.get(uri);
            // Show top 2 most relevant patterns as quick actions
            const topPatterns = patterns.slice(0, 2);
            for (const pattern of topPatterns) {
                const patternLabel = getPatternLabel(uri, pattern);
                actions.push({
                    label: forRequest
                        ? localize('approveRequestTo', "Allow requests to {0}", patternLabel)
                        : localize('approveResponseFrom', "Allow responses from {0}", patternLabel),
                    select: async () => {
                        await this._approvePattern(pattern, forRequest, !forRequest);
                        return true;
                    }
                });
            }
            // "More options" action
            actions.push({
                label: localize('moreOptions', "Allow requests to..."),
                select: async () => {
                    const result = await this._showMoreOptions(ref, [{ uri, patterns }], forRequest);
                    return result;
                }
            });
        }
        else {
            // Multiple URLs - show "More options" only
            actions.push({
                label: localize('moreOptionsMultiple', "Configure URL Approvals..."),
                select: async () => {
                    await this._showMoreOptions(ref, [...urlPatterns].map(([uri, patterns]) => ({ uri, patterns })), forRequest);
                    return true;
                }
            });
        }
        return actions;
    }
    async _showMoreOptions(ref, urls, forRequest) {
        return new Promise((resolve) => {
            const disposables = new DisposableStore();
            const quickTree = disposables.add(this._quickInputService.createQuickTree());
            quickTree.ignoreFocusOut = true;
            quickTree.sortByLabel = false;
            quickTree.placeholder = localize('selectApproval', "Select URL pattern to approve");
            const treeItems = [];
            const approvedUrls = this._getApprovedUrls();
            const dedupedPatterns = new Set();
            for (const { uri, patterns } of urls) {
                for (const pattern of patterns.slice().sort((a, b) => b.length - a.length)) {
                    if (dedupedPatterns.has(pattern)) {
                        continue;
                    }
                    dedupedPatterns.add(pattern);
                    const settings = approvedUrls[pattern];
                    const requestChecked = typeof settings === 'boolean' ? settings : (settings?.approveRequest ?? false);
                    const responseChecked = typeof settings === 'boolean' ? settings : (settings?.approveResponse ?? false);
                    treeItems.push({
                        label: getPatternLabel(uri, pattern),
                        pattern,
                        checked: requestChecked && responseChecked ? true : (!requestChecked && !responseChecked ? false : 'mixed'),
                        collapsed: true,
                        children: [
                            {
                                label: localize('allowRequestsCheckbox', "Make requests without confirmation"),
                                pattern,
                                approvalType: 'request',
                                checked: requestChecked
                            },
                            {
                                label: localize('allowResponsesCheckbox', "Allow responses without confirmation"),
                                pattern,
                                approvalType: 'response',
                                checked: responseChecked
                            }
                        ],
                    });
                }
            }
            quickTree.setItemTree(treeItems);
            const updateApprovals = () => {
                const current = { ...this._getApprovedUrls() };
                for (const item of quickTree.itemTree) {
                    // root-level items
                    const allowPre = item.children?.find(c => c.approvalType === 'request')?.checked;
                    const allowPost = item.children?.find(c => c.approvalType === 'response')?.checked;
                    if (allowPost && allowPre) {
                        current[item.pattern] = true;
                    }
                    else if (!allowPost && !allowPre) {
                        delete current[item.pattern];
                    }
                    else {
                        current[item.pattern] = {
                            approveRequest: !!allowPre || undefined,
                            approveResponse: !!allowPost || undefined,
                        };
                    }
                }
                return this._configurationService.updateValue(ChatConfiguration.AutoApprovedUrls, current);
            };
            disposables.add(quickTree.onDidAccept(async () => {
                quickTree.busy = true;
                await updateApprovals();
                resolve(!!this._checkApproval(ref, forRequest));
                quickTree.hide();
            }));
            disposables.add(quickTree.onDidHide(() => {
                updateApprovals();
                disposables.dispose();
                resolve(false);
            }));
            quickTree.show();
        });
    }
    async _approvePattern(pattern, approveRequest, approveResponse) {
        const approvedUrls = { ...this._getApprovedUrls() };
        // Merge with existing settings for this pattern
        const existingSettings = approvedUrls[pattern];
        let existingRequest = false;
        let existingResponse = false;
        if (typeof existingSettings === 'boolean') {
            existingRequest = existingSettings;
            existingResponse = existingSettings;
        }
        else if (existingSettings) {
            existingRequest = existingSettings.approveRequest ?? false;
            existingResponse = existingSettings.approveResponse ?? false;
        }
        const mergedRequest = approveRequest || existingRequest;
        const mergedResponse = approveResponse || existingResponse;
        // Create the approval settings
        let value;
        if (mergedRequest === mergedResponse) {
            value = mergedRequest;
        }
        else {
            value = { approveRequest: mergedRequest, approveResponse: mergedResponse };
        }
        approvedUrls[pattern] = value;
        await this._configurationService.updateValue(ChatConfiguration.AutoApprovedUrls, approvedUrls);
    }
    getManageActions() {
        const approvedUrls = { ...this._getApprovedUrls() };
        const items = [];
        for (const [pattern, settings] of Object.entries(approvedUrls)) {
            const label = pattern;
            let description;
            if (typeof settings === 'boolean') {
                description = settings
                    ? localize('approveAll', "Approve all")
                    : localize('denyAll', "Deny all");
            }
            else {
                const parts = [];
                if (settings.approveRequest) {
                    parts.push(localize('requests', "requests"));
                }
                if (settings.approveResponse) {
                    parts.push(localize('responses', "responses"));
                }
                description = parts.length > 0
                    ? localize('approves', "Approves {0}", parts.join(', '))
                    : localize('noApprovals', "No approvals");
            }
            const item = {
                label,
                description,
                buttons: [trashButton],
                checked: true,
                onDidChangeChecked: (checked) => {
                    if (checked) {
                        approvedUrls[pattern] = settings;
                    }
                    else {
                        delete approvedUrls[pattern];
                    }
                    this._configurationService.updateValue(ChatConfiguration.AutoApprovedUrls, approvedUrls);
                }
            };
            items.push(item);
        }
        items.push({
            pickable: false,
            label: localize('moreOptionsManage', "More Options..."),
            description: localize('openSettings', "Open settings"),
            onDidOpen: () => {
                this._preferencesService.openUserSettings({ query: ChatConfiguration.AutoApprovedUrls });
            }
        });
        return items;
    }
    async reset() {
        await this._configurationService.updateValue(ChatConfiguration.AutoApprovedUrls, {});
    }
    _getApprovedUrls() {
        return this._configurationService.getValue(ChatConfiguration.AutoApprovedUrls) || {};
    }
};
ChatUrlFetchingConfirmationContribution = __decorate([
    __param(1, IConfigurationService),
    __param(2, IQuickInputService),
    __param(3, IPreferencesService)
], ChatUrlFetchingConfirmationContribution);
export { ChatUrlFetchingConfirmationContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFVybEZldGNoaW5nQ29uZmlybWF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL2NoYXRVcmxGZXRjaGluZ0NvbmZpcm1hdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQXFCLGtCQUFrQixFQUFrQixNQUFNLDREQUE0RCxDQUFDO0FBQ25JLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBT3ZELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxlQUFlLEVBQUUsYUFBYSxFQUF3QixNQUFNLDhCQUE4QixDQUFDO0FBRXhILE1BQU0sV0FBVyxHQUFzQjtJQUN0QyxTQUFTLEVBQUUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO0lBQy9DLE9BQU8sRUFBRSxRQUFRLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQztDQUNyQyxDQUFDO0FBRUssSUFB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