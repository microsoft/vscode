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
import { Schemas, matchesScheme } from '../../../../base/common/network.js';
import Severity from '../../../../base/common/severity.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { ITrustedDomainService } from './trustedDomainService.js';
import { isURLDomainTrusted } from '../../../../platform/url/common/trustedDomains.js';
import { configureOpenerTrustedDomainsHandler, readStaticTrustedDomains } from './trustedDomains.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
let OpenerValidatorContributions = class OpenerValidatorContributions {
    constructor(_openerService, _storageService, _dialogService, _productService, _quickInputService, _editorService, _clipboardService, _telemetryService, _instantiationService, _configurationService, _workspaceTrustService, _trustedDomainService) {
        this._openerService = _openerService;
        this._storageService = _storageService;
        this._dialogService = _dialogService;
        this._productService = _productService;
        this._quickInputService = _quickInputService;
        this._editorService = _editorService;
        this._clipboardService = _clipboardService;
        this._telemetryService = _telemetryService;
        this._instantiationService = _instantiationService;
        this._configurationService = _configurationService;
        this._workspaceTrustService = _workspaceTrustService;
        this._trustedDomainService = _trustedDomainService;
        this._openerService.registerValidator({ shouldOpen: (uri, options) => this.validateLink(uri, options) });
    }
    async validateLink(resource, openOptions) {
        if (!matchesScheme(resource, Schemas.http) && !matchesScheme(resource, Schemas.https)) {
            return true;
        }
        if (openOptions?.fromWorkspace && this._workspaceTrustService.isWorkspaceTrusted() && !this._configurationService.getValue('workbench.trustedDomains.promptInTrustedWorkspace')) {
            return true;
        }
        const originalResource = resource;
        let resourceUri;
        if (typeof resource === 'string') {
            resourceUri = URI.parse(resource);
        }
        else {
            resourceUri = resource;
        }
        if (this._trustedDomainService.isValid(resourceUri)) {
            return true;
        }
        else {
            const { scheme, authority, path, query, fragment } = resourceUri;
            let formattedLink = `${scheme}://${authority}${path}`;
            const linkTail = `${query ? '?' + query : ''}${fragment ? '#' + fragment : ''}`;
            const remainingLength = Math.max(0, 60 - formattedLink.length);
            const linkTailLengthToKeep = Math.min(Math.max(5, remainingLength), linkTail.length);
            if (linkTailLengthToKeep === linkTail.length) {
                formattedLink += linkTail;
            }
            else {
                // keep the first char ? or #
                // add ... and keep the tail end as much as possible
                formattedLink += linkTail.charAt(0) + '...' + linkTail.substring(linkTail.length - linkTailLengthToKeep + 1);
            }
            const { result } = await this._dialogService.prompt({
                type: Severity.Info,
                message: localize('openExternalLinkAt', 'Do you want {0} to open the external website?', this._productService.nameShort),
                detail: typeof originalResource === 'string' ? originalResource : formattedLink,
                buttons: [
                    {
                        label: localize({ key: 'open', comment: ['&& denotes a mnemonic'] }, '&&Open'),
                        run: () => true
                    },
                    {
                        label: localize({ key: 'copy', comment: ['&& denotes a mnemonic'] }, '&&Copy'),
                        run: () => {
                            this._clipboardService.writeText(typeof originalResource === 'string' ? originalResource : resourceUri.toString(true));
                            return false;
                        }
                    },
                    {
                        label: localize({ key: 'configureTrustedDomains', comment: ['&& denotes a mnemonic'] }, 'Configure &&Trusted Domains'),
                        run: async () => {
                            const { trustedDomains, } = this._instantiationService.invokeFunction(readStaticTrustedDomains);
                            const domainToOpen = `${scheme}://${authority}`;
                            const pickedDomains = await configureOpenerTrustedDomainsHandler(trustedDomains, domainToOpen, resourceUri, this._quickInputService, this._storageService, this._editorService, this._telemetryService);
                            // Trust all domains
                            if (pickedDomains.indexOf('*') !== -1) {
                                return true;
                            }
                            // Trust current domain
                            if (isURLDomainTrusted(resourceUri, pickedDomains)) {
                                return true;
                            }
                            return false;
                        }
                    }
                ],
                cancelButton: {
                    run: () => false
                }
            });
            return result;
        }
    }
};
OpenerValidatorContributions = __decorate([
    __param(0, IOpenerService),
    __param(1, IStorageService),
    __param(2, IDialogService),
    __param(3, IProductService),
    __param(4, IQuickInputService),
    __param(5, IEditorService),
    __param(6, IClipboardService),
    __param(7, ITelemetryService),
    __param(8, IInstantiationService),
    __param(9, IConfigurationService),
    __param(10, IWorkspaceTrustManagementService),
    __param(11, ITrustedDomainService)
], OpenerValidatorContributions);
export { OpenerValidatorContributions };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJ1c3RlZERvbWFpbnNWYWxpZGF0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi91cmwvYnJvd3Nlci90cnVzdGVkRG9tYWluc1ZhbGlkYXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVFLE9BQU8sUUFBUSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQWUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMzRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRTNHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxr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