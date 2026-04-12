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
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { localize } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { allApiProposals } from '../../../../platform/extensions/common/extensionsApiProposals.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { Extensions } from '../../extensionManagement/common/extensionFeatures.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
let ExtensionsProposedApi = class ExtensionsProposedApi {
    constructor(_logService, _environmentService, productService) {
        this._logService = _logService;
        this._environmentService = _environmentService;
        this._envEnabledExtensions = new Set((_environmentService.extensionEnabledProposedApi ?? []).map(id => ExtensionIdentifier.toKey(id)));
        this._envEnablesProposedApiForAll =
            !_environmentService.isBuilt || // always allow proposed API when running out of sources
                (_environmentService.isExtensionDevelopment && productService.quality !== 'stable') || // do not allow proposed API against stable builds when developing an extension
                (this._envEnabledExtensions.size === 0 && Array.isArray(_environmentService.extensionEnabledProposedApi)); // always allow proposed API if --enable-proposed-api is provided without extension ID
        this._productEnabledExtensions = new Map();
        // NEW world - product.json spells out what proposals each extension can use
        if (productService.extensionEnabledApiProposals) {
            for (const [k, value] of Object.entries(productService.extensionEnabledApiProposals)) {
                const key = ExtensionIdentifier.toKey(k);
                const proposalNames = value.filter(name => {
                    if (!allApiProposals[name]) {
                        _logService.warn(`Via 'product.json#extensionEnabledApiProposals' extension '${key}' wants API proposal '${name}' but that proposal DOES NOT EXIST. Likely, the proposal has been finalized (check 'vscode.d.ts') or was abandoned.`);
                        return false;
                    }
                    return true;
                });
                this._productEnabledExtensions.set(key, proposalNames);
            }
        }
    }
    updateEnabledApiProposals(extensions) {
        for (const extension of extensions) {
            this.doUpdateEnabledApiProposals(extension);
        }
    }
    doUpdateEnabledApiProposals(extension) {
        const key = ExtensionIdentifier.toKey(extension.identifier);
        // warn about invalid proposal and remove them from the list
        if (isNonEmptyArray(extension.enabledApiProposals)) {
            extension.enabledApiProposals = extension.enabledApiProposals.filter(name => {
                const result = Boolean(allApiProposals[name]);
                if (!result) {
                    this._logService.error(`Extension '${key}' wants API proposal '${name}' but that proposal DOES NOT EXIST. Likely, the proposal has been finalized (check 'vscode.d.ts') or was abandoned.`);
                }
                return result;
            });
        }
        if (this._productEnabledExtensions.has(key)) {
            // NOTE that proposals that are listed in product.json override whatever is declared in the extension
            // itself. This is needed for us to know what proposals are used "in the wild". Merging product.json-proposals
            // and extension-proposals would break that.
            const productEnabledProposals = this._productEnabledExtensions.get(key);
            // check for difference between product.json-declaration and package.json-declaration
            const productSet = new Set(productEnabledProposals);
            const extensionSet = new Set(extension.enabledApiProposals);
            const diff = new Set([...extensionSet].filter(a => !productSet.has(a)));
            if (diff.size > 0) {
                this._logService.error(`Extension '${key}' appears in product.json but enables LESS API proposals than the extension wants.\npackage.json (LOSES): ${[...extensionSet].join('\n')}\nproduct.json (WINS): ${[...productSet].join('\n')}\nDELTA: ${[...diff].join('\n')}`);
                if (this._environmentService.isExtensionDevelopment) {
                    this._logService.error(`Proceeding with EXTRA proposals (${[...diff].join(', ')}) because extension is in development mode. Still, this EXTENSION WILL BE BROKEN unless product.json is updated.`);
                    productEnabledProposals.push(...diff);
                }
            }
            extension.enabledApiProposals = productEnabledProposals;
            return;
        }
        if (this._envEnablesProposedApiForAll || this._envEnabledExtensions.has(key)) {
            // proposed API usage is not restricted and allowed just like the extension
            // has declared it
            return;
        }
        if (!extension.isBuiltin && isNonEmptyArray(extension.enabledApiProposals)) {
            // restrictive: extension cannot use proposed API in this context and its declaration is nulled
            this._logService.error(`Extension '${extension.identifier.value} CANNOT USE these API proposals '${extension.enabledApiProposals?.join(', ') || '*'}'. You MUST start in extension development mode or use the --enable-proposed-api command line flag`);
            extension.enabledApiProposals = [];
        }
    }
};
ExtensionsProposedApi = __decorate([
    __param(0, ILogService),
    __param(1, IWorkbenchEnvironmentService),
    __param(2, IProductService)
], ExtensionsProposedApi);
export { ExtensionsProposedApi };
class ApiProposalsMarkdowneRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'markdown';
    }
    shouldRender(manifest) {
        return !!manifest.originalEnabledApiProposals?.length || !!manifest.enabledApiProposals?.length;
    }
    render(manifest) {
        const enabledApiProposals = manifest.originalEnabledApiProposals ?? manifest.enabledApiProposals ?? [];
        const data = new MarkdownString();
        if (enabledApiProposals.length) {
            for (const proposal of enabledApiProposals) {
                data.appendMarkdown(`- \`${proposal}\`\n`);
            }
        }
        return {
            data,
            dispose: () => { }
        };
    }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'enabledApiProposals',
    label: localize('enabledProposedAPIs', "API Proposals"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(ApiProposalsMarkdowneRenderer),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNQcm9wb3NlZEFwaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsbUJBQW1CLEVBQTZDLE1BQU0sc0RBQXNELENBQUM7QUFDdEksT0FBTyxFQUFFLGVBQWUsRUFBbUIsTUFBTSxrRUFBa0UsQ0FBQztBQUNwSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDOUYsT0FBTyxFQUFFLFVBQVUsRUFBZ0YsTUFBTSx1REFBdUQsQ0FBQztBQUNqSyxPQUFPLEVBQW1CLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBR2xGLElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXFCO0lBTWpDLFlBQytCLFdBQXdCLEVBQ1AsbUJBQWlELEVBQy9FLGNBQStCO1FBRmxCLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBQ1Asd0JBQW1CLEdBQW5CLG1CQUFtQixDQUE4QjtRQUloRyxJQUFJLENB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