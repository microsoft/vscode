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
import { promises } from 'fs';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname, join } from '../../../../base/common/path.js';
import { Promises } from '../../../../base/node/pfs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
let CodeCacheCleaner = class CodeCacheCleaner extends Disposable {
    constructor(currentCodeCachePath, productService, logService) {
        super();
        this.logService = logService;
        this.dataMaxAge = productService.quality !== 'stable'
            ? 1000 * 60 * 60 * 24 * 7 // roughly 1 week (insiders)
            : 1000 * 60 * 60 * 24 * 30 * 3; // roughly 3 months (stable)
        // Cached data is stored as user data and we run a cleanup task every time
        // the editor starts. The strategy is to delete all files that are older than
        // 3 months (1 week respectively)
        if (currentCodeCachePath) {
            const scheduler = this._register(new RunOnceScheduler(() => {
                this.cleanUpCodeCaches(currentCodeCachePath);
            }, 30 * 1000 /* after 30s */));
            scheduler.schedule();
        }
    }
    async cleanUpCodeCaches(currentCodeCachePath) {
        this.logService.trace('[code cache cleanup]: Starting to clean up old code cache folders.');
        try {
            const now = Date.now();
            // The folder which contains folders of cached data.
            // Each of these folders is partioned per commit
            const codeCacheRootPath = dirname(currentCodeCachePath);
            const currentCodeCache = basename(currentCodeCachePath);
            const codeCaches = await Promises.readdir(codeCacheRootPath);
            await Promise.all(codeCaches.map(async (codeCache) => {
                if (codeCache === currentCodeCache) {
                    return; // not the current cache folder
                }
                // Delete cache folder if old enough
                const codeCacheEntryPath = join(codeCacheRootPath, codeCache);
                const codeCacheEntryStat = await promises.stat(codeCacheEntryPath);
                if (codeCacheEntryStat.isDirectory() && (now - codeCacheEntryStat.mtime.getTime()) > this.dataMaxAge) {
                    this.logService.trace(`[code cache cleanup]: Removing code cache folder ${codeCache}.`);
                    return Promises.rm(codeCacheEntryPath);
                }
            }));
        }
        catch (error) {
            onUnexpectedError(error);
        }
    }
};
CodeCacheCleaner = __decorate([
    __param(1, IProductService),
    __param(2, ILogService)
], CodeCacheCleaner);
export { CodeCacheCleaner };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUNhY2hlQ2xlYW5lci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2NvZGUvZWxlY3Ryb24tdXRpbGl0eS9zaGFyZWRQcm9jZXNzL2NvbnRyaWIvY29kZUNhY2hlQ2xlYW5lci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzlCLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUVqRixJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFpQixTQUFRLFVBQVU7SUFJL0MsWUFDQyxvQkFBd0MsRUFDdkIsY0FBK0IsRUFDbEIsVUFBdUI7UUFFckQsS0FBSyxFQUFFLENBQUM7UUFGc0IsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUlyRCxJQUFJLENBQUMsVUFBVSxHQUFHLGNBQWMsQ0FBQyxPQUFPLEtBQUssUUFBUTtZQUNwRCxDQUFDLENBQUMsSUFBSSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBRyw0QkFBNEI7WUFDeEQsQ0FBQyxDQUFDLElBQUksR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsNEJBQTRCO1FBRTdELDBFQUEwRTtRQUMxRSw2RUFBNkU7UUFDN0UsaUNBQWlDO1FBQ2pDLElBQUksb0JBQW9CLEVBQUUsQ0FBQztZQUMxQixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZ0JBQWdCLENBQUMsR0FBRyxFQUFFO2dCQUMxRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztZQUM5QyxDQUFDLEVBQUUsRUFBRSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO1lBQy9CLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUN0QixDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxvQkFBNEI7UUFDM0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsb0VBQW9FLENBQUMsQ0FBQztRQUU1RixJQUFJLENBQUM7WUFDSixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFFdkIsb0RBQW9EO1lBQ3BELGdEQUFnRDtZQUNoRCxNQUFNLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1lBQ3hELE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFFeEQsTUFBTSxVQUFVLEdBQUcsTUFBTSxRQUFRLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7WUFDN0QsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFDLFNBQVMsRUFBQyxFQUFFO2dCQUNsRCxJQUFJLFNBQVMsS0FBSyxnQkFBZ0IsRUFBRSxDQUFDO29CQUNwQyxPQUFPLENBQUMsK0JBQStCO2dCQUN4QyxDQUFDO2dCQUVELG9DQUFvQztnQkFDcEMsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQzlELE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxRQUFRLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQ25FLElBQUksa0JBQWtCLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxHQUFHLEdBQUcsa0JBQWtCLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUN0RyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxvREFBb0QsU0FBUyxHQUFHLENBQUMsQ0FBQztvQkFFeEYsT0FBTyxRQUFRLENBQUMsRUFBRSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQ3hDLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUIsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBeERZLGdCQUFnQjtJQU0xQixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsV0FBVyxDQUFBO0dBUEQsZ0JBQWdCLENBd0Q1QiJ9