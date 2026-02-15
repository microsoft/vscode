/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { ExtensionsRegistry, IExtensionPointUser } from '../../extensions/common/extensionsRegistry.js';
import { isProposedApiEnabled } from '../../extensions/common/extensions.js';
import * as resources from '../../../../base/common/resources.js';
import { IFileService, FileChangeType } from '../../../../platform/files/common/files.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { FileAccess } from '../../../../base/common/network.js';
import { createLinkElement } from '../../../../base/browser/dom.js';
import { IWorkbenchThemeService } from '../common/workbenchThemeService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';

interface ICSSExtensionPoint {
	path: string;
}

const CSS_CACHE_STORAGE_KEY = 'workbench.contrib.css.cache';

interface ICSSCacheEntry {
	extensionId: string;
	cssLocations: string[];
}

const cssExtensionPoint = ExtensionsRegistry.registerExtensionPoint<ICSSExtensionPoint[]>({
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

class CSSFileWatcher implements IDisposable {

	private readonly watchedLocations = new Map<string, { readonly uri: URI; readonly disposables: DisposableStore }>();

	constructor(
		private readonly fileService: IFileService,
		private readonly environmentService: IBrowserWorkbenchEnvironmentService,
		private readonly onUpdate: (uri: URI) => void
	) { }

	watch(uri: URI): void {
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
			if (e.contains(uri, FileChangeType.UPDATED)) {
				this.onUpdate(uri);
			}
		}));
		this.watchedLocations.set(key, { uri, disposables });
	}

	unwatch(uri: URI): void {
		const key = uri.toString();
		const entry = this.watchedLocations.get(key);
		if (entry) {
			entry.disposables.dispose();
			this.watchedLocations.delete(key);
		}
	}

	dispose(): void {
		for (const entry of this.watchedLocations.values()) {
			entry.disposables.dispose();
		}
		this.watchedLocations.clear();
	}
}

export class CSSExtensionPoint {

	private readonly disposables = new DisposableStore();
	private readonly stylesheetsByExtension = new Map<string, { readonly uri: URI; readonly element: HTMLLinkElement; readonly disposables: DisposableStore }[]>();
	private readonly pendingExtensions = new Map<string, IExtensionPointUser<ICSSExtensionPoint[]>>();
	private readonly watcher: CSSFileWatcher;

	constructor(
		@IFileService fileService: IFileService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IStorageService private readonly storageService: IStorageService
	) {
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
			}
		});
	}

	private isExtensionThemeActive(extensionId: string): boolean {
		const colorTheme = this.themeService.getColorTheme();
		const fileIconTheme = this.themeService.getFileIconTheme();
		const productIconTheme = this.themeService.getProductIconTheme();

		return !!(colorTheme.extensionData && ExtensionIdentifier.equals(colorTheme.extensionData.extensionId, extensionId)) ||
			!!(fileIconTheme.extensionData && ExtensionIdentifier.equals(fileIconTheme.extensionData.extensionId, extensionId)) ||
			!!(productIconTheme.extensionData && ExtensionIdentifier.equals(productIconTheme.extensionData.extensionId, extensionId));
	}

	private onThemeChange(): void {
		// Check all pending extensions and activate/deactivate as needed
		for (const [extensionId, extension] of this.pendingExtensions) {
			const isActive = this.stylesheetsByExtension.has(extensionId);
			const shouldBeActive = this.isExtensionThemeActive(extensionId);

			if (shouldBeActive && !isActive) {
				this.activateExtensionCSS(extension);
			} else if (!shouldBeActive && isActive) {
				this.removeStylesheets(extensionId);
				this.clearCacheForExtension(extensionId);
			}
		}
	}

	private activateExtensionCSS(extension: IExtensionPointUser<ICSSExtensionPoint[]>): void {
		const extensionId = extension.description.identifier.value;

		// Already activated (e.g., from cache on startup)
		if (this.stylesheetsByExtension.has(extensionId)) {
			return;
		}

		const extensionLocation = extension.description.extensionLocation;
		const extensionValue = extension.value;
		const collector = extension.collector;

		const entries: { readonly uri: URI; readonly element: HTMLLinkElement; readonly disposables: DisposableStore }[] = [];
		const cssLocations: string[] = [];

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

	private removeStylesheets(extensionId: string): void {
		const entries = this.stylesheetsByExtension.get(extensionId);
		if (entries) {
			for (const entry of entries) {
				this.watcher.unwatch(entry.uri);
				entry.disposables.dispose();
			}
			this.stylesheetsByExtension.delete(extensionId);
		}
	}

	private applyCachedCSS(): void {
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
		const entries: { readonly uri: URI; readonly element: HTMLLinkElement; readonly disposables: DisposableStore }[] = [];

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

	private getCachedCSS(): ICSSCacheEntry | undefined {
		const raw = this.storageService.get(CSS_CACHE_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return undefined;
		}
		try {
			return JSON.parse(raw);
		} catch {
			return undefined;
		}
	}

	private cacheExtensionCSS(extensionId: string, cssLocations: string[]): void {
		const entry: ICSSCacheEntry = { extensionId, cssLocations };
		this.storageService.store(CSS_CACHE_STORAGE_KEY, JSON.stringify(entry), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private clearCacheForExtension(extensionId: string): void {
		const cached = this.getCachedCSS();
		if (cached && ExtensionIdentifier.equals(cached.extensionId, extensionId)) {
			this.storageService.remove(CSS_CACHE_STORAGE_KEY, StorageScope.PROFILE);
		}
	}

	private createCSSLinkElement(uri: URI, extensionId: string, disposables: DisposableStore): HTMLLinkElement {
		const element = createLinkElement();
		element.rel = 'stylesheet';
		element.type = 'text/css';
		element.className = `extension-contributed-css ${extensionId}`;
		element.href = FileAccess.uriToBrowserUri(uri).toString(true);
		disposables.add(toDisposable(() => element.remove()));
		return element;
	}

	private reloadStylesheet(uri: URI): void {
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

	dispose(): void {
		this.disposables.dispose();
	}
}
