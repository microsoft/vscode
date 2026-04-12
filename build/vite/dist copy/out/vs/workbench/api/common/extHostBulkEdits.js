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
import { MainContext } from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { WorkspaceEdit } from './extHostTypeConverters.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
let ExtHostBulkEdits = class ExtHostBulkEdits {
    constructor(extHostRpc, extHostDocumentsAndEditors) {
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadBulkEdits);
        this._versionInformationProvider = {
            getTextDocumentVersion: uri => extHostDocumentsAndEditors.getDocument(uri)?.version,
            getNotebookDocumentVersion: () => undefined
        };
    }
    applyWorkspaceEdit(edit, extension, metadata) {
        const dto = new SerializableObjectWithBuffers(WorkspaceEdit.from(edit, this._versionInformationProvider));
        return this._proxy.$tryApplyWorkspaceEdit(dto, undefined, metadata?.isRefactoring ?? false);
    }
};
ExtHostBulkEdits = __decorate([
    __param(0, IExtHostRpcService)
], ExtHostBulkEdits);
export { ExtHostBulkEdits };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEJ1bGtFZGl0cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RCdWxrRWRpdHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFdBQVcsRUFBNEIsTUFBTSx1QkFBdUIsQ0FBQztBQUU5RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM1RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDM0QsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0scURBQXFELENBQUM7QUFHN0YsSUFBTSxnQkFBZ0IsR0FBdEIsTUFBTSxnQkFBZ0I7SUFLNUIsWUFDcUIsVUFBOEIsRUFDbEQsMEJBQXNEO1FBRXRELElBQUksQ0FBQyxNQUFNLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUVuRSxJQUFJLENBQUMsMkJBQTJCLEdBQUc7WUFDbEMsc0JBQXNCLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEVBQUUsT0FBTztZQUNuRiwwQkFBMEIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTO1NBQzNDLENBQUM7SUFDSCxDQUFDO0lBRUQsa0JBQWtCLENBQUMsSUFBMEIsRUFBRSxTQUFnQyxFQUFFLFFBQWtEO1FBQ2xJLE1BQU0sR0FBRyxHQUFHLElBQUksNkJBQTZCLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQztRQUMxRyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsYUFBYSxJQUFJLEtBQUssQ0FBQyxDQUFDO0lBQzdGLENBQUM7Q0FDRCxDQUFBO0FBckJZLGdCQUFnQjtJQU0xQixXQUFBLGtCQUFrQixDQUFBO0dBTlIsZ0JBQWdCLENBcUI1QiJ9