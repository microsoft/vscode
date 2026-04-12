/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { app } from 'electron';
import { disposableTimeout } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isWindows } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
/**
 * A listener for URLs that are opened from the OS and handled by VSCode.
 * Depending on the platform, this works differently:
 * - Windows: we use `app.setAsDefaultProtocolClient()` to register VSCode with the OS
 *            and additionally add the `open-url` command line argument to identify.
 * - macOS:   we rely on `app.on('open-url')` to be called by the OS
 * - Linux:   we have a special shortcut installed (`resources/linux/code-url-handler.desktop`)
 *            that calls VSCode with the `open-url` command line argument
 *            (https://github.com/microsoft/vscode/pull/56727)
 */
export class ElectronURLListener extends Disposable {
    constructor(initialProtocolUrls, urlService, windowsMainService, environmentMainService, productService, logService) {
        super();
        this.urlService = urlService;
        this.logService = logService;
        this.uris = [];
        this.retryCount = 0;
        if (initialProtocolUrls) {
            logService.trace('ElectronURLListener initialUrisToHandle:', initialProtocolUrls.map(url => url.originalUrl));
            // the initial set of URIs we need to handle once the window is ready
            this.uris = initialProtocolUrls;
        }
        // Windows: install as protocol handler
        // Skip in portable mode: the registered command wouldn't preserve
        // portable mode settings, causing issues with OAuth flows.
        // Skip for embedded apps: protocol handler is registered at install time.
        if (isWindows && !environmentMainService.isPortable && !process.isEmbeddedApp) {
            const windowsParameters = environmentMainService.isBuilt ? [] : [`"${environmentMainService.appRoot}"`];
            windowsParameters.push('--open-url', '--');
            app.setAsDefaultProtocolClient(productService.urlProtocol, process.execPath, windowsParameters);
        }
        // macOS: listen to `open-url` events from here on to handle
        const onOpenElectronUrl = Event.map(Event.fromNodeEventEmitter(app, 'open-url', (event, url) => ({ event, url })), ({ event, url }) => {
            event.preventDefault(); // always prevent default and return the url as string
            return url;
        });
        this._register(onOpenElectronUrl(url => {
            const uri = this.uriFromRawUrl(url);
            if (!uri) {
                return;
            }
            this.urlService.open(uri, { originalUrl: url });
        }));
        // Send initial links to the window once it has loaded
        const isWindowReady = windowsMainService.getWindows()
            .filter(window => window.isReady)
            .length > 0;
        if (isWindowReady) {
            logService.trace('ElectronURLListener: window is ready to handle URLs');
            this.flush();
        }
        else {
            logService.trace('ElectronURLListener: waiting for window to be ready to handle URLs...');
            this._register(Event.once(windowsMainService.onDidSignalReadyWindow)(() => this.flush()));
        }
    }
    uriFromRawUrl(url) {
        try {
            return URI.parse(url);
        }
        catch (e) {
            return undefined;
        }
    }
    async flush() {
        if (this.retryCount++ > 10) {
            this.logService.trace('ElectronURLListener#flush(): giving up after 10 retries');
            return;
        }
        this.logService.trace('ElectronURLListener#flush(): flushing URLs');
        const uris = [];
        for (const obj of this.uris) {
            const handled = await this.urlService.open(obj.uri, { originalUrl: obj.originalUrl });
            if (handled) {
                this.logService.trace('ElectronURLListener#flush(): URL was handled', obj.originalUrl);
            }
            else {
                this.logService.trace('ElectronURLListener#flush(): URL was not yet handled', obj.originalUrl);
                uris.push(obj);
            }
        }
        if (uris.length === 0) {
            return;
        }
        this.uris = uris;
        disposableTimeout(() => this.flush(), 500, this._store);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxlY3Ryb25VcmxMaXN0ZW5lci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VybC9lbGVjdHJvbi1tYWluL2VsZWN0cm9uVXJsTGlzdGVuZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBMEIsTUFBTSxVQUFVLENBQUM7QUFDdkQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDbEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQWdCLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQVFsRDs7Ozs7Ozs7O0dBU0c7QUFDSCxNQUFNLE9BQU8sbUJBQW9CLFNBQVEsVUFBVTtJQUtsRCxZQUNDLG1CQUErQyxFQUM5QixVQUF1QixFQUN4QyxrQkFBdUMsRUFDdkMsc0JBQStDLEVBQy9DLGNBQStCLEVBQ2QsVUFBdUI7UUFFeEMsS0FBSyxFQUFFLENBQUM7UUFOUyxlQUFVLEdBQVYsVUFBVSxDQUFhO1FBSXZCLGVBQVUsR0FBVixVQUFVLENBQWE7UUFUakMsU0FBSSxHQUFtQixFQUFFLENBQUM7UUFDMUIsZUFBVSxHQUFHLENBQUMsQ0FBQztRQVl0QixJQUFJLG1CQUFtQixFQUFFLENBQUM7WUFDekIsVUFBVSxDQUFDLEtBQUssQ0FBQywwQ0FBMEMsRUFBRSxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztZQUU5RyxxRUFBcUU7WUFDckUsSUFBSSxDQUFDLElBQUksR0FBRyxtQkFB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