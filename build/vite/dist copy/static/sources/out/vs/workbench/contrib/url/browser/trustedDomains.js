/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { isEqual } from '../../../../base/common/resources.js';
import { createScanner } from '../../../../base/common/json.js';
const TRUSTED_DOMAINS_URI = URI.parse('trustedDomains:/Trusted Domains');
export const TRUSTED_DOMAINS_STORAGE_KEY = 'http.linkProtectionTrustedDomains';
export const TRUSTED_DOMAINS_CONTENT_STORAGE_KEY = 'http.linkProtectionTrustedDomainsContent';
async function openInEditor(editorService, resource) {
    await editorService.openEditor({
        resource,
        languageId: 'jsonc',
        options: { pinned: true }
    });
    const editor = editorService.activeTextEditorControl;
    if (!isCodeEditor(editor)) {
        return;
    }
    const model = editor.getModel();
    if (!model || !isEqual(model.uri, resource)) {
        return;
    }
    // Find first token after [ to place cursor there
    const scanner = createScanner(model.getValue(), true);
    let offset;
    for (let token = scanner.scan(); token !== 17 /* SyntaxKind.EOF */; token = scanner.scan()) {
        if (token === 3 /* SyntaxKind.OpenBracketToken */) {
            offset = scanner.getTokenOffset() + scanner.getTokenLength();
            const nextToken = scanner.scan();
            if (nextToken !== 17 /* SyntaxKind.EOF */ && nextToken !== 4 /* SyntaxKind.CloseBracketToken */) {
                offset = scanner.getTokenOffset();
            }
            break;
        }
    }
    if (offset !== undefined) {
        const position = model.getPositionAt(offset);
        editor.setPosition(position);
        editor.revealPositionInCenter(position);
    }
}
export const manageTrustedDomainSettingsCommand = {
    id: 'workbench.action.manageTrustedDomain',
    description: {
        description: localize2('trustedDomain.manageTrustedDomain', 'Manage Trusted Domains'),
        args: []
    },
    handler: async (accessor) => {
        const editorService = accessor.get(IEditorService);
        await openInEditor(editorService, TRUSTED_DOMAINS_URI);
        return;
    }
};
export async function configureOpenerTrustedDomainsHandler(trustedDomains, domainToConfigure, resource, quickInputService, storageService, editorService, telemetryService) {
    const parsedDomainToConfigure = URI.parse(domainToConfigure);
    const toplevelDomainSegements = parsedDomainToConfigure.authority.split('.');
    const domainEnd = toplevelDomainSegements.slice(toplevelDomainSegements.length - 2).join('.');
    const topLevelDomain = '*.' + domainEnd;
    const options = [];
    options.push({
        type: 'item',
        label: localize('trustedDomain.trustDomain', 'Trust {0}', domainToConfigure),
        id: 'trust',
        toTrust: domainToConfigure,
        picked: true
    });
    const isIP = toplevelDomainSegements.length === 4 &&
        toplevelDomainSegements.every(segment => Number.isInteger(+segment) || Number.isInteger(+segment.split(':')[0]));
    if (isIP) {
        if (parsedDomainToConfigure.authority.includes(':')) {
            const base = parsedDomainToConfigure.authority.split(':')[0];
            options.push({
                type: 'item',
                label: localize('trustedDomain.trustAllPorts', 'Trust {0} on all ports', base),
                toTrust: base + ':*',
                id: 'trust'
            });
        }
    }
    else {
        options.push({
            type: 'item',
            label: localize('trustedDomain.trustSubDomain', 'Trust {0} and all its subdomains', domainEnd),
            toTrust: topLevelDomain,
            id: 'trust'
        });
    }
    options.push({
        type: 'item',
        label: localize('trustedDomain.trustAllDomains', 'Trust all domains (disables link protection)'),
        toTrust: '*',
        id: 'trust'
    });
    options.push({
        type: 'item',
        label: localize('trustedDomain.manageTrustedDomains', 'Manage Trusted Domains'),
        id: 'manage'
    });
    const pickedResult = await quickInputService.pick(options, { activeItem: options[0] });
    if (pickedResult && pickedResult.id) {
        switch (pickedResult.id) {
            case 'manage': {
                const uriWithFragment = TRUSTED_DOMAINS_URI.with({ fragment: resource.toString() });
                await openInEditor(editorService, uriWithFragment);
                return trustedDomains;
            }
            case 'trust': {
                const itemToTrust = pickedResult.toTrust;
                if (trustedDomains.indexOf(itemToTrust) === -1) {
                    storageService.remove(TRUSTED_DOMAINS_CONTENT_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
                    storageService.store(TRUSTED_DOMAINS_STORAGE_KEY, JSON.stringify([...trustedDomains, itemToTrust]), -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                    return [...trustedDomains, itemToTrust];
                }
            }
        }
    }
    return [];
}
export async function readTrustedDomains(accessor) {
    const { defaultTrustedDomains, trustedDomains } = readStaticTrustedDomains(accessor);
    return {
        defaultTrustedDomains,
        trustedDomains,
    };
}
export function readStaticTrustedDomains(accessor) {
    const storageService = accessor.get(IStorageService);
    const productService = accessor.get(IProductService);
    const environmentService = accessor.get(IBrowserWorkbenchEnvironmentService);
    const defaultTrustedDomains = [
        ...productService.linkProtectionTrustedDomains ?? [],
        ...environmentService.options?.additionalTrustedDomains ?? []
    ];
    let trustedDomains = [];
    try {
        const trustedDomainsSrc = storageService.get(TRUSTED_DOMAINS_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        if (trustedDomainsSrc) {
            trustedDomains = JSON.parse(trustedDomainsSrc);
        }
    }
    catch (err) { }
    return {
        defaultTrustedDomains,
        trustedDomains,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJ1c3RlZERvbWFpbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi91cmwvYnJvd3Nlci90cnVzdGVkRG9tYWlucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUV6RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFeEYsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUU5RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbEgsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsYUFBYSxFQUFjLE1BQU0saUNBQWlDLENBQUM7QUFFNUUsTUFBTSxtQkFBbUIsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7QUFFekUsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsbUNBQW1DLENBQUM7QUFDL0UsTUFBTSxDQUFDLE1BQU0sbUNBQW1DLEdBQUcsMENBQTBDLENBQUM7QUFFOUYsS0FBSyxVQUFVLFlBQVksQ0FBQyxhQUE2QixFQUFFLFFBQWE7SUFDdkUsTUFBTSxhQUFhLENBQUMsVUFBVSxDQUFDO1FBQzlCLFFBQVE7UUFDUixVQUFVLEVBQUUsT0FBTztRQUNuQixPQUFPLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO0tBQ3pCLENB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