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
import { randomPath } from '../../../../base/common/extpath.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { IElevatedFileService } from '../common/elevatedFileService.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
let NativeElevatedFileService = class NativeElevatedFileService {
    constructor(nativeHostService, fileService, environmentService, workspaceTrustRequestService, labelService) {
        this.nativeHostService = nativeHostService;
        this.fileService = fileService;
        this.environmentService = environmentService;
        this.workspaceTrustRequestService = workspaceTrustRequestService;
        this.labelService = labelService;
    }
    isSupported(resource) {
        // Saving elevated is currently only supported for local
        // files for as long as we have no generic support from
        // the file service
        // (https://github.com/microsoft/vscode/issues/48659)
        return resource.scheme === Schemas.file;
    }
    async writeFileElevated(resource, value, options) {
        const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
            message: isWindows ? localize('fileNotTrustedMessageWindows', "You are about to save '{0}' as admin.", this.labelService.getUriLabel(resource)) : localize('fileNotTrustedMessagePosix', "You are about to save '{0}' as super user.", this.labelService.getUriLabel(resource)),
        });
        if (!trusted) {
            throw new Error(localize('fileNotTrusted', "Workspace is not trusted."));
        }
        const source = URI.file(randomPath(this.environmentService.userDataPath, 'code-elevated'));
        try {
            // write into a tmp file first
            await this.fileService.writeFile(source, value, options);
            // then sudo prompt copy
            await this.nativeHostService.writeElevated(source, resource, options);
        }
        finally {
            // clean up
            await this.fileService.del(source);
        }
        return this.fileService.resolve(resource, { resolveMetadata: true });
    }
};
NativeElevatedFileService = __decorate([
    __param(0, INativeHostService),
    __param(1, IFileService),
    __param(2, INativeWorkbenchEnvironmentService),
    __param(3, IWorkspaceTrustRequestService),
    __param(4, ILabelService)
], NativeElevatedFileService);
export { NativeElevatedFileService };
registerSingleton(IElevatedFileService, NativeElevatedFileService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxldmF0ZWRGaWxlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9maWxlcy9lbGVjdHJvbi1icm93c2VyL2VsZXZhdGVkRmlsZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxZQUFZLEVBQTRDLE1BQU0sNENBQTRDLENBQUM7QUFDcEgsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDcEUsSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBeUI7SUFJckMsWUFDc0MsaUJBQXFDLEVBQzNDLFdBQXlCLEVBQ0gsa0JBQXNELEVBQzNELDRCQUEyRCxFQUMzRSxZQUEyQjtRQUp0QixzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBQzNDLGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ0gsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQztRQUMzRCxpQ0FBNEIsR0FBNUIsNEJBQTRCLENBQStCO1FBQzNFLGlCQUFZLEdBQVosWUFBWSxDQUFlO0lBQ3hELENBQUM7SUFFTCxXQUFXLENBQUMsUUFBYTtRQUN4Qix3REFBd0Q7UUFDeEQsdURBQXVEO1FBQ3ZELG1CQUFtQjtRQUNuQixxREFBcUQ7UUFDckQsT0FBTyxRQUFRLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxJQUFJLENBQUM7SUFDekMsQ0FBQztJQUVELEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxRQUFhLEVBQUUsS0FBMkQsRUFBRSxPQUEyQjtRQUM5SCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxxQkFBcUIsQ0FBQztZQUM3RSxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsOEJBQThCLEVBQUUsdUNBQXVDLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLDRCQUE0QixFQUFFLDRDQUE0QyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1NBQy9RLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLDJCQUEyQixDQUFDLENBQUMsQ0FBQztRQUMxRSxDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFlBQVksRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBQzNGLElBQUksQ0FBQztZQUNKLDhCQUE4QjtZQUM5QixNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFekQsd0JBQXdCO1lBQ3hCLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZFLENBQUM7Z0JBQVMsQ0FBQztZQUVWLFdBQVc7WUFDWCxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3BDLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLGVBQWUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ3RFLENBQUM7Q0FDRCxDQUFBO0FBM0NZLHlCQUF5QjtJQUtuQyxXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxrQ0FBa0MsQ0FBQTtJQUNsQyxXQUFBLDZCQUE2QixDQUFBO0lBQzdCLFdBQUEsYUFBYSxDQUFBO0dBVEgseUJBQXlCLENBMkNyQzs7QUFFRCxpQkFBaUIsQ0FBQyxvQkFBb0IsRUFBRSx5QkFBeUIsb0NBQTRCLENBQUMifQ==