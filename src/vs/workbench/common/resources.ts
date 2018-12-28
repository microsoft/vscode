/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import { RawContextKey, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IFileService } from 'vs/platform/files/common/files';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';

export class ResourceContextKey extends Disposable implements IContextKey<URI> {

	static Scheme = new RawContextKey<string>('resourceScheme', undefined);
	static Filename = new RawContextKey<string>('resourceFilename', undefined);
	static LangId = new RawContextKey<string>('resourceLangId', undefined);
	static Resource = new RawContextKey<URI>('resource', undefined);
	static Extension = new RawContextKey<string>('resourceExtname', undefined);
	static HasResource = new RawContextKey<boolean>('resourceSet', false);
	static IsFileSystemResource = new RawContextKey<boolean>('isFileSystemResource', false);
	static IsFileSystemResourceOrUntitled = new RawContextKey<boolean>('isFileSystemResourceOrUntitled', false);

	private readonly _resourceKey: IContextKey<URI>;
	private readonly _schemeKey: IContextKey<string>;
	private readonly _filenameKey: IContextKey<string>;
	private readonly _langIdKey: IContextKey<string | null>;
	private readonly _extensionKey: IContextKey<string>;
	private readonly _hasResource: IContextKey<boolean>;
	private readonly _isFileSystemResource: IContextKey<boolean>;
	private readonly _isFileSystemResourceOrUntitled: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IFileService private readonly _fileService: IFileService,
		@IModeService private readonly _modeService: IModeService
	) {
		super();

		this._schemeKey = ResourceContextKey.Scheme.bindTo(contextKeyService);
		this._filenameKey = ResourceContextKey.Filename.bindTo(contextKeyService);
		this._langIdKey = ResourceContextKey.LangId.bindTo(contextKeyService);
		this._resourceKey = ResourceContextKey.Resource.bindTo(contextKeyService);
		this._extensionKey = ResourceContextKey.Extension.bindTo(contextKeyService);
		this._hasResource = ResourceContextKey.HasResource.bindTo(contextKeyService);
		this._isFileSystemResource = ResourceContextKey.IsFileSystemResource.bindTo(contextKeyService);
		this._isFileSystemResourceOrUntitled = ResourceContextKey.IsFileSystemResourceOrUntitled.bindTo(contextKeyService);

		this._register(_fileService.onDidChangeFileSystemProviderRegistrations(() => {
			const resource = this._resourceKey.get();
			this._isFileSystemResource.set(Boolean(resource && _fileService.canHandleResource(resource)));
			this._isFileSystemResourceOrUntitled.set(this._isFileSystemResource.get() || this._schemeKey.get() === Schemas.untitled);
		}));

		this._register(_modeService.onDidCreateMode(() => {
			const value = this._resourceKey.get();
			this._langIdKey.set(value ? this._modeService.getModeIdByFilepathOrFirstLine(value.fsPath) : null);
		}));
	}

	set(value: URI) {
		if (!ResourceContextKey._uriEquals(this._resourceKey.get(), value)) {
			this._resourceKey.set(value);
			this._schemeKey.set(value && value.scheme);
			this._filenameKey.set(value && paths.basename(value.fsPath));
			this._langIdKey.set(value ? this._modeService.getModeIdByFilepathOrFirstLine(value.fsPath) : null);
			this._extensionKey.set(value && paths.extname(value.fsPath));
			this._hasResource.set(!!value);
			this._isFileSystemResource.set(value && this._fileService.canHandleResource(value));
			this._isFileSystemResourceOrUntitled.set(this._isFileSystemResource.get() || this._schemeKey.get() === Schemas.untitled);
		}
	}

	reset(): void {
		this._schemeKey.reset();
		this._langIdKey.reset();
		this._resourceKey.reset();
		this._langIdKey.reset();
		this._extensionKey.reset();
		this._hasResource.reset();
		this._isFileSystemResource.reset();
		this._isFileSystemResourceOrUntitled.reset();
	}

	get(): URI | undefined {
		return this._resourceKey.get();
	}

	private static _uriEquals(a: URI | undefined | null, b: URI | undefined | null): boolean {
		if (a === b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return a.scheme === b.scheme // checks for not equals (fail fast)
			&& a.authority === b.authority
			&& a.path === b.path
			&& a.query === b.query
			&& a.fragment === b.fragment
			&& a.toString() === b.toString(); // for equal we use the normalized toString-form
	}
}
