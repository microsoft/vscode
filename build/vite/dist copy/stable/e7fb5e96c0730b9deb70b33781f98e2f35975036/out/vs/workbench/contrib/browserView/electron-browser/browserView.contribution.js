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
import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { BrowserEditor } from './browserEditor.js';
import { BrowserEditorInput, BrowserEditorSerializer } from '../common/browserEditorInput.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Schemas } from '../../../../base/common/network.js';
import { IBrowserViewCDPService, IBrowserViewWorkbenchService } from '../common/browserView.js';
import { BrowserViewWorkbenchService } from './browserViewWorkbenchService.js';
import { BrowserViewCDPService } from './browserViewCDPService.js';
// Register actions and browser features
import './browserViewActions.js';
import './features/browserDataStorageFeatures.js';
import './features/browserDevToolsFeature.js';
import './features/browserEditorChatFeatures.js';
import './features/browserEditorZoomFeature.js';
import './features/browserEditorFindFeature.js';
import './features/browserTabManagementFeatures.js';
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(BrowserEditor, BrowserEditorInput.EDITOR_ID, localize('browser.editorLabel', "Browser")), [
    new SyncDescriptor(BrowserEditorInput)
]);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(BrowserEditorInput.ID, BrowserEditorSerializer);
let BrowserEditorResolverContribution = class BrowserEditorResolverContribution {
    static { this.ID = 'workbench.contrib.browserEditorResolver'; }
    constructor(editorResolverService, instantiationService) {
        editorResolverService.registerEditor(`${Schemas.vscodeBrowser}:/**`, {
            id: BrowserEditorInput.EDITOR_ID,
            label: localize('browser.editorLabel', "Browser"),
            priority: RegisteredEditorPriority.exclusive
        }, {
            canSupportResource: resource => resource.scheme === Schemas.vscodeBrowser,
            singlePerResource: true
        }, {
            createEditorInput: ({ resource, options }) => {
                const parsed = BrowserViewUri.parse(resource);
                if (!parsed) {
                    throw new Error(`Invalid browser view resource: ${resource.toString()}`);
                }
                const browserInput = instantiationService.createInstance(BrowserEditorInput, {
                    ...options?.viewState,
                    id: parsed.id
                });
                // Start resolving the input right away. This will create the browser view.
                // This allows browser views to be loaded in the background.
                void browserInput.resolve();
                return {
                    editor: browserInput,
                    options: {
                        ...options,
                        pinned: !!browserInput.url // pin if navigated
                    }
                };
            }
        });
    }
};
BrowserEditorResolverContribution = __decorate([
    __param(0, IEditorResolverService),
    __param(1, IInstantiationService)
], BrowserEditorResolverContribution);
registerWorkbenchContribution2(BrowserEditorResolverContribution.ID, BrowserEditorResolverContribution, 1 /* WorkbenchPhase.BlockStartup */);
registerSingleton(IBrowserViewWorkbenchService, BrowserViewWorkbenchService, 1 /* InstantiationType.Delayed */);
registerSingleton(IBrowserViewCDPService, BrowserViewCDPService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXcuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci9icm93c2VyVmlldy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLG9CQUFvQixFQUF1QixNQUFNLDRCQUE0QixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBMEIsTUFBTSwyQkFBMkIsQ0FBQztBQUNyRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDbkQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLHVCQUF1QixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDOUYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBcUIsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM1SCxPQUFPLEVBQTBCLDhCQUE4QixFQUFrQixNQUFNLGtDQUFrQyxDQUFDO0FBQzFILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSwwQkFBMEIsQ0FB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