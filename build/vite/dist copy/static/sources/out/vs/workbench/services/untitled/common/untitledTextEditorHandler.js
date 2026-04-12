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
import { Schemas } from '../../../../base/common/network.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextEditorService } from '../../textfile/common/textEditorService.js';
import { isEqual, toLocalResource } from '../../../../base/common/resources.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
import { IPathService } from '../../path/common/pathService.js';
import { UntitledTextEditorInput } from './untitledTextEditorInput.js';
import { NO_TYPE_ID } from '../../workingCopy/common/workingCopy.js';
import { IWorkingCopyEditorService } from '../../workingCopy/common/workingCopyEditorService.js';
import { IUntitledTextEditorService } from './untitledTextEditorService.js';
let UntitledTextEditorInputSerializer = class UntitledTextEditorInputSerializer {
    constructor(filesConfigurationService, environmentService, pathService) {
        this.filesConfigurationService = filesConfigurationService;
        this.environmentService = environmentService;
        this.pathService = pathService;
    }
    canSerialize(editorInput) {
        return this.filesConfigurationService.isHotExitEnabled && !editorInput.isDisposed();
    }
    serialize(editorInput) {
        if (!this.canSerialize(editorInput)) {
            return undefined;
        }
        const untitledTextEditorInput = editorInput;
        let resource = untitledTextEditorInput.resource;
        if (untitledTextEditorInput.hasAssociatedFilePath) {
            resource = toLocalResource(resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme); // untitled with associated file path use the local schema
        }
        // Language: only remember language if it is either specific (not text)
        // or if the language was explicitly set by the user. We want to preserve
        // this information across restarts and not set the language unless
        // this is the case.
        let languageId;
        const languageIdCandidate = untitledTextEditorInput.getLanguageId();
        if (languageIdCandidate !== PLAINTEXT_LANGUAGE_ID) {
            languageId = languageIdCandidate;
        }
        else if (untitledTextEditorInput.hasLanguageSetExplicitly) {
            languageId = languageIdCandidate;
        }
        const serialized = {
            resourceJSON: resource.toJSON(),
            modeId: languageId,
            encoding: untitledTextEditorInput.getEncoding()
        };
        return JSON.stringify(serialized);
    }
    deserialize(instantiationService, serializedEditorInput) {
        return instantiationService.invokeFunction(accessor => {
            const deserialized = JSON.parse(serializedEditorInput);
            const resource = URI.revive(deserialized.resourceJSON);
            const languageId = deserialized.modeId;
            const encoding = deserialized.encoding;
            return accessor.get(ITextEditorService).createTextEditor({ resource, languageId, encoding, forceUntitled: true });
        });
    }
};
UntitledTextEditorInputSerializer = __decorate([
    __param(0, IFilesConfigurationService),
    __param(1, IWorkbenchEnvironmentService),
    __param(2, IPathService)
], UntitledTextEditorInputSerializer);
export { UntitledTextEditorInputSerializer };
let UntitledTextEditorWorkingCopyEditorHandler = class UntitledTextEditorWorkingCopyEditorHandler extends Disposable {
    static { this.ID = 'workbench.contrib.untitledTextEditorWorkingCopyEditorHandler'; }
    constructor(workingCopyEditorService, environmentService, pathService, textEditorService, untitledTextEditorService) {
        super();
        this.environmentService = environmentService;
        this.pathService = pathService;
        this.textEditorService = textEditorService;
        this.untitledTextEditorService = untitledTextEditorService;
        this._register(workingCopyEditorService.registerHandler(this));
    }
    handles(workingCopy) {
        return workingCopy.resource.scheme === Schemas.untitled && workingCopy.typeId === NO_TYPE_ID;
    }
    isOpen(workingCopy, editor) {
        if (!this.handles(workingCopy)) {
            return false;
        }
        return editor instanceof UntitledTextEditorInput && isEqual(workingCopy.resource, editor.resource);
    }
    createEditor(workingCopy) {
        let editorInputResource;
        // If the untitled has an associated resource,
        // ensure to restore the local resource it had
        if (this.untitledTextEditorService.isUntitledWithAssociatedResource(workingCopy.resource)) {
            editorInputResource = toLocalResource(workingCopy.resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
        }
        else {
            editorInputResource = workingCopy.resource;
        }
        return this.textEditorService.createTextEditor({ resource: editorInputResource, forceUntitled: true });
    }
};
UntitledTextEditorWorkingCopyEditorHandler = __decorate([
    __param(0, IWorkingCopyEditorService),
    __param(1, IWorkbenchEnvironmentService),
    __param(2, IPathService),
    __param(3, ITextEditorService),
    __param(4, IUntitledTextEditorService)
], UntitledTextEditorWorkingCopyEditorHandler);
export { UntitledTextEditorWorkingCopyEditorHandler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW50aXRsZWRUZXh0RWRpdG9ySGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91bnRpdGxlZC9jb21tb24vdW50aXRsZWRUZXh0RWRpdG9ySGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sZ0NBQWdDLENBQUM7QUFHcEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDaEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUU3RixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDaEUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFdkUsT0FBTyxFQUEwQixVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM3RixPQUFPLEVBQTZCLHlCQUF5QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDNUgsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFRckUsSUFBTSxpQ0FBaUMsR0FBdkMsTUFBTSxpQ0FBaUM7SUFFN0MsWUFDOEMseUJBQXFELEVBQ25ELGtCQUFnRCxFQUNoRSxXQUF5QjtR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