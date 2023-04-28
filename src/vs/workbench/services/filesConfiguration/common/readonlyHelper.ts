/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
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

export class ReadonlyHelper extends Disposable implements IReadonlyHelper {
	static globManager: GlobManager;

	constructor(
		@IFileService fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService readonly configurationService: IConfigurationService,
	) {
		super();
		if (!ReadonlyHelper.globManager) {
			ReadonlyHelper.globManager = new GlobManager(contextService, configurationService);
		}
		fileService.setReadonlyQueryFn((statReadonly, resource) => {
			const globReadonly = this.isGlobReadonly(resource);
			return globReadonly === null ? statReadonly : globReadonly;
		});

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
		return isSpecified ? (isInclude && !isExclude) : null;
	}
}
export interface IReadonlyHelper {
	isGlobReadonly(resource: URI): boolean | null;
}
export const IReadonlyHelper = createDecorator<IReadonlyHelper>('readonlyHelper');

registerSingleton(IReadonlyHelper, ReadonlyHelper, InstantiationType.Delayed);
