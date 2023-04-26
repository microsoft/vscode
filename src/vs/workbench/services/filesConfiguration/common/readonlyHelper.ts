/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { FileSystemProviderCapabilities, IFileService, IFileStatWithMetadata } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ResourceGlobMatcher } from 'vs/workbench/common/resources';

/** so we can change the names easily. */
class Keys {
	static include = 'files.readonlyInclude';
	static exclude = 'files.readonlyExclude';
	static path = 'files.readonlyPath';
	static ignoreReadonlyStat = 'files.ignoreReadonlyStat';
}

export class ReadonlyHelper extends Disposable {
	private readonly disposables = new DisposableStore();

	private getGlobs(key: string, root?: URI) {
		return this.configurationService.getValue<{ [glob: string]: boolean }>(key);
	}

	private makeRGM(key: string, onChanged: () => void, contextService: IWorkspaceContextService, configurationService: IConfigurationService) {
		const rgm = new ResourceGlobMatcher(
			(root?: URI) => this.getGlobs(key, root),
			(event) => event.affectsConfiguration(key),
			contextService, configurationService);
		this.disposables.add(rgm);
		this.disposables.add(rgm.onExpressionChange(onChanged));
		return rgm;
	}
	includeMatcher: ResourceGlobMatcher;
	excludeMatcher: ResourceGlobMatcher;
	exactPathMatcher: ResourceGlobMatcher; // For interactive/keychord/command extension; affects specific File/Editor.

	constructor(
		readonly resource: URI,
		readonly onDidChangeReadonly: Emitter<void>,
		readonly fileService: IFileService,
		contextService: IWorkspaceContextService,
		readonly configurationService: IConfigurationService,
	) {
		super();
		this.includeMatcher = this.makeRGM(Keys.include, () => this.include_exclude_GlobsChanged(), contextService, configurationService);
		this.excludeMatcher = this.makeRGM(Keys.exclude, () => this.include_exclude_GlobsChanged(), contextService, configurationService);
		this.exactPathMatcher = this.makeRGM(Keys.path, () => this.pathGlobChanged(), contextService, configurationService);
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onDidChangeConfiguration(e)));
		this.setGlobReadonly(this.resource);    // and then track with onDidChangeConfiguration()
	}

	private lastResolvedFileStat: IFileStatWithMetadata | undefined;

	setLastResolvedFileStat(fileStat: IFileStatWithMetadata) {
		this.lastResolvedFileStat = fileStat;
	}

	/** When ignoreReadonlyStat is true, chmod -w files are treated as NOT readonly. */
	private ignoreReadonlyStat: boolean = this.configurationService.getValue(Keys.ignoreReadonlyStat);

	private onDidChangeConfiguration(event: IConfigurationChangeEvent) {
		if (event.affectsConfiguration(Keys.ignoreReadonlyStat)) {
			this.ignoreReadonlyStat = this.configurationService.getValue(Keys.ignoreReadonlyStat);
			this.isReadonly(); // fire event if/when onDidChangeReadonly
		}
	}

	/** if the resource is matched by either set of Globs, that determines isReadonly() */
	private setGlobReadonly(resource: URI) {
		const isInclude = this.includeMatcher.matches(resource);
		const isExclude = this.excludeMatcher.matches(resource);
		const isSpecified = isInclude || isExclude;
		this.globReadonly = isSpecified ? isInclude && !isExclude : null;
	}

	private include_exclude_GlobsChanged() {
		this.setGlobReadonly(this.resource);
		this.isReadonly(); // fire event if/when onDidChangeReadonly
	}

	/**
	 * Exact path can specify: true, false, toggle [flip] or null [ignore].
	 * Used by interactive command/keybinding to set, clear or toggle isReadonly.
	 */
	pathGlobChanged() {
		const readonlyPath = this.configurationService.getValue<{ [glob: string]: boolean | null | 'toggle' }>(Keys.path);
		if (readonlyPath !== undefined) {
			const pathValue = readonlyPath[this.resource.path]; // specifically *this* path. NOT in other workspaces...
			// undefined indicates no mention of path; null indicates no_opinion/ignore.
			if (pathValue !== undefined) {
				if (pathValue === 'toggle') {
					// modify settings, so subsequent 'toggle' will be seen as a change:
					this.pathReadonly = readonlyPath[this.resource.path] = !this.oldReadonly;
					this.configurationService.updateValue(Keys.path, readonlyPath, ConfigurationTarget.USER);
				} else {
					this.pathReadonly = pathValue;
				}
			}
		}
		this.isReadonly(); // fire event if/when onDidChangeReadonly
	}

	// tri-state: true | false overrides globReadonly; null does not.
	private pathReadonly: boolean | null = null;

	// stable/semantic 'readonly' [nonEditable]; typically based on filetype or directory.
	private globReadonly: boolean | null = null;

	// latest value derived from files.readonlyInclude/Exclude for this resource.path
	private oldReadonly = false; // fileEditorInput.test.ts counts changes from 'false' not 'undefined'

	/** when value returned by isReadonly() changes, fire the event. */
	private checkDidChangeReadonly(newReadonly: boolean): boolean {
		if (this.oldReadonly !== newReadonly) {
			this.oldReadonly = newReadonly;    // must set before fire(); reentrant.
			this.onDidChangeReadonly.fire();   // set/clear lock icon
		}
		return newReadonly;
	}

	/** return true if associated resource is treated as nonEditable. */
	isReadonly(): boolean {
		return this.checkDidChangeReadonly(
			this.fileService.hasCapability(this.resource, FileSystemProviderCapabilities.Readonly) ||
				this.pathReadonly !== null ? !!this.pathReadonly :
				this.globReadonly !== null ? !!this.globReadonly :
					!this.ignoreReadonlyStat ? (this.lastResolvedFileStat?.readonly || false) : false);
	}
}
