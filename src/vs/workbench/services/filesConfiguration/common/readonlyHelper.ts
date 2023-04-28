/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { FileSystemProviderCapabilities, IFileService, IFileStatWithMetadata } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ResourceGlobMatcher } from 'vs/workbench/common/resources';

/** a singleton instance stored in ReadonlyHelperNoResource. */
class GlobManager extends Disposable {
	/** so we can change the names easily. */
	static include = 'files.readonlyInclude';
	static exclude = 'files.readonlyExclude';
	static path = 'files.readonlyPath';
	static ignoreReadonlyStat = 'files.ignoreReadonlyStat';

	private getGlobs(key: string, root?: URI) {
		return this.configurationService.getValue<{ [glob: string]: boolean }>(key);
	}

	private makeRGM(key: string, contextService: IWorkspaceContextService, configurationService: IConfigurationService) {
		const rgm = new ResourceGlobMatcher(
			(root?: URI) => this.getGlobs(key, root),
			(event) => event.affectsConfiguration(key),
			contextService, configurationService);
		this._register(rgm);
		return rgm;
	}

	includeMatcher: ResourceGlobMatcher;
	excludeMatcher: ResourceGlobMatcher;
	exactPathMatcher: ResourceGlobMatcher; // For interactive/keychord/command extension; affects specific File/Editor.

	constructor(
		contextService: IWorkspaceContextService,
		readonly configurationService: IConfigurationService,
	) {
		super();
		this.includeMatcher = this.makeRGM(GlobManager.include, contextService, configurationService);
		this.excludeMatcher = this.makeRGM(GlobManager.exclude, contextService, configurationService);
		this.exactPathMatcher = this.makeRGM(GlobManager.path, contextService, configurationService);
	}
}

class ReadonlyHelperNoResource extends Disposable {
	static globManager: GlobManager;

	constructor(
		contextService: IWorkspaceContextService,
		readonly configurationService: IConfigurationService,
	) {
		super();
		if (!ReadonlyHelperNoResource.globManager) {
			ReadonlyHelperNoResource.globManager = new GlobManager(contextService, configurationService);
		}
		this._register(configurationService.onDidChangeConfiguration(e => this.onDidChangeConfiguration(e)));
	}

	/** When ignoreReadonlyStat is true, chmod -w files are treated as NOT readonly. */
	protected ignoreReadonlyStat: boolean = this.configurationService.getValue(GlobManager.ignoreReadonlyStat);

	protected onDidChangeConfiguration(event: IConfigurationChangeEvent) {
		if (event.affectsConfiguration(GlobManager.ignoreReadonlyStat)) {
			this.ignoreReadonlyStat = this.configurationService.getValue(GlobManager.ignoreReadonlyStat);
		}
	}

	/** if the resource is matched by either set of Globs, that determines isReadonly() */
	isGlobReadonly(resource: URI) {
		const isInclude = ReadonlyHelper.globManager.includeMatcher.matches(resource);
		const isExclude = ReadonlyHelper.globManager.excludeMatcher.matches(resource);
		const isSpecified = isInclude || isExclude;
		return isSpecified ? isInclude && !isExclude : null;
	}
}

export class ReadonlyHelper extends ReadonlyHelperNoResource {
	/** singleton ReadonlyHelper for isGlobReadonly(resource) queries from FileService. */
	static fileServiceHelper: ReadonlyHelperNoResource;

	constructor(
		readonly resource: URI,
		readonly onDidChangeReadonly: Emitter<void>,
		readonly fileService: IFileService,
		contextService: IWorkspaceContextService,
		configurationService: IConfigurationService,
	) {
		super(contextService, configurationService);
		const rhgm = ReadonlyHelper.globManager;
		this._register(rhgm.includeMatcher.onExpressionChange(() => this.include_exclude_GlobsChanged()));
		this._register(rhgm.excludeMatcher.onExpressionChange(() => this.include_exclude_GlobsChanged()));
		this._register(rhgm.exactPathMatcher.onExpressionChange(() => this.pathGlobsChanged()));

		this.globReadonly = this.isGlobReadonly(resource);    // and then track with onDidChangeConfiguration()

		if (!ReadonlyHelper.fileServiceHelper) {
			const rh = ReadonlyHelper.fileServiceHelper = new ReadonlyHelperNoResource(contextService, configurationService);
			fileService.setReadonlyQueryFn((readonly: boolean | undefined, resource: URI) => {
				const rv = rh.isGlobReadonly(resource);
				return rv === null ? readonly : rv;
			});
		}
	}

	protected lastResolvedFileStat: IFileStatWithMetadata | undefined;

	setLastResolvedFileStat(fileStat: IFileStatWithMetadata) {
		this.lastResolvedFileStat = fileStat;
	}

	override onDidChangeConfiguration(event: IConfigurationChangeEvent) {
		if (event.affectsConfiguration(GlobManager.ignoreReadonlyStat)) {
			this.ignoreReadonlyStat = this.configurationService.getValue(GlobManager.ignoreReadonlyStat);
			this.isReadonly(); // fire event if/when onDidChangeReadonly
		}
	}

	protected include_exclude_GlobsChanged() {
		this.globReadonly = this.isGlobReadonly(this.resource);
		this.isReadonly(); // fire event if/when onDidChangeReadonly
	}

	/**
	 * Exact path can specify: true, false, toggle [flip] or null [ignore].
	 * Used by interactive command/keybinding to set, clear or toggle isReadonly.
	 */
	protected pathGlobsChanged() {
		const readonlyPath = this.configurationService.getValue<{ [glob: string]: boolean | null | 'toggle' }>(GlobManager.path);
		if (readonlyPath !== undefined) {
			const pathValue = readonlyPath[this.resource.path]; // specifically *this* path. NOT in other workspaces...
			// undefined indicates no mention of path; null indicates no_opinion/ignore.
			if (pathValue !== undefined) {
				if (pathValue === 'toggle') {
					// modify settings, so subsequent 'toggle' will be seen as a change:
					this.pathReadonly = readonlyPath[this.resource.path] = !this.oldReadonly;
					this.configurationService.updateValue(GlobManager.path, readonlyPath, ConfigurationTarget.USER);
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

