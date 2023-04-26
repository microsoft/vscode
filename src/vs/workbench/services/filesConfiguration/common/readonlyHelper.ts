/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
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
	private makeRGM(key: string, contextService: IWorkspaceContextService, configurationService: IConfigurationService) {
		const rgm = new ResourceGlobMatcher(
			(uri) => configurationService.getValue<{ [glob: string]: boolean }>(key),
			(event) => event.affectsConfiguration(Keys.include),
			contextService, configurationService);
		this.disposables.add(rgm);
		return rgm;
	}
	includeMatcher: ResourceGlobMatcher;
	excludeMatcher: ResourceGlobMatcher;
	resourcePathMatcher: ResourceGlobMatcher; // For interactive/keychord/command/extension

	constructor(
		readonly resource: URI,
		readonly onDidChangeReadonly: Emitter<void>,
		readonly fileService: IFileService,
		contextService: IWorkspaceContextService,
		readonly configurationService: IConfigurationService,
	) {
		super();
		this.includeMatcher = this.makeRGM(Keys.include, contextService, configurationService);
		this.excludeMatcher = this.makeRGM(Keys.exclude, contextService, configurationService);
		this.resourcePathMatcher = this.makeRGM(Keys.path, contextService, configurationService);
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onDidChangeConfiguration(e)));
		this.setGlobReadonly(this.resource);    // and then track with onDidChangeConfiguration()
	}

	private lastResolvedFileStat: IFileStatWithMetadata | undefined;

	setLastResolvedFileStat(fileStat: IFileStatWithMetadata) {
		this.lastResolvedFileStat = fileStat;
	}

	private legacyReadonlyStat: boolean = this.configurationService.getValue(Keys.ignoreReadonlyStat);

	private setGlobReadonly(resource: URI) {
		this.globReadonly = this.includeMatcher.matches(resource)
			&& !this.excludeMatcher.matches(resource);
	}

	private onDidChangeConfiguration(event: IConfigurationChangeEvent) {
		if (event.affectsConfiguration(Keys.ignoreReadonlyStat)) {
			this.legacyReadonlyStat = this.configurationService.getValue(Keys.ignoreReadonlyStat);
			this.isReadonly(); // fire event if/when onDidChangeReadonly
		}
		if (event.affectsConfiguration(Keys.include) || event.affectsConfiguration(Keys.exclude)) {
			this.setGlobReadonly(this.resource);
			this.isReadonly(); // fire event if/when onDidChangeReadonly
		}
	}

	// stable/semantic 'readonly' [nonEditable]; typically based on filetype or directory.
	private globReadonly: boolean = false;

	// latest value derived from files.readonlyInclude/Exclude for this resource.path
	private oldReadonly = false; // fileEditorInput.test.ts counts changes from 'false' not 'undefined'

	private checkDidChangeReadonly(newReadonly: boolean): boolean {
		if (this.oldReadonly !== newReadonly) {
			this.oldReadonly = newReadonly;    // must set before fire(); reentrant.
			this.onDidChangeReadonly.fire();
		}
		return newReadonly;
	}

	/** return true if associated resource is treated as nonEditable. */
	public isReadonly(): boolean {
		return this.checkDidChangeReadonly(
			this.globReadonly ||
			(this.legacyReadonlyStat ? false : this.lastResolvedFileStat?.readonly) ||
			this.fileService.hasCapability(this.resource, FileSystemProviderCapabilities.Readonly)
		);
	}
}
