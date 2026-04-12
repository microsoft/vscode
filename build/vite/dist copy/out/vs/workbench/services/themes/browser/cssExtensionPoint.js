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
import * as nls from '../../../../nls.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { isProposedApiEnabled } from '../../extensions/common/extensions.js';
import * as resources from '../../../../base/common/resources.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { FileAccess } from '../../../../base/common/network.js';
import { createLinkElement } from '../../../../base/browser/dom.js';
import { IWorkbenchThemeService } from '../common/workbenchThemeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
const CSS_CACHE_STORAGE_KEY = 'workbench.contrib.css.cache';
const cssExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'css',
    jsonSchema: {
        description: nls.localize('contributes.css', "Contributes CSS files to be loaded in the workbench."),
        type: 'array',
        items: {
            type: 'object',
            properties: {
                path: {
                    description: nls.localize('contributes.css.path', "Path to the CSS file. The path is relative to the extension folder."),
                    type: 'string'
                }
            },
            required: ['path']
        },
        defaultSnippets: [{ body: [{ path: '${1:styles.css}' }] }]
    }
});
class CSSFileWatcher {
    constructor(fileService, environmentService, onUpdate) {
        this.fileService = fileService;
        this.environmentService = environmentService;
        this.onUpdate = onUpdate;
        this.watchedLocations = new Map();
    }
    watch(uri) {
        const key = uri.toString();
        if (this.watchedLocations.has(key)) {
            return;
        }
        if (!this.environmentService.isExtensionDevelopment) {
            return;
        }
        const disposables = new DisposableStore();
        disposables.add(this.fileService.watch(uri));
        disposables.add(this.fileService.onDidFilesChange(e => {
            if (e.contains(uri, 0 /* FileChangeType.UPDATED */)) {
                this.onUpdate(uri);
            }
        }));
        this.watchedLocations.set(key, { uri, disposables });
    }
    unwatch(uri) {
        const key = uri.toString();
        const entry = this.watchedLocations.get(key);
        if (entry) {
            entry.disposables.dispose();
            this.watchedLocations.delete(key);
        }
    }
    dispose() {
        for (const entry of this.watchedLocations.values()) {
            entry.disposables.dispose();
        }
        this.watchedLocations.clear();
    }
}
let CSSExtensionPoint = class CSSExtensionPoint {
    constructor(fileService, environmentService, themeService, storageService) {
        this.themeService = themeService;
        this.storageService = storageService;
        this.disposables = new DisposableStore();
        this.stylesheetsByExtension = new Map();
        this.pendingExtensions = new Map();
        this.watcher = this.disposables.add(new CSSFileWatcher(fileService, environmentService, uri => this.reloadStylesheet(uri)));
        this.disposables.add(toDisposable(() => {
            for (const entries of this.stylesheetsByExtension.values()) {
                for (const entry of entries) {
                    entry.disposables.dispose();
                }
            }
            this.stylesheetsByExtension.clear();
        }));
        // Apply cached CSS immediately on startup if a theme from the cached extension is active
        this.applyCachedCSS();
        // Listen to theme changes to activate/deactivate CSS
        this.disposables.add(this.themeService.onDidColorThemeChange(() => this.onThemeChange()));
        this.disposables.add(this.themeService.onDidFileIconThemeChange(() => this.onThemeChange()));
        this.disposables.add(this.themeService.onDidProductIconThemeChange(() => this.onThemeChange()));
        cssExtensionPoint.setHandler((extensions, delta) => {
            // Handle removed extensions
            for (const extension of delta.removed) {
                const extensionId = extension.description.identifier.value;
                this.pendingExtensions.delete(extensionId);
                this.removeStylesheets(extensionId);
                this.clearCacheForExtension(extensionId);
            }
            // Handle added extensions
            for (const extension of delta.added) {
                if (!isProposedApiEnabled(extension.description, 'css')) {
                    extension.collector.error(`The '${cssExtensionPoint.name}' contribution point is proposed API.`);
                    continue;
                }
                const extensionValue = extension.value;
                const collector = extension.collector;
                if (!extensionValue || !Array.isArray(extensionValue)) {
                    collector.error(nls.localize('invalid.css.configuration', "'contributes.css' must be an array."));
                    continue;
                }
                const extensionId = extension.description.identifier.value;
                // Store the extension for later activation
                this.pendingExtensions.set(extensionId, extension);
                // Check if this extension's theme is currently active
                if (this.isExtensionThemeActive(extensionId)) {
                    this.activateExtensionCSS(extension);
                }
                else if (this.stylesheetsByExtension.has(extensionId)) {
                    // Theme is no longer active but cached CSS is still loaded — remove it
                    this.removeStylesheets(extensionId);
                    this.clearCacheForExtension(extensionId);
                }
            }
        });
    }
    isExtensionThemeActive(extensionId) {
        const colorTheme = this.themeService.getColorTheme();
        const fileIconTheme = this.themeService.getFileIconTheme();
        const productIconTheme = this.themeService.getProductIconTheme();
        return !!(colorTheme.extensionData && ExtensionIdentifier.equals(colorTheme.extensionData.extensionId, extensionId)) ||
            !!(fileIconTheme.extensionData && ExtensionIdentifier.equals(fileIconTheme.extensionData.extensionId, extensionId)) ||
            !!(productIconTheme.extensionData && ExtensionIdentifier.equals(productIconTheme.extensionData.extensionId, extensionId));
    }
    onThemeChange() {
        // Activate pending extensions whose theme just became active
        for (const [extensionId, extension] of this.pendingExtensions) {
            if (!this.stylesheetsByExtension.has(extensionId) && this.isExtensionThemeActive(extensionId)) {
                this.activateExtensionCSS(extension);
            }
        }
        // Deactivate all extensions whose theme is no longer active,
        // including cached CSS that may not yet be in pendingExtensions
        for (const extensionId of this.stylesheetsByExtension.keys()) {
            if (!this.isExtensionThemeActive(extensionId)) {
                this.removeStylesheets(extensionId);
                this.clearCacheForExtension(extensionId);
            }
        }
    }
    activateExtensionCSS(extension) {
        const extensionId = extension.description.identifier.value;
        // Already activated (e.g., from cache on startup)
        if (this.stylesheetsByExtension.has(extensionId)) {
            return;
        }
        const extensionLocation = extension.description.extensionLocation;
        const extensionValue = extension.value;
        const collector = extension.collector;
        const entries = [];
        const cssLocations = [];
        for (const cssContribution of extensionValue) {
            if (!cssContribution.path || typeof cssContribution.path !== 'string') {
                collector.error(nls.localize('invalid.css.path', "'contributes.css.path' must be a string."));
                continue;
            }
            const cssLocation = resources.joinPath(extensionLocation, cssContribution.path);
            // Validate that the CSS file is within the extension folder
            if (!resources.isEqualOrParent(cssLocation, extensionLocation)) {
                collector.warn(nls.localize('invalid.css.path.location', "Expected 'contributes.css.path' ({0}) to be included inside extension's folder ({1}).", cssLocation.path, extensionLocation.path));
                continue;
            }
            const entryDisposables = new DisposableStore();
            const element = this.createCSSLinkElement(cssLocation, extensionId, entryDisposables);
            entries.push({ uri: cssLocation, element, disposables: entryDisposables });
            cssLocations.push(cssLocation.toString());
            // Watch for changes
            this.watcher.watch(cssLocation);
        }
        if (entries.length > 0) {
            this.stylesheetsByExtension.set(extensionId, entries);
            // Cache the CSS locations for faster startup next time
            this.cacheExtensionCSS(extensionId, cssLocations);
        }
    }
    removeStylesheets(extensionId) {
        const entries = this.stylesheetsByExtension.get(extensionId);
        if (entries) {
            for (const entry of entries) {
                this.watcher.unwatch(entry.uri);
                entry.disposables.dispose();
            }
            this.stylesheetsByExtension.delete(extensionId);
        }
    }
    applyCachedCSS() {
        const cached = this.getCachedCSS();
        if (!cached) {
            return;
        }
        // Check if a theme from the cached extension is active
        if (!this.isExtensionThemeActive(cached.extensionId)) {
            // Theme changed, invalidate the cache
            this.clearCacheForExtension(cached.extensionId);
            return;
        }
        // Apply cached CSS immediately
        const entries = [];
        for (const cssLocationString of cached.cssLocations) {
            const cssLocation = URI.parse(cssLocationString);
            const entryDisposables = new DisposableStore();
            const element = this.createCSSLinkElement(cssLocation, cached.extensionId, entryDisposables);
            entries.push({ uri: cssLocation, element, disposables: entryDisposables });
            // Watch for changes
            this.watcher.watch(cssLocation);
        }
        if (entries.length > 0) {
            this.stylesheetsByExtension.set(cached.extensionId, entries);
        }
    }
    getCachedCSS() {
        const raw = this.storageService.get(CSS_CACHE_STORAGE_KEY, 0 /* StorageScope.PROFILE */);
        if (!raw) {
            return undefined;
        }
        try {
            return JSON.parse(raw);
        }
        catch {
            return undefined;
        }
    }
    cacheExtensionCSS(extensionId, cssLocations) {
        const entry = { extensionId, cssLocations };
        this.storageService.store(CSS_CACHE_STORAGE_KEY, JSON.stringify(entry), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
    clearCacheForExtension(extensionId) {
        const cached = this.getCachedCSS();
        if (cached && ExtensionIdentifier.equals(cached.extensionId, extensionId)) {
            this.storageService.remove(CSS_CACHE_STORAGE_KEY, 0 /* StorageScope.PROFILE */);
        }
    }
    createCSSLinkElement(uri, extensionId, disposables) {
        const element = createLinkElement();
        element.rel = 'stylesheet';
        element.type = 'text/css';
        element.className = `extension-contributed-css ${extensionId}`;
        element.href = FileAccess.uriToBrowserUri(uri).toString(true);
        disposables.add(toDisposable(() => element.remove()));
        return element;
    }
    reloadStylesheet(uri) {
        const uriString = uri.toString();
        for (const entries of this.stylesheetsByExtension.values()) {
            for (const entry of entries) {
                if (entry.uri.toString() === uriString) {
                    // Cache-bust by adding a timestamp query parameter
                    const browserUri = FileAccess.uriToBrowserUri(uri);
                    entry.element.href = browserUri.with({ query: `v=${Date.now()}` }).toString(true);
                }
            }
        }
    }
    dispose() {
        this.disposables.dispose();
    }
};
CSSExtensionPoint = __decorate([
    __param(0, IFileService),
    __param(1, IBrowserWorkbenchEnvironmentService),
    __param(2, IWorkbenchThemeService),
    __param(3, IStorageService)
], CSSExtensionPoint);
export { CSSExtensionPoint };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3NzRXh0ZW5zaW9uUG9pbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGhlbWVzL2Jyb3dzZXIvY3NzRXh0ZW5zaW9uUG9pbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsa0JBQWtCLEVBQXVCLE1BQU0sK0NBQStDLENBQUM7QUFDeEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDN0UsT0FBTyxLQUFLLFNBQVMsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsWUFBWSxFQUFrQixNQUFNLDRDQUE0QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBTTNGLE1BQU0scUJBQXFCLEdBQUcsNkJBQTZCLENBQUM7QUFPNUQsTUFBTSxpQkFBaUIsR0FBRyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBdUI7SUFDekYsY0FBYyxFQUFFLEtBQUs7SUFDckIs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