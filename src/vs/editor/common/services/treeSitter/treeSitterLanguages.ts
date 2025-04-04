/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as Parser from '@vscode/tree-sitter-wasm';
import { AppResourcePath, FileAccess, nodeModulesAsarUnpackedPath, nodeModulesPath } from '../../../../base/common/network.js';
import { ITreeSitterImporter } from '../treeSitterParserService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { canASAR } from '../../../../amdX.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { PromiseResult } from '../../../../base/common/observable.js';

export const MODULE_LOCATION_SUBPATH = `@vscode/tree-sitter-wasm/wasm`;

export function getModuleLocation(environmentService: IEnvironmentService): AppResourcePath {
	return `${(canASAR && environmentService.isBuilt) ? nodeModulesAsarUnpackedPath : nodeModulesPath}/${MODULE_LOCATION_SUBPATH}`;
}

export class TreeSitterLanguages extends Disposable {
	private _languages: AsyncCache<string, Parser.Language | undefined> = new AsyncCache();
	public /*exposed for tests*/ readonly _onDidAddLanguage: Emitter<{ id: string; language: Parser.Language }> = this._register(new Emitter());
	/**
	 * If you're looking for a specific language, make sure to check if it already exists with `getLanguage` as it will kick off the process to add it if it doesn't exist.
	 */
	public readonly onDidAddLanguage: Event<{ id: string; language: Parser.Language }> = this._onDidAddLanguage.event;

	constructor(private readonly _treeSitterImporter: ITreeSitterImporter,
		private readonly _fileService: IFileService,
		private readonly _environmentService: IEnvironmentService,
		private readonly _registeredLanguages: Map<string, string>,
	) {
		super();
	}

	public getOrInitLanguage(languageId: string): Parser.Language | undefined {
		if (this._languages.isCached(languageId)) {
			return this._languages.getSyncIfCached(languageId);
		} else {
			// kick off adding the language, but don't wait
			this._addLanguage(languageId);
			return undefined;
		}
	}

	public async getLanguage(languageId: string): Promise<Parser.Language | undefined> {
		if (this._languages.isCached(languageId)) {
			return this._languages.getSyncIfCached(languageId);
		} else {
			await this._addLanguage(languageId);
			return this._languages.get(languageId);
		}
	}

	private async _addLanguage(languageId: string): Promise<void> {
		const languagePromise = this._languages.get(languageId);
		if (!languagePromise) {
			this._languages.set(languageId, this._fetchLanguage(languageId));
			const language = await this._languages.get(languageId);
			if (!language) {
				return undefined;
			}
			this._onDidAddLanguage.fire({ id: languageId, language });
		}
	}

	private async _fetchLanguage(languageId: string): Promise<Parser.Language | undefined> {
		const grammarName = this._registeredLanguages.get(languageId);
		const languageLocation = this._getLanguageLocation(languageId);
		if (!grammarName || !languageLocation) {
			return undefined;
		}
		const wasmPath: AppResourcePath = `${languageLocation}/${grammarName}.wasm`;
		const languageFile = await (this._fileService.readFile(FileAccess.asFileUri(wasmPath)));
		const Language = await this._treeSitterImporter.getLanguageClass();
		return Language.load(languageFile.value.buffer);
	}

	private _getLanguageLocation(languageId: string): AppResourcePath | undefined {
		const grammarName = this._registeredLanguages.get(languageId);
		if (!grammarName) {
			return undefined;
		}
		return getModuleLocation(this._environmentService);
	}
}

class AsyncCache<TKey, T> {
	private readonly _values = new Map<TKey, PromiseWithSyncAccess<T>>();

	set(key: TKey, promise: Promise<T>) {
		this._values.set(key, new PromiseWithSyncAccess(promise));
	}

	get(key: TKey): Promise<T> | undefined {
		return this._values.get(key)?.promise;
	}

	getSyncIfCached(key: TKey): T | undefined {
		return this._values.get(key)?.result?.data;
	}

	isCached(key: TKey): boolean {
		return this._values.get(key)?.result !== undefined;
	}
}

class PromiseWithSyncAccess<T> {
	private _result: PromiseResult<T> | undefined;
	/**
	 * Returns undefined if the promise did not resolve yet.
	 */
	get result(): PromiseResult<T> | undefined {
		return this._result;
	}

	constructor(public readonly promise: Promise<T>) {
		promise.then(result => {
			this._result = new PromiseResult(result, undefined);
		}).catch(e => {
			this._result = new PromiseResult<T>(undefined, e);
		});
	}
}
