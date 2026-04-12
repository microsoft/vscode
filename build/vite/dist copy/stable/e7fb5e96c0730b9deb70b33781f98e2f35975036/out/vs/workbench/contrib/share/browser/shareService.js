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
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { score } from '../../../../editor/common/languageSelector.js';
import { localize } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ToggleTitleBarConfigAction } from '../../../browser/parts/titlebar/titlebarActions.js';
import { IsCompactTitleBarContext, WorkspaceFolderCountContext } from '../../../common/contextkeys.js';
export const ShareProviderCountContext = new RawContextKey('shareProviderCount', 0, localize('shareProviderCount', "The number of available share providers"));
let ShareService = class ShareService {
    constructor(contextKeyService, labelService, quickInputService, codeEditorService, telemetryService) {
        this.contextKeyService = contextKeyService;
        this.labelService = labelService;
        this.quickInputService = quickInputService;
        this.codeEditorService = codeEditorService;
        this.telemetryService = telemetryService;
        this._providers = new Set();
        this.providerCount = ShareProviderCountContext.bindTo(this.contextKeyService);
    }
    registerShareProvider(provider) {
        this._providers.add(provider);
        this.providerCount.set(this._providers.size);
        return {
            dispose: () => {
                this._providers.delete(provider);
                this.providerCount.set(this._providers.size);
            }
        };
    }
    getShareActions() {
        // todo@joyceerhl return share actions
        return [];
    }
    async provideShare(item, token) {
        const language = this.codeEditorService.getActiveCodeEditor()?.getModel()?.getLanguageId() ?? '';
        const providers = [...this._providers.values()]
            .filter((p) => score(p.selector, item.resourceUri, language, true, undefined, undefined) > 0)
            .sort((a, b) => a.priority - b.priority);
        if (providers.length === 0) {
            return undefined;
        }
        if (providers.length === 1) {
            this.telemetryService.publicLog2('shareService.share', { providerId: providers[0].id });
            return providers[0].provideShare(item, token);
        }
        const items = providers.map((p) => ({ label: p.label, provider: p }));
        const selected = await this.quickInputService.pick(items, { canPickMany: false, placeHolder: localize('type to filter', 'Choose how to share {0}', this.labelService.getUriLabel(item.resourceUri)) }, token);
        if (selected !== undefined) {
            this.telemetryService.publicLog2('shareService.share', { providerId: selected.provider.id });
            return selected.provider.provideShare(item, token);
        }
        return;
    }
};
ShareService = __decorate([
    __param(0, IContextKeyService),
    __param(1, ILabelService),
    __param(2, IQuickInputService),
    __param(3, ICodeEditorService),
    __param(4, ITelemetryService)
], ShareService);
export { ShareService };
registerAction2(class ToggleShareControl extends ToggleTitleBarConfigAction {
    constructor() {
        super('workbench.experimental.share.enabled', localize('toggle.share', 'Share'), localize('toggle.shareDescription', "Toggle visibility of the Share action in title bar"), 3, ContextKeyExpr.and(IsCompactTitleBarContext.toNegated(), ContextKeyExpr.has('config.window.commandCenter'), ContextKeyExpr.and(ShareProviderCountContext.notEqualsTo(0), WorkspaceFolderCountContext.notEqualsTo(0))));
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhcmVTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2hhcmUvYnJvd3Nlci9zaGFyZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFLaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDOUYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQWdCLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxjQUFjLEVBQWUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEksT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxrQkFBa0IsRUFBa0IsTUFBTSxzREFBc0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUd2RyxNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRyxJQUFJLGFBQWEsQ0FBUyxvQkFBb0IsRUFBRSxDQUFDLEVBQUUsUUFBUSxDQUFDLG9CQUFvQixFQUFFLHlDQUF5QyxDQUFDLENBQUMsQ0FBQztBQVVoSyxJQUFNLFlBQVksR0FBbEIsTUFBTSxZQUFZO0lBTXhCLFlBQ3FCLGlCQUE2QyxFQUNsRCxZQUE0QyxFQUN2QyxpQkFBNkMsRUFDN0MsaUJBQXNELEVBQ3ZELGdCQUFvRDtRQUoz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