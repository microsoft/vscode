/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ResourceGlobMatcher } from 'vs/workbench/common/resources';
import { IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { Emitter } from 'vs/base/common/event';

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
		@IFileService readonly fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IWorkingCopyService readonly workingCopyService: IWorkingCopyService,
	) {
		super();
		if (!ReadonlyHelper.globManager) {
			ReadonlyHelper.globManager = new GlobManager(contextService, configurationService);
		}
		fileService.setReadonlyQueryFn((statReadonly, resource) => {
			const globReadonly = this.isGlobReadonly(resource);
			return globReadonly !== null ? globReadonly : this.ignoreReadonlyStat ? false : statReadonly;
		});
		ReadonlyHelper.globManager.exactPathMatcher.onExpressionChange(() => this.pathGlobsChanged());

		this._register(configurationService.onDidChangeConfiguration(e => this.onDidChangeConfiguration(e)));
	}

	pathReadonlyValues = new Map<string, boolean>();

	/**
	 * Exact path can specify: true, false, toggle [flip] or null [ignore].
	 * Used by interactive command/keybinding to set, clear or toggle isReadonly.
	 */
	protected pathGlobsChanged() {
		const readonlyPath = this.configurationService.getValue<{ [glob: string]: (boolean | null | 'toggle') }>(GlobManager.path);
		if (readonlyPath !== undefined) {
			// generally there is only one pathuri key in the readonlyPath setting.
			Object.keys(readonlyPath).forEach((pathuri: string) => {
				let newReadonly = readonlyPath[pathuri]; // true, false, 'toggle', null
				const pathReadonly = this.pathReadonlyValues.get(pathuri), uri = URI.parse(pathuri);
				const oldReadonly = (pathReadonly !== undefined) ? pathReadonly : this.isGlobReadonly(uri) || false;
				if (newReadonly === 'toggle') {
					newReadonly = readonlyPath[pathuri] = !oldReadonly;
					// modify settings, so subsequent 'toggle' will be seen as a change:
					this.configurationService.updateValue(GlobManager.path, readonlyPath, ConfigurationTarget.USER);
					this.pathReadonlyValues.set(pathuri, newReadonly);
				}
				if (newReadonly === null) {
					this.pathReadonlyValues.delete(pathuri);
					newReadonly = this.isGlobReadonly(uri) || false; // dubious... could record & check lastResolvedFileStat?
				} else {
					this.pathReadonlyValues.set(pathuri, newReadonly);
				}
				//this.notifyEachWorkingCopy(newReadonly, pathuri, uri);
			});
		}
	}
	notifyEachWorkingCopy(newReadonly: boolean, pathuri: string, resource: URI) {
		const wcary = this.workingCopyService.getAll(pathuri); // find the WorkingCopy[]
		wcary?.forEach(wc => this.notifyWorkingCopy(wc, resource, newReadonly));
	}
	async notifyWorkingCopy(wc: IWorkingCopy, resource: URI, newReadonly: boolean) {
		const stat = await this.fileService.stat(resource); // ensure FileService & IFileStat have updated value
		if (stat.readonly !== newReadonly) {
			console.warn(`notifyWorkingCopy: stat.readonly=${stat.readonly} newReadonly=${newReadonly}`);
		}
		const emitter = (wc as any /* as TextFileEditorModel */)._onDidChangeReadonly as Emitter<void>;
		if (typeof emitter?.fire === 'function') {
			emitter.fire();
		}
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
		const isPath = this.pathReadonlyValues.get(resource.toString());
		if (isPath !== undefined) {
			return isPath;
		}
		return (isInclude || isExclude) ? (isInclude && !isExclude) : null;
	}
}

export interface IReadonlyHelper {
	isGlobReadonly(resource: URI): boolean | null;
}

export const IReadonlyHelper = createDecorator<IReadonlyHelper>('readonlyHelper');

registerSingleton(IReadonlyHelper, ReadonlyHelper, InstantiationType.Delayed);
