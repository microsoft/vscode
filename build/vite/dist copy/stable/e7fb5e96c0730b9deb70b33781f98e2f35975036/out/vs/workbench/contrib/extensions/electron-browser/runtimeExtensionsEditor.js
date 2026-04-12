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
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { Action2, IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Utils } from '../../../../platform/profiling/common/profiling.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionFeaturesManagementService } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { AbstractRuntimeExtensionsEditor } from '../browser/abstractRuntimeExtensionsEditor.js';
import { IExtensionsWorkbenchService } from '../common/extensions.js';
import { ReportExtensionIssueAction } from '../common/reportExtensionIssueAction.js';
import { SlowExtensionAction } from './extensionsSlowActions.js';
export const IExtensionHostProfileService = createDecorator('extensionHostProfileService');
export const CONTEXT_PROFILE_SESSION_STATE = new RawContextKey('profileSessionState', 'none');
export const CONTEXT_EXTENSION_HOST_PROFILE_RECORDED = new RawContextKey('extensionHostProfileRecorded', false);
export var ProfileSessionState;
(function (ProfileSessionState) {
    ProfileSessionState[ProfileSessionState["None"] = 0] = "None";
    ProfileSessionState[ProfileSessionState["Starting"] = 1] = "Starting";
    ProfileSessionState[ProfileSessionState["Running"] = 2] = "Running";
    ProfileSessionState[ProfileSessionState["Stopping"] = 3] = "Stopping";
})(ProfileSessionState || (ProfileSessionState = {}));
let RuntimeExtensionsEditor = class RuntimeExtensionsEditor extends AbstractRuntimeExtensionsEditor {
    constructor(group, telemetryService, themeService, contextKeyService, extensionsWorkbenchService, extensionService, notificationService, contextMenuService, instantiationService, storageService, labelService, environmentService, clipboardService, _extensionHostProfileService, extensionFeaturesManagementService, hoverService, menuService) {
        super(group, telemetryService, themeService, contextKeyService, extensionsWorkbenchService, extensionService, notificationService, contextMenuService, instantiationService, storageService, labelService, environmentService, clipboardService, extensionFeaturesManagementService, hoverService, menuService);
        this._extensionHostProfileService = _extensionHostProfileService;
        this._profileInfo = this._extensionHostProfileService.lastProfile;
        this._extensionsHostRecorded = CONTEXT_EXTENSION_HOST_PROFILE_RECORDED.bindTo(contextKeyService);
        this._profileSessionState = CONTEXT_PROFILE_SESSION_STATE.bindTo(contextKeyService);
        this._register(this._extensionHostProfileService.onDidChangeLastProfile(() => {
            this._profileInfo = this._extensionHostProfileService.lastProfile;
            this._extensionsHostRecorded.set(!!this._profileInfo);
            this._updateExtensions();
        }));
        this._register(this._extensionHostProfileService.onDidChangeState(() => {
            const state = this._extensionHostProfileService.state;
            this._profileSessionState.set(ProfileSessionState[state].toLowerCase());
        }));
    }
    _getProfileInfo() {
        return this._profileInfo;
    }
    _getUnresponsiveProfile(extensionId) {
        return this._extensionHostProfileService.getUnresponsiveProfile(extensionId);
    }
    _createSlowExtensionAction(element) {
        if (element.unresponsiveProfile) {
            return this._instantiationService.createInstance(SlowExtensionAction, element.description, element.unresponsiveProfile);
        }
        return null;
    }
    _createReportExtensionIssueAction(element) {
        if (element.marketplaceInfo) {
            return this._instantiationService.createInstance(ReportExtensionIssueAction, element.description);
        }
        return null;
    }
};
RuntimeExtensionsEditor = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IContextKeyService),
    __param(4, IExtensionsWorkbenchService),
    __param(5, IExtensionService),
    __param(6, INotificationService),
    __param(7, IContextMenuService),
    __param(8, IInstantiationService),
    __param(9, IStorageService),
    __param(10, ILabelService),
    __param(11, IWorkbenchEnvironmentService),
    __param(12, IClipboardService),
    __param(13, IExtensionHostProfileService),
    __param(14, IExtensionFeaturesManagementService),
    __param(15, IHoverService),
    __param(16, IMenuService)
], RuntimeExtensionsEditor);
export { RuntimeExtensionsEditor };
export class StartExtensionHostProfileAction extends Action2 {
    static { this.ID = 'workbench.extensions.action.extensionHostProfile'; }
    static { this.LABEL = nls.localize('extensionHostProfileStart', "Start Extension Host Profile"); }
    constructor() {
        super({
            id: StartExtensionHostProfileAction.ID,
            title: { value: StartExtensionHostProfileAction.LABEL, original: 'Start Extension Host Profile' },
            precondition: CONTEXT_PROFILE_SESSION_STATE.isEqualTo('none'),
            icon: Codicon.circleFilled,
            menu: [{
                    id: MenuId.EditorTitle,
                    when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID), CONTEXT_PROFILE_SESSION_STATE.notEqualsTo('running')),
                    group: 'navigation',
                }, {
                    id: MenuId.ExtensionEditorContextMenu,
                    when: CONTEXT_PROFILE_SESSION_STATE.notEqualsTo('running'),
                    group: 'profiling',
                }]
        });
    }
    run(accessor) {
        const extensionHostProfileService = accessor.get(IExtensionHostProfileService);
        extensionHostProfileService.startProfiling();
        return Promise.resolve();
    }
}
export class StopExtensionHostProfileAction extends Action2 {
    static { this.ID = 'workbench.extensions.action.stopExtensionHostProfile'; }
    static { this.LABEL = nls.localize('stopExtensionHostProfileStart', "Stop Extension Host Profile"); }
    constructor() {
        super({
            id: StopExtensionHostProfileAction.ID,
            title: { value: StopExtensionHostProfileAction.LABEL, original: 'Stop Extension Host Profile' },
            icon: Codicon.debugStop,
            menu: [{
                    id: MenuId.EditorTitle,
                    when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID), CONTEXT_PROFILE_SESSION_STATE.isEqualTo('running')),
                    group: 'navigation',
                }, {
                    id: MenuId.ExtensionEditorContextMenu,
                    when: CONTEXT_PROFILE_SESSION_STATE.isEqualTo('running'),
                    group: 'profiling',
                }]
        });
    }
    run(accessor) {
        const extensionHostProfileService = accessor.get(IExtensionHostProfileService);
        extensionHostProfileService.stopProfiling();
        return Promise.resolve();
    }
}
export class OpenExtensionHostProfileACtion extends Action2 {
    static { this.LABEL = nls.localize('openExtensionHostProfile', "Open Extension Host Profile"); }
    static { this.ID = 'workbench.extensions.action.openExtensionHostProfile'; }
    constructor() {
        super({
            id: OpenExtensionHostProfileACtion.ID,
            title: { value: OpenExtensionHostProfileACtion.LABEL, original: 'Open Extension Host Profile' },
            precondition: CONTEXT_EXTENSION_HOST_PROFILE_RECORDED,
            icon: Codicon.graph,
            menu: [{
                    id: MenuId.EditorTitle,
                    when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID)),
                    group: 'navigation',
                }, {
                    id: MenuId.ExtensionEditorContextMenu,
                    when: CONTEXT_EXTENSION_HOST_PROFILE_RECORDED,
                    group: 'profiling',
                }]
        });
    }
    async run(accessor) {
        const extensionHostProfileService = accessor.get(IExtensionHostProfileService);
        const commandService = accessor.get(ICommandService);
        const editorService = accessor.get(IEditorService);
        if (!extensionHostProfileService.lastProfileSavedTo) {
            await commandService.executeCommand(SaveExtensionHostProfileAction.ID);
        }
        if (!extensionHostProfileService.lastProfileSavedTo) {
            return;
        }
        await editorService.openEditor({
            resource: extensionHostProfileService.lastProfileSavedTo,
            options: {
                revealIfOpened: true,
                override: 'jsProfileVisualizer.cpuprofile.table',
            },
        }, SIDE_GROUP);
    }
}
export class SaveExtensionHostProfileAction extends Action2 {
    static { this.LABEL = nls.localize('saveExtensionHostProfile', "Save Extension Host Profile"); }
    static { this.ID = 'workbench.extensions.action.saveExtensionHostProfile'; }
    constructor() {
        super({
            id: SaveExtensionHostProfileAction.ID,
            title: { value: SaveExtensionHostProfileAction.LABEL, original: 'Save Extension Host Profile' },
            precondition: CONTEXT_EXTENSION_HOST_PROFILE_RECORDED,
            icon: Codicon.saveAll,
            menu: [{
                    id: MenuId.EditorTitle,
                    when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID)),
                    group: 'navigation',
                }, {
                    id: MenuId.ExtensionEditorContextMenu,
                    when: CONTEXT_EXTENSION_HOST_PROFILE_RECORDED,
                    group: 'profiling',
                }]
        });
    }
    run(accessor) {
        const environmentService = accessor.get(IWorkbenchEnvironmentService);
        const extensionHostProfileService = accessor.get(IExtensionHostProfileService);
        const fileService = accessor.get(IFileService);
        const fileDialogService = accessor.get(IFileDialogService);
        return this._asyncRun(environmentService, extensionHostProfileService, fileService, fileDialogService);
    }
    async _asyncRun(environmentService, extensionHostProfileService, fileService, fileDialogService) {
        const picked = await fileDialogService.showSaveDialog({
            title: nls.localize('saveprofile.dialogTitle', "Save Extension Host Profile"),
            availableFileSystems: [Schemas.file],
            defaultUri: joinPath(await fileDialogService.defaultFilePath(), `CPU-${new Date().toISOString().replace(/[\-:]/g, '')}.cpuprofile`),
            filters: [{
                    name: 'CPU Profiles',
                    extensions: ['cpuprofile', 'txt']
                }]
        });
        if (!picked) {
            return;
        }
        const profileInfo = extensionHostProfileService.lastProfile;
        let dataToWrite = profileInfo ? profileInfo.data : {};
        let savePath = picked.fsPath;
        if (environmentService.isBuilt) {
            // when running from a not-development-build we remove
            // absolute filenames because we don't want to reveal anything
            // about users. We also append the `.txt` suffix to make it
            // easier to attach these files to GH issues
            dataToWrite = Utils.rewriteAbsolutePaths(dataToWrite, 'piiRemoved');
            savePath = savePath + '.txt';
        }
        const saveURI = URI.file(savePath);
        extensionHostProfileService.lastProfileSavedTo = saveURI;
        return fileService.writeFile(saveURI, VSBuffer.fromString(JSON.stringify(profileInfo ? profileInfo.data : {}, null, '\t')));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVudGltZUV4dGVuc2lvbnNFZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlbnNpb25zL2VsZWN0cm9uLWJyb3dzZXIvcnVudGltZUV4dGVuc2lvbnNFZGl0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU5RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsY0FBYyxFQUFlLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RJLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRXBGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFF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