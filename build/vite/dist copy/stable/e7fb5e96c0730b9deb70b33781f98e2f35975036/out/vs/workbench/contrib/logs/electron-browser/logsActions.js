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
import { Action } from '../../../../base/common/actions.js';
import * as nls from '../../../../nls.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { joinPath } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
let OpenLogsFolderAction = class OpenLogsFolderAction extends Action {
    static { this.ID = 'workbench.action.openLogsFolder'; }
    static { this.TITLE = nls.localize2('openLogsFolder', "Open Logs Folder"); }
    constructor(id, label, environmentService, nativeHostService) {
        super(id, label);
        this.environmentService = environmentService;
        this.nativeHostService = nativeHostService;
    }
    run() {
        return this.nativeHostService.showItemInFolder(joinPath(this.environmentService.logsHome, 'main.log').with({ scheme: Schemas.file }).fsPath);
    }
};
OpenLogsFolderAction = __decorate([
    __param(2, INativeWorkbenchEnvironmentService),
    __param(3, INativeHostService)
], OpenLogsFolderAction);
export { OpenLogsFolderAction };
let OpenExtensionLogsFolderAction = class OpenExtensionLogsFolderAction extends Action {
    static { this.ID = 'workbench.action.openExtensionLogsFolder'; }
    static { this.TITLE = nls.localize2('openExtensionLogsFolder', "Open Extension Logs Folder"); }
    constructor(id, label, environmentSerice, fileService, nativeHostService) {
        super(id, label);
        this.environmentSerice = environmentSerice;
        this.fileService = fileService;
        this.nativeHostService = nativeHostService;
    }
    async run() {
        const folderStat = await this.fileService.resolve(this.environmentSerice.extHostLogsPath);
        if (folderStat.children && folderStat.children[0]) {
            return this.nativeHostService.showItemInFolder(folderStat.children[0].resource.with({ scheme: Schemas.file }).fsPath);
        }
    }
};
OpenExtensionLogsFolderAction = __decorate([
    __param(2, INativeWorkbenchEnvironmentService),
    __param(3, IFileService),
    __param(4, INativeHostService)
], OpenExtensionLogsFolderAction);
export { OpenExtensionLogsFolderAction };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nc0FjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9sb2dzL2VsZWN0cm9uLWJyb3dzZXIvbG9nc0FjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDMUgsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFdEQsSUFBTSxvQkFBb0IsR0FBMUIsTUFBTSxvQkFBcUIsU0FBUSxNQUFNO2FBRS9CLE9BQUUsR0FBRyxpQ0FBaUMsQUFBcEMsQ0FBcUM7YUFDdkMsVUFBSyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsa0JBQWtCLENBQUMsQUFBdEQsQ0FBdUQ7SUFFNUUsWUFBWSxFQUFVLEVBQUUsS0FBYSxFQUNpQixrQkFBc0QsRUFDdEUsaUJBQXFDO1FBRTFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFIb0MsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQztRQUN0RSxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO0lBRzNFLENBQUM7SUFFUSxHQUFHO1FBQ1gsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzlJLENBQUM7O0FBZFcsb0JBQW9CO0lBTTlCLFdBQUEsa0NBQWtDLENBQUE7SUFDbEMsV0FBQSxrQkFBa0IsQ0FBQTtHQVBSLG9CQUFvQixDQWVoQzs7QUFFTSxJQUFNLDZCQUE2QixHQUFuQyxNQUFNLDZCQUE4QixTQUFRLE1BQU07YUFFeEMsT0FBRSxHQUFHLDBDQUEwQyxBQUE3QyxDQUE4QzthQUNoRCxVQUFLLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyx5QkFBeUIsRUFBRSw0QkFBNEIsQ0FBQyxBQUF6RSxDQUEwRTtJQUUvRixZQUFZLEVBQVUsRUFBRSxLQUFhLEVBQ2lCLGlCQUFxRCxFQUMzRSxXQUF5QixFQUNuQixpQkFBcUM7UUFFMUUsS0FBSyxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUpvQyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9DO1FBQzNFLGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ25CLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7SUFHM0UsQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHO1FBQ2pCLE1BQU0sVUFBVSxHQUFHLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQzFGLElBQUksVUFBVSxDQUFDLFFBQVEsSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDbkQsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZILENBQUM7SUFDRixDQUFDOztBQWxCVyw2QkFBNkI7SUFNdkMsV0FBQSxrQ0FBa0MsQ0FBQTtJQUNsQyxXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsa0JBQWtCLENBQUE7R0FSUiw2QkFBNkIsQ0FtQnpDIn0=