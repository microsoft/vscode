/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { deepClone, equals } from 'vs/base/common/objects';
import { Emitter } from 'vs/base/common/event';
import { basename, dirname, extname, relativePath } from 'vs/base/common/resources';
import { RawContextKey, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IFileService } from 'vs/platform/files/common/files';
import { Disposable } from 'vs/base/common/lifecycle';
import { ParsedExpression, IExpression, parse } from 'vs/base/common/glob';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { withNullAsUndefined } from 'vs/base/common/types';

export class ResourceContextKey extends Disposable implements IContextKey<URI> {

	// NOTE: DO NOT CHANGE THE DEFAULT VALUE TO ANYTHING BUT
	// UNDEFINED! IT IS IMPORTANT THAT DEFAULTS ARE INHERITED
	// FROM THE PARENT CONTEXT AND ONLY UNDEFINED DOES THIS

	static readonly Scheme = new RawContextKey<string>('resourceScheme', undefined, { type: 'string', description: localize('resourceScheme', "The scheme of the rsource") });
	static readonly Filename = new RawContextKey<string>('resourceFilename', undefined, { type: 'string', description: localize('resourceFilename', "The file name of the resource") });
	static readonly Dirname = new RawContextKey<string>('resourceDirname', undefined, { type: 'string', description: localize('resourceDirname', "The folder name the resource is contained in") });
	static readonly Path = new RawContextKey<string>('resourcePath', undefined, { type: 'string', description: localize('resourcePath', "The full path of the resource") });
	static readonly LangId = new RawContextKey<string>('resourceLangId', undefined, { type: 'string', description: localize('resourceLangId', "The language identifier of the resource") });
	static readonly Resource = new RawContextKey<URI>('resource', undefined, { type: 'URI', description: localize('resource', "The full value of the resource including scheme and path") });
	static readonly Extension = new RawContextKey<string>('resourceExtname', undefined, { type: 'string', description: localize('resourceExtname', "The extension name of the resource") });
	static readonly HasResource = new RawContextKey<boolean>('resourceSet', undefined, { type: 'boolean', description: localize('resourceSet', "Whether a resource is present or not") });
	static readonly IsFileSystemResource = new RawContextKey<boolean>('isFileSystemResource', undefined, { type: 'boolean', description: localize('isFileSystemResource', "Whether the resource is backed by a file system provider") });

	private readonly _resourceKey: IContextKey<URI | null>;
	private readonly _schemeKey: IContextKey<string | null>;
	private readonly _filenameKey: IContextKey<string | null>;
	private readonly _dirnameKey: IContextKey<string | null>;
	private readonly _pathKey: IContextKey<string | null>;
	private readonly _langIdKey: IContextKey<string | null>;
	private readonly _extensionKey: IContextKey<string | null>;
	private readonly _hasResource: IContextKey<boolean>;
	private readonly _isFileSystemResource: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IFileService private readonly _fileService: IFileService,
		@IModeService private readonly _modeService: IModeService
	) {
		super();

		this._schemeKey = ResourceContextKey.Scheme.bindTo(this._contextKeyService);
		this._filenameKey = ResourceContextKey.Filename.bindTo(this._contextKeyService);
		this._dirnameKey = ResourceContextKey.Dirname.bindTo(this._contextKeyService);
		this._pathKey = ResourceContextKey.Path.bindTo(this._contextKeyService);
		this._langIdKey = ResourceContextKey.LangId.bindTo(this._contextKeyService);
		this._resourceKey = ResourceContextKey.Resource.bindTo(this._contextKeyService);
		this._extensionKey = ResourceContextKey.Extension.bindTo(this._contextKeyService);
		this._hasResource = ResourceContextKey.HasResource.bindTo(this._contextKeyService);
		this._isFileSystemResource = ResourceContextKey.IsFileSystemResource.bindTo(this._contextKeyService);

		this._register(_fileService.onDidChangeFileSystemProviderRegistrations(() => {
			const resource = this._resourceKey.get();
			this._isFileSystemResource.set(Boolean(resource && _fileService.canHandleResource(resource)));
		}));

		this._register(_modeService.onDidCreateMode(() => {
			const value = this._resourceKey.get();
			this._langIdKey.set(value ? this._modeService.getModeIdByFilepathOrFirstLine(value) : null);
		}));
	}

	set(value: URI | null) {
		if (!ResourceContextKey._uriEquals(this._resourceKey.get(), value)) {
			this._contextKeyService.bufferChangeEvents(() => {
				this._resourceKey.set(value);
				this._schemeKey.set(value ? value.scheme : null);
				this._filenameKey.set(value ? basename(value) : null);
				this._dirnameKey.set(value ? dirname(value).fsPath : null);
				this._pathKey.set(value ? value.fsPath : null);
				this._langIdKey.set(value ? this._modeService.getModeIdByFilepathOrFirstLine(value) : null);
				this._extensionKey.set(value ? extname(value) : null);
				this._hasResource.set(!!value);
				this._isFileSystemResource.set(value ? this._fileService.canHandleResource(value) : false);
			});
		}
	}

	reset(): void {
		this._contextKeyService.bufferChangeEvents(() => {
			this._resourceKey.reset();
			this._schemeKey.reset();
			this._filenameKey.reset();
			this._dirnameKey.reset();
			this._pathKey.reset();
			this._langIdKey.reset();
			this._extensionKey.reset();
			this._hasResource.reset();
			this._isFileSystemResource.reset();
		});
	}

	get(): URI | undefined {
		return withNullAsUndefined(this._resourceKey.get());
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

export class ResourceGlobMatcher extends Disposable {

	private static readonly NO_ROOT: string | null = null;

	private readonly _onExpressionChange = this._register(new Emitter<void>());
	readonly onExpressionChange = this._onExpressionChange.event;

	private readonly mapRootToParsedExpression = new Map<string | null, ParsedExpression>();
	private readonly mapRootToExpressionConfig = new Map<string | null, IExpression>();

	constructor(
		private globFn: (root?: URI) => IExpression,
		private shouldUpdate: (event: IConfigurationChangeEvent) => boolean,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.updateExcludes(false);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (this.shouldUpdate(e)) {
				this.updateExcludes(true);
			}
		}));

		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.updateExcludes(true)));
	}

	private updateExcludes(fromEvent: boolean): void {
		let changed = false;

		// Add excludes per workspaces that got added
		this.contextService.getWorkspace().folders.forEach(folder => {
			const rootExcludes = this.globFn(folder.uri);
			if (!this.mapRootToExpressionConfig.has(folder.uri.toString()) || !equals(this.mapRootToExpressionConfig.get(folder.uri.toString()), rootExcludes)) {
				changed = true;

				this.mapRootToParsedExpression.set(folder.uri.toString(), parse(rootExcludes));
				this.mapRootToExpressionConfig.set(folder.uri.toString(), deepClone(rootExcludes));
			}
		});

		// Remove excludes per workspace no longer present
		this.mapRootToExpressionConfig.forEach((value, root) => {
			if (root === ResourceGlobMatcher.NO_ROOT) {
				return; // always keep this one
			}

			if (root && !this.contextService.getWorkspaceFolder(URI.parse(root))) {
				this.mapRootToParsedExpression.delete(root);
				this.mapRootToExpressionConfig.delete(root);

				changed = true;
			}
		});

		// Always set for resources outside root as well
		const globalExcludes = this.globFn();
		if (!this.mapRootToExpressionConfig.has(ResourceGlobMatcher.NO_ROOT) || !equals(this.mapRootToExpressionConfig.get(ResourceGlobMatcher.NO_ROOT), globalExcludes)) {
			changed = true;

			this.mapRootToParsedExpression.set(ResourceGlobMatcher.NO_ROOT, parse(globalExcludes));
			this.mapRootToExpressionConfig.set(ResourceGlobMatcher.NO_ROOT, deepClone(globalExcludes));
		}

		if (fromEvent && changed) {
			this._onExpressionChange.fire();
		}
	}

	matches(resource: URI): boolean {
		const folder = this.contextService.getWorkspaceFolder(resource);

		let expressionForRoot: ParsedExpression | undefined;
		if (folder && this.mapRootToParsedExpression.has(folder.uri.toString())) {
			expressionForRoot = this.mapRootToParsedExpression.get(folder.uri.toString());
		} else {
			expressionForRoot = this.mapRootToParsedExpression.get(ResourceGlobMatcher.NO_ROOT);
		}

		// If the resource if from a workspace, convert its absolute path to a relative
		// path so that glob patterns have a higher probability to match. For example
		// a glob pattern of "src/**" will not match on an absolute path "/folder/src/file.txt"
		// but can match on "src/file.txt"
		let resourcePathToMatch: string | undefined;
		if (folder) {
			resourcePathToMatch = relativePath(folder.uri, resource); // always uses forward slashes
		} else {
			resourcePathToMatch = resource.fsPath; // TODO@isidor: support non-file URIs
		}

		return !!expressionForRoot && typeof resourcePathToMatch === 'string' && !!expressionForRoot(resourcePathToMatch);
	}
}
