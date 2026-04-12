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
import { BrowserWindow } from 'electron';
import { Limiter } from '../../../base/common/async.js';
import { ILogService } from '../../log/common/log.js';
import { isURLDomainTrusted } from '../../url/common/trustedDomains.js';
import { WebContentCache } from './webContentCache.js';
import { WebPageLoader } from './webPageLoader.js';
let NativeWebContentExtractorService = class NativeWebContentExtractorService {
    constructor(_logger) {
        this._logger = _logger;
        // Only allow 3 windows to be opened at a time
        // to avoid overwhelming the system with too many processes.
        this._limiter = new Limiter(3);
        this._webContentsCache = new WebContentCache();
    }
    extract(uris, options) {
        if (uris.length === 0) {
            this._logger.info('No URIs provided for extraction');
            return Promise.resolve([]);
        }
        this._logger.info(`Extracting content from ${uris.length} URIs`);
        return Promise.all(uris.map((uri) => this._limiter.queue(() => this.doExtract(uri, options))));
    }
    async doExtract(uri, options) {
        const cached = this._webContentsCache.tryGet(uri, options);
        if (cached !== undefined) {
            this._logger.info(`Found cached content for ${uri.toString()}`);
            return cached;
        }
        const loader = new WebPageLoader((options) => new BrowserWindow(options), this._logger, uri, options, (uri) => isURLDomainTrusted(uri, options?.trustedDomains || []));
        try {
            const result = await loader.load();
            this._webContentsCache.add(uri, options, result);
            return result;
        }
        finally {
            loader.dispose();
        }
    }
};
NativeWebContentExtractorService = __decorate([
    __param(0, ILogService)
], NativeWebContentExtractorService);
export { NativeWebContentExtractorService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS93ZWJDb250ZW50RXh0cmFjdG9yL2VsZWN0cm9uLW1haW4vd2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN6QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFeEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRXhFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN2RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFNUMsSUFBTSxnQ0FBZ0MsR0FBdEMsTUFBTSxnQ0FBZ0M7SUFRNUMsWUFBeUIsT0FBcUM7UUFBcEIsWUFBTyxHQUFQLE9BQU8sQ0FBYTtRQUw5RCw4Q0FBOEM7UUFDOUMsNERBQTREO1FBQ3BELGFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBMEIsQ0FBQyxDQUFDLENBQUM7UUFDbkQsc0JBQWlCLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUVnQixDQUFDO0lBRW5FLE9BQU8sQ0FBQyxJQUFXLEVBQUUsT0FBcUM7UUFDekQsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLENBQUM7WUFDckQsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVCLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQywyQkFBMkIsSUFBSSxDQUFDLE1BQU0sT0FBTyxDQUFDLENBQUM7UUFDakUsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hHLENBQUM7SUFFRCxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQVEsRUFBRSxPQUFnRDtRQUN6RSxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMzRCxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyw0QkFBNEIsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNoRSxPQUFPLE1BQU0sQ0FBQztRQUNmLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLGFBQWEsQ0FDL0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLElBQUksYUFBYSxDQUFDLE9BQU8sQ0FBQyxFQUN2QyxJQUFJLENBQUMsT0FBTyxFQUNaLEdBQUcsRUFDSCxPQUFPLEVBQ1AsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxPQUFPLEVBQUUsY0FBYyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFbEUsSUFBSSxDQUFDO1lBQ0osTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDbkMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ2pELE9BQU8sTUFBTSxDQUFDO1FBQ2YsQ0FBQztnQkFBUyxDQUFDO1lBQ1YsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2xCLENBQUM7SUFDRixDQUFDO0NBQ0QsQ0FBQTtBQXpDWSxnQ0FBZ0M7SUFRL0IsV0FBQSxXQUFXLENBQUE7R0FSWixnQ0FBZ0MsQ0F5QzVDIn0=