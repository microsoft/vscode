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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IExtensionRecommendationNotificationService } from '../../../../platform/extensionRecommendations/common/extensionRecommendations.js';
import { ExtensionRecommendationNotificationServiceChannel } from '../../../../platform/extensionRecommendations/common/extensionRecommendationsIpc.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { RuntimeExtensionsInput } from '../common/runtimeExtensionsInput.js';
import { DebugExtensionHostInNewWindowAction, DebugExtensionsContribution, DebugExtensionHostInDevToolsAction, DebugRendererInNewWindowAction, DebugExtensionHostAndRendererAction } from './debugExtensionHostAction.js';
import { ExtensionHostProfileService } from './extensionProfileService.js';
import { CleanUpExtensionsFolderAction, OpenExtensionsFolderAction } from './extensionsActions.js';
import { ExtensionsAutoProfiler } from './extensionsAutoProfiler.js';
import { InstallRemoteExtensionsContribution, RemoteExtensionsInitializerContribution } from './remoteExtensionsInit.js';
import { IExtensionHostProfileService, OpenExtensionHostProfileACtion, RuntimeExtensionsEditor, SaveExtensionHostProfileAction, StartExtensionHostProfileAction, StopExtensionHostProfileAction } from './runtimeExtensionsEditor.js';
// Singletons
registerSingleton(IExtensionHostProfileService, ExtensionHostProfileService, 1 /* InstantiationType.Delayed */);
// Running Extensions Editor
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(RuntimeExtensionsEditor, RuntimeExtensionsEditor.ID, localize('runtimeExtension', "Running Extensions")), [new SyncDescriptor(RuntimeExtensionsInput)]);
class RuntimeExtensionsInputSerializer {
    canSerialize(editorInput) {
        return true;
    }
    serialize(editorInput) {
        return '';
    }
    deserialize(instantiationService) {
        return RuntimeExtensionsInput.instance;
    }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(RuntimeExtensionsInput.ID, RuntimeExtensionsInputSerializer);
// Global actions
let ExtensionsContributions = class ExtensionsContributions extends Disposable {
    constructor(extensionRecommendationNotificationService, sharedProcessService) {
        super();
        sharedProcessService.registerChannel('extensionRecommendationNotification', new ExtensionRecommendationNotificationServiceChannel(extensionRecommendationNotificationService));
        this._register(registerAction2(OpenExtensionsFolderAction));
        this._register(registerAction2(CleanUpExtensionsFolderAction));
    }
};
ExtensionsContributions = __decorate([
    __param(0, IExtensionRecommendationNotificationService),
    __param(1, ISharedProcessService)
], ExtensionsContributions);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ExtensionsContributions, 3 /* LifecyclePhase.Restored */);
workbenchRegistry.registerWorkbenchContribution(ExtensionsAutoProfiler, 4 /* LifecyclePhase.Eventually */);
workbenchRegistry.registerWorkbenchContribution(RemoteExtensionsInitializerContribution, 3 /* LifecyclePhase.Restored */);
workbenchRegistry.registerWorkbenchContribution(InstallRemoteExtensionsContribution, 3 /* LifecyclePhase.Restored */);
workbenchRegistry.registerWorkbenchContribution(DebugExtensionsContribution, 3 /* LifecyclePhase.Restored */);
// Register Commands
registerAction2(DebugExtensionHostInNewWindowAction);
registerAction2(DebugRendererInNewWindowAction);
registerAction2(DebugExtensionHostAndRendererAction);
registerAction2(StartExtensionHostProfileAction);
registerAction2(StopExtensionHostProfileAction);
registerAction2(SaveExtensionHostProfileAction);
registerAction2(OpenExtensionHostProfileACtion);
registerAction2(DebugExtensionHostInDevToolsAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9ucy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlbnNpb25zL2VsZWN0cm9uLWJyb3dzZXIvZXh0ZW5zaW9ucy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLDJDQUEyQyxFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDL0ksT0FBTyxFQUFFLGlEQUFpRCxFQUFFLE1BQU0scUZBQXFGLENBQUM7QUFDeEosT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUUvRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLG9CQUFvQixFQUF1QixNQUFNLDRCQUE0QixDQUFDO0FBQ3ZGLE9BQU8sRUFBMkQsVUFBVSxJQUFJLG1CQUFtQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDOUksT0FBTyxFQUFFLGdCQUFnQixFQUE2QyxNQUFNLDJCQUEyQixDQUFDO0FBR3hHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSwyQkFBMkIsRUFBRSxrQ0FBa0MsRUFBRSw4QkFBOEIsRUFBRSxtQ0FBbUMs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