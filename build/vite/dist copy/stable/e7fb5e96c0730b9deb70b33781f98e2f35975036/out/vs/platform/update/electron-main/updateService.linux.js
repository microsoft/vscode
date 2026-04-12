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
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IMeteredConnectionService } from '../../meteredConnection/common/meteredConnection.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, IRequestService } from '../../request/common/request.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { State } from '../common/update.js';
import { AbstractUpdateService, createUpdateURL } from './abstractUpdateService.js';
let LinuxUpdateService = class LinuxUpdateService extends AbstractUpdateService {
    constructor(lifecycleMainService, configurationService, environmentMainService, requestService, logService, nativeHostMainService, productService, telemetryService, applicationStorageMainService, meteredConnectionService) {
        super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService, telemetryService, applicationStorageMainService, meteredConnectionService, false);
        this.nativeHostMainService = nativeHostMainService;
    }
    buildUpdateFeedUrl(quality, commit, options) {
        return createUpdateURL(this.productService.updateUrl, `linux-${process.arch}`, quality, commit, options);
    }
    doCheckForUpdates(explicit, _pendingCommit) {
        if (!this.quality) {
            return;
        }
        const internalOrg = this.getInternalOrg();
        const background = !explicit && !internalOrg;
        const url = this.buildUpdateFeedUrl(this.quality, this.productService.commit, { background, internalOrg });
        this.setState(State.CheckingForUpdates(explicit));
        this.requestService.request({ url, callSite: 'updateService.linux.checkForUpdates' }, CancellationToken.None)
            .then(asJson)
            .then(update => {
            if (!update || !update.url || !update.version || !update.productVersion) {
                this.setState(State.Idle(1 /* UpdateType.Archive */, undefined, explicit || undefined));
            }
            else {
                this.setState(State.AvailableForDownload(update));
            }
        })
            .then(undefined, err => {
            this.logService.error(err);
            // only show message when explicitly checking for updates
            const message = explicit ? (err.message || err) : undefined;
            this.setState(State.Idle(1 /* UpdateType.Archive */, message));
        });
    }
    async doDownloadUpdate(state) {
        // Use the download URL if available as we don't currently detect the package type that was
        // installed and the website download page is more useful than the tarball generally.
        if (this.productService.downloadUrl && this.productService.downloadUrl.length > 0) {
            this.nativeHostMainService.openExternal(undefined, this.productService.downloadUrl);
        }
        else if (state.update.url) {
            this.nativeHostMainService.openExternal(undefined, state.update.url);
        }
        this.setState(State.Idle(1 /* UpdateType.Archive */));
    }
};
LinuxUpdateService = __decorate([
    __param(0, ILifecycleMainService),
    __param(1, IConfigurationService),
    __param(2, IEnvironmentMainService),
    __param(3, IRequestService),
    __param(4, ILogService),
    __param(5, INativeHostMainService),
    __param(6, IProductService),
    __param(7, ITelemetryService),
    __param(8, IApplicationStorageMainService),
    __param(9, IMeteredConnectionService)
], LinuxUpdateService);
export { LinuxUpdateService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlU2VydmljZS5saW51eC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VwZGF0ZS9lbGVjdHJvbi1tYWluL3VwZGF0ZVNlcnZpY2UubGludXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDcEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDOUYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3RELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3hFLE9BQU8sRUFBaUMsS0FBSyxFQUFjLE1BQU0scUJBQXFCLENBQUM7QUFDdkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLGVBQWUsRUFBcUIsTUFBTSw0QkFBNEIsQ0FBQztBQUVoRyxJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFtQixTQUFRLHFCQUFxQjtJQUU1RCxZQUN3QixvQkFBMkMsRUFDM0Msb0JBQTJDLEVBQ3pD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