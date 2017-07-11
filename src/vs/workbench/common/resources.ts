/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import objects = require('vs/base/common/objects');
import paths = require('vs/base/common/paths');
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ParsedExpression, IExpression } from 'vs/base/common/glob';
import { basename } from 'vs/base/common/paths';
import { RawContextKey, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IModeService } from 'vs/editor/common/services/modeService';

export class ResourceContextKey implements IContextKey<URI> {

	static Scheme = new RawContextKey<string>('resourceScheme', undefined);
	static Filename = new RawContextKey<string>('resourceFilename', undefined);
	static LangId = new RawContextKey<string>('resourceLangId', undefined);
	static Resource = new RawContextKey<URI>('resource', undefined);

	private _resourceKey: IContextKey<URI>;
	private _schemeKey: IContextKey<string>;
	private _filenameKey: IContextKey<string>;
	private _langIdKey: IContextKey<string>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IModeService private _modeService: IModeService
	) {
		this._schemeKey = ResourceContextKey.Scheme.bindTo(contextKeyService);
		this._filenameKey = ResourceContextKey.Filename.bindTo(contextKeyService);
		this._langIdKey = ResourceContextKey.LangId.bindTo(contextKeyService);
		this._resourceKey = ResourceContextKey.Resource.bindTo(contextKeyService);
	}

	set(value: URI) {
		this._resourceKey.set(value);
		this._schemeKey.set(value && value.scheme);
		this._filenameKey.set(value && basename(value.fsPath));
		this._langIdKey.set(value && this._modeService.getModeIdByFilenameOrFirstLine(value.fsPath));
	}

	reset(): void {
		this._schemeKey.reset();
		this._langIdKey.reset();
		this._resourceKey.reset();
	}

	public get(): URI {
		return this._resourceKey.get();
	}
}

export class ResourceGlobMatcher {

	private static readonly NO_ROOT = null;

	private _onExpressionChange: Emitter<void>;
	private toUnbind: IDisposable[];
	private mapRootToParsedExpression: Map<string, ParsedExpression>;
	private mapRootToExpressionConfig: Map<string, IExpression>;

	constructor(
		private globFn: (root?: URI) => IExpression,
		private parseFn: (expression: IExpression) => ParsedExpression,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.toUnbind = [];

		this.mapRootToParsedExpression = new Map<string, ParsedExpression>();
		this.mapRootToExpressionConfig = new Map<string, IExpression>();

		this._onExpressionChange = new Emitter<void>();
		this.toUnbind.push(this._onExpressionChange);

		this.updateExcludes(false);

		this.registerListeners();
	}

	public get onExpressionChange(): Event<void> {
		return this._onExpressionChange.event;
	}

	private registerListeners(): void {
		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(() => this.onConfigurationChanged()));
		this.toUnbind.push(this.contextService.onDidChangeWorkspaceRoots(() => this.onDidChangeWorkspaceRoots()));
	}

	private onConfigurationChanged(): void {
		this.updateExcludes(true);
	}

	private onDidChangeWorkspaceRoots(): void {
		this.updateExcludes(true);
	}

	private updateExcludes(fromEvent: boolean): void {
		let changed = false;

		// Add excludes per workspaces that got added
		if (this.contextService.hasWorkspace()) {
			this.contextService.getWorkspace().roots.forEach(root => {
				const rootExcludes = this.globFn(root);
				if (!this.mapRootToExpressionConfig.has(root.toString()) || !objects.equals(this.mapRootToExpressionConfig.get(root.toString()), rootExcludes)) {
					changed = true;

					this.mapRootToParsedExpression.set(root.toString(), this.parseFn(rootExcludes));
					this.mapRootToExpressionConfig.set(root.toString(), objects.clone(rootExcludes));
				}
			});
		}

		// Remove excludes per workspace no longer present
		this.mapRootToExpressionConfig.forEach((value, root) => {
			if (root === ResourceGlobMatcher.NO_ROOT) {
				return; // always keep this one
			}

			if (!this.contextService.getRoot(URI.parse(root))) {
				this.mapRootToParsedExpression.delete(root);
				this.mapRootToExpressionConfig.delete(root);

				changed = true;
			}
		});

		// Always set for resources outside root as well
		const globalExcludes = this.globFn();
		if (!this.mapRootToExpressionConfig.has(ResourceGlobMatcher.NO_ROOT) || !objects.equals(this.mapRootToExpressionConfig.get(ResourceGlobMatcher.NO_ROOT), globalExcludes)) {
			changed = true;

			this.mapRootToParsedExpression.set(ResourceGlobMatcher.NO_ROOT, this.parseFn(globalExcludes));
			this.mapRootToExpressionConfig.set(ResourceGlobMatcher.NO_ROOT, objects.clone(globalExcludes));
		}

		if (fromEvent && changed) {
			this._onExpressionChange.fire();
		}
	}

	public matches(resource: URI): boolean {
		const root = this.contextService.getRoot(resource);

		let expressionForRoot: ParsedExpression;
		if (root && this.mapRootToParsedExpression.has(root.toString())) {
			expressionForRoot = this.mapRootToParsedExpression.get(root.toString());
		} else {
			expressionForRoot = this.mapRootToParsedExpression.get(ResourceGlobMatcher.NO_ROOT);
		}

		// If the resource if from a workspace, convert its absolute path to a relative
		// path so that glob patterns have a higher probability to match. For example
		// a glob pattern of "src/**" will not match on an absolute path "/folder/src/file.txt"
		// but can match on "src/file.txt"
		let resourcePathToMatch: string;
		if (root) {
			resourcePathToMatch = paths.normalize(paths.relative(root.fsPath, resource.fsPath));
		} else {
			resourcePathToMatch = resource.fsPath;
		}

		return !!expressionForRoot(resourcePathToMatch);
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
	}
}