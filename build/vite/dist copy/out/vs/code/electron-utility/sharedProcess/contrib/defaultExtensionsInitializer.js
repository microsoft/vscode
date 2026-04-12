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
import { dirname, join } from '../../../../base/common/path.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { INativeServerExtensionManagementService } from '../../../../platform/extensionManagement/node/extensionManagementService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
const defaultExtensionsInitStatusKey = 'initializing-default-extensions';
let DefaultExtensionsInitializer = class DefaultExtensionsInitializer extends Disposable {
    constructor(environmentService, extensionManagementService, storageService, fileService, logService, productService) {
        super();
        this.environmentService = environmentService;
        this.extensionManagementService = extensionManagementService;
        this.fileService = fileService;
        this.logService = logService;
        this.productService = productService;
        if (isWindows && storageService.getBoolean(defaultExtensionsInitStatusKey, -1 /* StorageScope.APPLICATION */, true)) {
            storageService.store(defaultExtensionsInitStatusKey, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            this.initializeDefaultExtensions().then(() => storageService.store(defaultExtensionsInitStatusKey, false, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */));
        }
    }
    async initializeDefaultExtensions() {
        const extensionsLocation = this.getDefaultExtensionVSIXsLocation();
        let stat;
        try {
            stat = await this.fileService.resolve(extensionsLocation);
            if (!stat.children) {
                this.logService.debug('There are no default extensions to initialize', extensionsLocation.toString());
                return;
            }
        }
        catch (error) {
            if (toFileOperationResult(error) === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                this.logService.debug('There are no default extensions to initialize', extensionsLocation.toString());
                return;
            }
            this.logService.error('Error initializing extensions', error);
            return;
        }
        const vsixs = stat.children.filter(child => child.name.toLowerCase().endsWith('.vsix'));
        if (vsixs.length === 0) {
            this.logService.debug('There are no default extensions to initialize', extensionsLocation.toString());
            return;
        }
        this.logService.info('Initializing default extensions', extensionsLocation.toString());
        await Promise.all(vsixs.map(async (vsix) => {
            this.logService.info('Installing default extension', vsix.resource.toString());
            try {
                await this.extensionManagementService.install(vsix.resource, { donotIncludePackAndDependencies: true, keepExisting: false });
                this.logService.info('Default extension installed', vsix.resource.toString());
            }
            catch (error) {
                this.logService.error('Error installing default extension', vsix.resource.toString(), getErrorMessage(error));
            }
        }));
        this.logService.info('Default extensions initialized', extensionsLocation.toString());
    }
    getDefaultExtensionVSIXsLocation() {
        if (this.productService.win32VersionedUpdate) {
            // appRoot = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\<version>\resources\app
            // extensionsPath = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\<version>\bootstrap\extensions
            return URI.file(join(dirname(dirname(dirname(this.environmentService.appRoot))), 'bootstrap', 'extensions'));
        }
        else {
            // appRoot = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\resources\app
            // extensionsPath = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\bootstrap\extensions
            return URI.file(join(dirname(dirname(this.environmentService.appRoot)), 'bootstrap', 'extensions'));
        }
    }
};
DefaultExtensionsInitializer = __decorate([
    __param(0, INativeEnvironmentService),
    __param(1, INativeServerExtensionManagementService),
    __param(2, IStorageService),
    __param(3, IFileService),
    __param(4, ILogService),
    __param(5, IProductService)
], DefaultExtensionsInitializer);
export { DefaultExtensionsInitializer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdEV4dGVuc2lvbnNJbml0aWFsaXplci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2NvZGUvZWxlY3Ryb24tdXRpbGl0eS9zaGFyZWRQcm9jZXNzL2NvbnRyaWIvZGVmYXVsdEV4dGVuc2lvbnNJbml0aWFsaXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZFQUE2RSxDQUFDO0FBQ3RJLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBdUIsWUFBWSxFQUFhLHFCQUFxQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDakksT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUV4RixNQUFNLDhCQUE4QixHQUFHLGlDQUFpQyxDQUFDO0FBRWxFLElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTZCLFNBQVEsVUFBVTtJQUMzRCxZQUM2QyxrQkFBNkMsRUFDL0IsMEJBQW1FLEVBQzVHLGNBQStCLEVBQ2pCLFdBQXlCLEVBQzFCLFVBQXVCLEVBQ25CLGNBQStCO1FBRWpFLEtBQUssRUFBRSxDQUFDO1FBUG9DLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBMkI7UUFDL0IsK0JBQTBCLEdBQTFCLDBCQUEwQixDQUF5QztRQUU5RixnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQUMxQixlQUFVLEdBQVYsVUFBVSxDQUFhO1FBQ25CLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUlqRSxJQUFJLFNBQVMsSUFBSSxjQUFjLENBQUMsVUFBVSxDQUFDLDhCQUE4QixxQ0FBNEIsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUM1RyxjQUFjLENBQUMsS0FBSyxDQUFDLDhCQUE4QixFQUFFLElBQUksbUVBQWtELENBQUM7WUFDNUcsSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsOEJBQThCLEVBQUUsS0FBSyxtRUFBa0QsQ0FBQyxDQUFDO1FBQzdKLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLDJCQUEyQjtRQUN4QyxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxDQUFDO1FBQ25FLElBQUksSUFBZSxDQUFDO1FBQ3BCLElBQUksQ0FBQztZQUNKLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDMUQsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDcEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsK0NBQStDLEVBQUUsa0JBQWtCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDdEcsT0FBTztZQUNSLENBQUM7UUFDRixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLHFCQUFxQixDQUFDLEtBQUssQ0FBQywrQ0FBdUMsRUFBRSxDQUFDO2dCQUN6RSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUN0RyxPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLCtCQUErQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzlELE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQ3RHLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsa0JBQWtCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUN2RixNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUMsSUFBSSxFQUFDLEVBQUU7WUFDeEMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsOEJBQThCLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQy9FLElBQUksQ0FBQztnQkFDSixNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLCtCQUErQixFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztnQkFDN0gsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsNkJBQTZCLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQy9FLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQy9HLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLEVBQUUsa0JBQWtCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUN2RixDQUFDO0lBRU8sZ0NBQWdDO1FBQ3ZDLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQzlDLHNHQUFzRztZQUN0RyxvSEFBb0g7WUFDcEgsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLFdBQVcsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDO1FBQzlHLENBQUM7YUFBTSxDQUFDO1lBQ1AsNEZBQTRGO1lBQzVGLDBHQUEwRztZQUMxRyxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsV0FBVyxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDckcsQ0FBQztJQUNGLENBQUM7Q0FFRCxDQUFBO0FBbEVZLDRCQUE0QjtJQUV0QyxXQUFBLHlCQUF5QixDQUFBO0lBQ3pCLFdBQUEsdUNBQXVDLENBQUE7SUFDdkMsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsV0FBVyxDQUFBO0lBQ1gsV0FBQSxlQUFlLENBQUE7R0FQTCw0QkFBNEIsQ0FrRXhDIn0=