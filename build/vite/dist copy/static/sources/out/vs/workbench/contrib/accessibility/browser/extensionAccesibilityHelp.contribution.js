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
import { DisposableMap, DisposableStore, Disposable } from '../../../../base/common/lifecycle.js';
import { ExtensionContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { FocusedViewContext } from '../../../common/contextkeys.js';
import { Extensions } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
let ExtensionAccessibilityHelpDialogContribution = class ExtensionAccessibilityHelpDialogContribution extends Disposable {
    static { this.ID = 'extensionAccessibilityHelpDialogContribution'; }
    constructor(keybindingService) {
        super();
        this._viewHelpDialogMap = this._register(new DisposableMap());
        this._register(Registry.as(Extensions.ViewsRegistry).onViewsRegistered(e => {
            for (const view of e) {
                for (const viewDescriptor of view.views) {
                    if (viewDescriptor.accessibilityHelpContent) {
                        this._viewHelpDialogMap.set(viewDescriptor.id, registerAccessibilityHelpAction(keybindingService, viewDescriptor));
                    }
                }
            }
        }));
        this._register(Registry.as(Extensions.ViewsRegistry).onViewsDeregistered(e => {
            for (const viewDescriptor of e.views) {
                if (viewDescriptor.accessibilityHelpContent) {
                    this._viewHelpDialogMap.get(viewDescriptor.id)?.dispose();
                }
            }
        }));
    }
};
ExtensionAccessibilityHelpDialogContribution = __decorate([
    __param(0, IKeybindingService)
], ExtensionAccessibilityHelpDialogContribution);
export { ExtensionAccessibilityHelpDialogContribution };
function registerAccessibilityHelpAction(keybindingService, viewDescriptor) {
    const disposableStore = new DisposableStore();
    const content = viewDescriptor.accessibilityHelpContent?.value;
    if (!content) {
        throw new Error('No content provided for the accessibility help dialog');
    }
    disposableStore.add(AccessibleViewRegistry.register({
        priority: 95,
        name: viewDescriptor.id,
        type: "help" /* AccessibleViewType.Help */,
        when: FocusedViewContext.isEqualTo(viewDescriptor.id),
        getProvider: (accessor) => {
            const viewsService = accessor.get(IViewsService);
            return new ExtensionContentProvider(viewDescriptor.id, { type: "help" /* AccessibleViewType.Help */ }, () => content, () => viewsService.openView(viewDescriptor.id, true));
        },
    }));
    disposableStore.add(keybindingService.onDidUpdateKeybindings(() => {
        disposableStore.clear();
        disposableStore.add(registerAccessibilityHelpAction(keybindingService, viewDescriptor));
    }));
    return disposableStore;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uQWNjZXNpYmlsaXR5SGVscC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvZXh0ZW5zaW9uQWNjZXNpYmlsaXR5SGVscC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGFBQWEsRUFBZSxlQUFlLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFL0csT0FBTyxFQUFzQix3QkFBd0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQzVILE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQzlHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQWtCLFVBQVUsRUFBbUIsTUFBTSwwQkFBMEIsQ0FBQztBQUN2RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFeEUsSUFBTSw0Q0FBNEMsR0FBbEQsTUFBTSw0Q0FBNkMsU0FBUSxVQUFVO2FBQ3BFLE9BQUUsR0FBRyw4Q0FBOEMsQUFBakQsQ0FBa0Q7SUFFM0QsWUFBZ0MsaUJBQXFDO1FBQ3BFLEtBQUssRUFBRSxDQUFDO1FBRkQsdUJBQWtCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGFBQWEsRUFBdUIsQ0FBQyxDQUFDO1FBR3JGLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBaUIsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGlCQUFp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