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
import { Schemas } from '../../../../base/common/network.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CustomEditorInput } from './customEditorInput.js';
import { ICustomEditorService } from '../common/customEditor.js';
import { NotebookEditorInput } from '../../notebook/common/notebookEditorInput.js';
import { IWebviewService } from '../../webview/browser/webview.js';
import { restoreWebviewContentOptions, restoreWebviewOptions, reviveWebviewExtensionDescription, reviveWebviewIconPath, WebviewEditorInputSerializer } from '../../webviewPanel/browser/webviewEditorInputSerializer.js';
import { IWebviewWorkbenchService } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { IWorkingCopyBackupService } from '../../../services/workingCopy/common/workingCopyBackup.js';
import { IWorkingCopyEditorService } from '../../../services/workingCopy/common/workingCopyEditorService.js';
let CustomEditorInputSerializer = class CustomEditorInputSerializer extends WebviewEditorInputSerializer {
    static { this.ID = CustomEditorInput.typeId; }
    constructor(webviewWorkbenchService, _instantiationService, _webviewService) {
        super(webviewWorkbenchService);
        this._instantiationService = _instantiationService;
        this._webviewService = _webviewService;
    }
    serialize(input) {
        const dirty = input.isDirty();
        const data = {
            ...this.toJson(input),
            editorResource: input.resource.toJSON(),
            dirty,
            backupId: dirty ? input.backupId : undefined,
        };
        try {
            return JSON.stringify(data);
        }
        catch {
            return undefined;
        }
    }
    fromJson(data) {
        return {
            ...super.fromJson(data),
            editorResource: URI.from(data.editorResource),
            dirty: data.dirty,
        };
    }
    deserialize(_instantiationService, serializedEditorInput) {
        const data = this.fromJson(JSON.parse(serializedEditorInput));
        const webview = reviveWebview(this._webviewService, data);
        const customInput = this._instantiationService.createInstance(CustomEditorInput, {
            resource: data.editorResource,
            viewType: data.viewType,
            webviewTitle: data.title,
            iconPath: data.iconPath,
        }, webview, { startsDirty: data.dirty, backupId: data.backupId });
        if (typeof data.group === 'number') {
            customInput.updateGroup(data.group);
        }
        return customInput;
    }
};
CustomEditorInputSerializer = __decorate([
    __param(0, IWebviewWorkbenchService),
    __param(1, IInstantiationService),
    __param(2, IWebviewService)
], CustomEditorInputSerializer);
export { CustomEditorInputSerializer };
function reviveWebview(webviewService, data) {
    const webview = webviewService.createWebviewOverlay({
        providedViewType: data.viewType,
        origin: data.origin,
        title: data.title,
        options: {
            purpose: "customEditor" /* WebviewContentPurpose.CustomEditor */,
            enableFindWidget: data.webviewOptions.enableFindWidget,
            retainContextWhenHidden: data.webviewOptions.retainContextWhenHidden,
        },
        contentOptions: data.contentOptions,
        extension: data.extension,
    });
    webview.state = data.state;
    return webview;
}
let ComplexCustomWorkingCopyEditorHandler = class ComplexCustomWorkingCopyEditorHandler extends Disposable {
    static { this.ID = 'workbench.contrib.complexCustomWorkingCopyEditorHandler'; }
    constructor(_instantiationService, _workingCopyEditorService, _workingCopyBackupService, _webviewService, _customEditorService // DO NOT REMOVE (needed on startup to register overrides properly)
    ) {
        super();
        this._instantiationService = _instantiationService;
        this._workingCopyBackupService = _workingCopyBackupService;
        this._webviewService = _webviewService;
        this._register(_workingCopyEditorService.registerHandler(this));
    }
    handles(workingCopy) {
        return workingCopy.resource.scheme === Schemas.vscodeCustomEditor;
    }
    isOpen(workingCopy, editor) {
        if (!this.handles(workingCopy)) {
            return false;
        }
        if (workingCopy.resource.authority === 'jupyter-notebook-ipynb' && editor instanceof NotebookEditorInput) {
            try {
                const data = JSON.parse(workingCopy.resource.query);
                const workingCopyResource = URI.from(data);
                return isEqual(workingCopyResource, editor.resource);
            }
            catch {
                return false;
            }
        }
        if (!(editor instanceof CustomEditorInput)) {
            return false;
        }
        if (workingCopy.resource.authority !== editor.viewType.replace(/[^a-z0-9\-_]/gi, '-').toLowerCase()) {
            return false;
        }
        // The working copy stores the uri of the original resource as its query param
        try {
            const data = JSON.parse(workingCopy.resource.query);
            const workingCopyResource = URI.from(data);
            return isEqual(workingCopyResource, editor.resource);
        }
        catch {
            return false;
        }
    }
    async createEditor(workingCopy) {
        const backup = await this._workingCopyBackupService.resolve(workingCopy);
        if (!backup?.meta) {
            throw new Error(`No backup found for custom editor: ${workingCopy.resource}`);
        }
        const backupData = backup.meta;
        const extension = reviveWebviewExtensionDescription(backupData.extension?.id, backupData.extension?.location);
        const webview = reviveWebview(this._webviewService, {
            viewType: backupData.viewType,
            origin: backupData.webview.origin,
            webviewOptions: restoreWebviewOptions(backupData.webview.options),
            contentOptions: restoreWebviewContentOptions(backupData.webview.options),
            state: backupData.webview.state,
            extension,
            title: backupData.customTitle,
        });
        const editor = this._instantiationService.createInstance(CustomEditorInput, {
            resource: URI.revive(backupData.editorResource),
            viewType: backupData.viewType,
            webviewTitle: backupData.customTitle,
            iconPath: reviveWebviewIconPath(backupData.iconPath)
        }, webview, { backupId: backupData.backupId });
        editor.updateGroup(0);
        return editor;
    }
};
ComplexCustomWorkingCopyEditorHandler = __decorate([
    __param(0, IInstantiationService),
    __param(1, IWorkingCopyEditorService),
    __param(2, IWorkingCopyBackupService),
    __param(3, IWebviewService),
    __param(4, ICustomEditorService)
], ComplexCustomWorkingCopyEditorHandler);
export { ComplexCustomWorkingCopyEditorHandler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9tRWRpdG9ySW5wdXRGYWN0b3J5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY3VzdG9tRWRpdG9yL2Jyb3dzZXIvY3VzdG9tRWRpdG9ySW5wdXRGYWN0b3J5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFHbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDM0QsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDakUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbkYsT0FBTyxFQUFFLGVBQWUsRUFBNkYsTUFBTSxrQ0FBa0MsQ0FBQztBQUM5SixPQUFPLEVBQXVCLDRCQUE0QixFQUFFLHFCQUFxQixFQUFFLGlDQUFpQyxFQUFFLHFCQUFxQixFQUErQyw0QkFBNEIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzNSLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRWpHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3RHLE9BQU8sRUFBNkIseUJBQXlCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQW9DakksSUFBTSwyQkFBMkIsR0FBakMsTUFBTSwyQkFBNEIs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