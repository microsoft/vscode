/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { isWindows } from '../../../../base/common/platform.js';
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';

const SETTING_ID = 'workbench.experimental.styleOverrides';

/**
 * A development-only contribution that loads one or more CSS files referenced by the
 * `workbench.experimental.styleOverrides` setting and injects their contents into the
 * workbench so they override the shipped product CSS.
 *
 * The files are concatenated in the order they are listed (so later files win over
 * earlier ones) and are watched for changes, allowing style ideas to be iterated on
 * live without reloading the window.
 */
export class StyleOverridesContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.styleOverrides';

	private readonly styleElement = this._register(new MutableDisposable<DisposableStore>());
	private readonly fileWatchers = this._register(new DisposableStore());

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IPathService private readonly pathService: IPathService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SETTING_ID)) {
				this.update();
			}
		}));

		this._register(this.fileService.onDidFilesChange(e => {
			const uris = this.resolveUris();
			if (uris.some(uri => e.contains(uri))) {
				this.applyOverrides(uris);
			}
		}));

		this.update();
	}

	private update(): void {
		const uris = this.resolveUris();

		this.logService.info(`[styleOverrides] Setting '${SETTING_ID}' resolved to ${uris.length} file(s): ${uris.map(u => u.toString(true)).join(', ')}`);

		// Refresh the set of watched files
		this.fileWatchers.clear();
		for (const uri of uris) {
			this.fileWatchers.add(this.fileService.watch(uri));
		}

		this.applyOverrides(uris);
	}

	private resolveUris(): URI[] {
		const entries = this.configurationService.getValue<string[]>(SETTING_ID);
		if (!Array.isArray(entries)) {
			return [];
		}

		const result: URI[] = [];
		for (const entry of entries) {
			if (typeof entry !== 'string' || entry.trim().length === 0) {
				continue;
			}

			const uri = this.toUri(entry.trim());
			if (uri) {
				result.push(uri);
			}
		}

		return result;
	}

	private toUri(entry: string): URI | undefined {
		// Home directory: ~ or ~/relative/path
		if (entry === '~' || entry.startsWith('~/')) {
			const home = this.pathService.resolvedUserHome;
			if (!home) {
				this.logService.warn(`[styleOverrides] Cannot resolve '~' before the user home is known: ${entry}`);
				return undefined;
			}
			const rest = entry.slice(1).replace(/^\/+/, '');
			return rest ? URI.joinPath(home, rest) : home;
		}

		// Full URI with a scheme (e.g. file:///, vscode-userdata:/)
		if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(entry) && !this.looksLikeWindowsPath(entry)) {
			try {
				return URI.parse(entry);
			} catch {
				this.logService.warn(`[styleOverrides] Ignoring malformed URI: ${entry}`);
				return undefined;
			}
		}

		// Absolute filesystem path
		if (entry.startsWith('/') || this.looksLikeWindowsPath(entry)) {
			return URI.file(entry);
		}

		// Relative path: resolve against the first workspace folder
		const folder = this.contextService.getWorkspace().folders[0];
		if (folder) {
			return URI.joinPath(folder.uri, entry);
		}

		this.logService.warn(`[styleOverrides] Cannot resolve relative path without an open workspace: ${entry}`);
		return undefined;
	}

	private looksLikeWindowsPath(entry: string): boolean {
		return isWindows && /^[a-zA-Z]:[\\/]/.test(entry);
	}

	private async applyOverrides(uris: URI[]): Promise<void> {
		if (uris.length === 0) {
			this.styleElement.clear();
			return;
		}

		const sections: string[] = [];
		for (const uri of uris) {
			try {
				const content = await this.fileService.readFile(uri);
				sections.push(`/* ${uri.toString(true)} */\n${content.value.toString()}`);
				this.logService.info(`[styleOverrides] Loaded CSS override: ${uri.toString(true)}`);
			} catch (error) {
				this.logService.warn(`[styleOverrides] Failed to read CSS override file ${uri.toString(true)}: ${error}`);
			}
		}

		const css = sections.join('\n\n');

		// Re-create the style element so it is appended last in <head> and therefore
		// takes precedence over the product CSS for rules of equal specificity.
		const store = new DisposableStore();
		createStyleSheet(undefined, style => style.textContent = css, store);
		this.styleElement.value = store;

		this.logService.info(`[styleOverrides] Applied ${sections.length} CSS override file(s), ${css.length} bytes.`);
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[SETTING_ID]: {
			type: 'array',
			items: {
				type: 'string'
			},
			default: [],
			scope: ConfigurationScope.MACHINE_OVERRIDABLE,
			tags: ['experimental'],
			markdownDescription: localize('styleOverrides', "A list of CSS files whose contents are injected into the workbench to override the built-in product styles. Useful for prototyping style ideas. Entries can be absolute paths, home-relative paths (starting with `~/`), URIs, or paths relative to the first workspace folder. Files are applied in order (later files override earlier ones) and are watched for live changes. This is an experimental, development-only setting.")
		}
	}
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(StyleOverridesContribution, LifecyclePhase.Restored);
