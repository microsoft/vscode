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
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { isLinux } from '../../../../base/common/platform.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IEncryptionService, isGnome, isKwallet } from '../../../../platform/encryption/common/encryptionService.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { BaseSecretStorageService, ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IJSONEditingService } from '../../configuration/common/jsonEditing.js';
let NativeSecretStorageService = class NativeSecretStorageService extends BaseSecretStorageService {
    constructor(_notificationService, _dialogService, _openerService, _jsonEditingService, _environmentService, storageService, encryptionService, logService) {
        super(!!_environmentService.useInMemorySecretStorage, storageService, encryptionService, logService);
        this._notificationService = _notificationService;
        this._dialogService = _dialogService;
        this._openerService = _openerService;
        this._jsonEditingService = _jsonEditingService;
        this._environmentService = _environmentService;
        this.notifyOfNoEncryptionOnce = createSingleCallFunction(() => this.notifyOfNoEncryption());
    }
    set(key, value) {
        this._sequencer.queue(key, async () => {
            await this.resolvedStorageService;
            if (this.type !== 'persisted' && !this._environmentService.useInMemorySecretStorage) {
                this._logService.trace('[NativeSecretStorageService] Notifying user that secrets are not being stored on disk.');
                await this.notifyOfNoEncryptionOnce();
            }
        });
        return super.set(key, value);
    }
    async notifyOfNoEncryption() {
        const buttons = [];
        const troubleshootingButton = {
            label: localize('troubleshootingButton', "Open troubleshooting guide"),
            run: () => this._openerService.open('https://go.microsoft.com/fwlink/?linkid=2239490'),
            // doesn't close dialogs
            keepOpen: true
        };
        buttons.push(troubleshootingButton);
        let errorMessage = localize('encryptionNotAvailableJustTroubleshootingGuide', "An OS keyring couldn't be identified for storing the encryption related data in your current desktop environment.");
        if (!isLinux) {
            this._notificationService.prompt(Severity.Error, errorMessage, buttons);
            return;
        }
        const provider = await this._encryptionService.getKeyStorageProvider();
        if (provider === "basic_text" /* KnownStorageProvider.basicText */) {
            const detail = localize('usePlainTextExtraSentence', "Open the troubleshooting guide to address this or you can use weaker encryption that doesn't use the OS keyring.");
            const usePlainTextButton = {
                label: localize('usePlainText', "Use weaker encryption"),
                run: async () => {
                    await this._encryptionService.setUsePlainTextEncryption();
                    await this._jsonEditingService.write(this._environmentService.argvResource, [{ path: ['password-store'], value: "basic" /* PasswordStoreCLIOption.basic */ }], true);
                    this.reinitialize();
                }
            };
            buttons.unshift(usePlainTextButton);
            await this._dialogService.prompt({
                type: 'error',
                buttons,
                message: errorMessage,
                detail
            });
            return;
        }
        if (isGnome(provider)) {
            errorMessage = localize('isGnome', "You're running in a GNOME environment but the OS keyring is not available for encryption. Ensure you have gnome-keyring or another libsecret compatible implementation installed and running.");
        }
        else if (isKwallet(provider)) {
            errorMessage = localize('isKwallet', "You're running in a KDE environment but the OS keyring is not available for encryption. Ensure you have kwallet running.");
        }
        this._notificationService.prompt(Severity.Error, errorMessage, buttons);
    }
};
NativeSecretStorageService = __decorate([
    __param(0, INotificationService),
    __param(1, IDialogService),
    __param(2, IOpenerService),
    __param(3, IJSONEditingService),
    __param(4, INativeEnvironmentService),
    __param(5, IStorageService),
    __param(6, IEncryptionService),
    __param(7, ILogService)
], NativeSecretStorageService);
export { NativeSecretStorageService };
registerSingleton(ISecretStorageService, NativeSecretStorageService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjcmV0U3RvcmFnZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VjcmV0cy9lbGVjdHJvbi1icm93c2VyL3NlY3JldFN0b3JhZ2VTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxrQkFBa0IsRUFBZ0QsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ25LLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ25HLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLG9CQUFvQixFQUFpQixNQUFNLDBEQUEwRCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqSCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFekUsSUFBTSwwQkFBMEIsR0FBaEMsTUFB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