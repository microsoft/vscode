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
import { IRemoteAgentService, remoteConnectionLatencyMeasurer } from '../../../services/remote/common/remoteAgentService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { localize } from '../../../../nls.js';
import { isWeb } from '../../../../base/common/platform.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { getRemoteName, getRemoteServerRootPath } from '../../../../platform/remote/common/remoteHosts.js';
import { IBannerService } from '../../../services/banner/browser/bannerService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { Codicon } from '../../../../base/common/codicons.js';
import Severity from '../../../../base/common/severity.js';
const REMOTE_UNSUPPORTED_CONNECTION_CHOICE_KEY = 'remote.unsupportedConnectionChoice';
const BANNER_REMOTE_UNSUPPORTED_CONNECTION_DISMISSED_KEY = 'workbench.banner.remote.unsupportedConnection.dismissed';
let InitialRemoteConnectionHealthContribution = class InitialRemoteConnectionHealthContribution {
    constructor(_remoteAgentService, _environmentService, _telemetryService, bannerService, dialogService, openerService, hostService, storageService, productService) {
        this._remoteAgentService = _remoteAgentService;
        this._environmentService = _environmentService;
        this._telemetryService = _telemetryService;
        this.bannerService = bannerService;
        this.dialogService = dialogService;
        this.openerService = openerService;
        this.hostService = hostService;
        this.storageService = storageService;
        this.productService = productService;
        if (this._environmentService.remoteAuthority) {
            this._checkInitialRemoteConnectionHealth();
        }
    }
    async _confirmConnection() {
        let ConnectionChoice;
        (function (ConnectionChoice) {
            ConnectionChoice[ConnectionChoice["Allow"] = 1] = "Allow";
            ConnectionChoice[ConnectionChoice["LearnMore"] = 2] = "LearnMore";
            ConnectionChoice[ConnectionChoice["Cancel"] = 0] = "Cancel";
        })(ConnectionChoice || (ConnectionChoice = {}));
        const { result, checkboxChecked } = await this.dialogService.prompt({
            type: Severity.Warning,
            message: localize('unsupportedGlibcWarning', "You are about to connect to an OS version that is unsupported by {0}.", this.productService.nameLong),
            buttons: [
                {
                    label: localize({ key: 'allow', comment: ['&& denotes a mnemonic'] }, "&&Allow"),
                    run: () => 1 /* ConnectionChoice.Allow */
                },
                {
                    label: localize({ key: 'learnMore', comment: ['&& denotes a mnemonic'] }, "&&Learn More"),
                    run: async () => { await this.openerService.open('https://aka.ms/vscode-remote/faq/old-linux'); return 2 /* ConnectionChoice.LearnMore */; }
                }
            ],
            cancelButton: {
                run: () => 0 /* ConnectionChoice.Cancel */
            },
            checkbox: {
                label: localize('remember', "Do not show again"),
            }
        });
        if (result === 2 /* ConnectionChoice.LearnMore */) {
            return await this._confirmConnection();
        }
        const allowed = result === 1 /* ConnectionChoice.Allow */;
        if (allowed && checkboxChecked) {
            this.storageService.store(`${REMOTE_UNSUPPORTED_CONNECTION_CHOICE_KEY}.${this._environmentService.remoteAuthority}`, allowed, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        }
        return allowed;
    }
    async _checkInitialRemoteConnectionHealth() {
        try {
            const environment = await this._remoteAgentService.getRawEnvironment();
            if (environment && environment.isUnsupportedGlibc) {
                let allowed = this.storageService.getBoolean(`${REMOTE_UNSUPPORTED_CONNECTION_CHOICE_KEY}.${this._environmentService.remoteAuthority}`, 0 /* StorageScope.PROFILE */);
                if (allowed === undefined) {
                    allowed = await this._confirmConnection();
                }
                if (allowed) {
                    const bannerDismissedVersion = this.storageService.get(`${BANNER_REMOTE_UNSUPPORTED_CONNECTION_DISMISSED_KEY}`, 0 /* StorageScope.PROFILE */) ?? '';
                    // Ignore patch versions and dismiss the banner if the major and minor versions match.
                    const shouldShowBanner = bannerDismissedVersion.slice(0, bannerDismissedVersion.lastIndexOf('.')) !== this.productService.version.slice(0, this.productService.version.lastIndexOf('.'));
                    if (shouldShowBanner) {
                        const actions = [
                            {
                                label: localize('unsupportedGlibcBannerLearnMore', "Learn More"),
                                href: 'https://aka.ms/vscode-remote/faq/old-linux'
                            }
                        ];
                        this.bannerService.show({
                            id: 'unsupportedGlibcWarning.banner',
                            message: localize('unsupportedGlibcWarning.banner', "You are connected to an OS version that is unsupported by {0}.", this.productService.nameLong),
                            actions,
                            icon: Codicon.warning,
                            closeLabel: `Do not show again in v${this.productService.version}`,
                            onClose: () => {
                                this.storageService.store(`${BANNER_REMOTE_UNSUPPORTED_CONNECTION_DISMISSED_KEY}`, this.productService.version, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
                            }
                        });
                    }
                }
                else {
                    this.hostService.openWindow({ forceReuseWindow: true, remoteAuthority: null });
                    return;
                }
            }
            this._telemetryService.publicLog2('remoteConnectionSuccess', {
                web: isWeb,
                connectionTimeMs: await this._remoteAgentService.getConnection()?.getInitialConnectionTimeMs(),
                remoteName: getRemoteName(this._environmentService.remoteAuthority),
                tunnelName: getRemoteServerRootPath(this._environmentService.remoteAuthority)
            });
            await this._measureExtHostLatency();
        }
        catch (err) {
            this._telemetryService.publicLog2('remoteConnectionFailure', {
                web: isWeb,
                connectionTimeMs: await this._remoteAgentService.getConnection()?.getInitialConnectionTimeMs(),
                remoteName: getRemoteName(this._environmentService.remoteAuthority),
                message: err ? err.message : ''
            });
        }
    }
    async _measureExtHostLatency() {
        const measurement = await remoteConnectionLatencyMeasurer.measure(this._remoteAgentService);
        if (measurement === undefined) {
            return;
        }
        this._telemetryService.publicLog2('remoteConnectionLatency', {
            web: isWeb,
            remoteName: getRemoteName(this._environmentService.remoteAuthority),
            latencyMs: measurement.current
        });
    }
};
InitialRemoteConnectionHealthContribution = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, IWorkbenchEnvironmentService),
    __param(2, ITelemetryService),
    __param(3, IBannerService),
    __param(4, IDialogService),
    __param(5, IOpenerService),
    __param(6, IHostService),
    __param(7, IStorageService),
    __param(8, IProductService)
], InitialRemoteConnectionHealthContribution);
export { InitialRemoteConnectionHealthContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQ29ubmVjdGlvbkhlYWx0aC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9icm93c2VyL3JlbW90ZUNvbm5lY3Rpb25IZWFsdGgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLCtCQUErQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDN0gsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDMUcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsYUFBYSxFQUFFLHVCQUF1QixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDM0csT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUczRCxNQUFNLHdDQUF3QyxHQUFHLG9DQUFvQyxDQUFDO0FBQ3RGLE1BQU0sa0RBQWtE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