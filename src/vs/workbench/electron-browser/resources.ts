/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import objects = require('vs/base/common/objects');
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { ParsedExpression, IExpression, parse } from 'vs/base/common/glob';
import { relative } from 'path';
import { normalize } from 'vs/base/common/paths';

export class ResourceGlobMatcher {

	private static readonly NO_ROOT: string = null;

	private readonly _onExpressionChange: Emitter<void>;
	private toUnbind: IDisposable[];
	private mapRootToParsedExpression: Map<string, ParsedExpression>;
	private mapRootToExpressionConfig: Map<string, IExpression>;

	constructor(
		private globFn: (root?: URI) => IExpression,
		private shouldUpdate: (event: IConfigurationChangeEvent) => boolean,
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
		this.toUnbind.push(this.configurationService.onDidChangeConfiguration(e => {
			if (this.shouldUpdate(e)) {
				this.updateExcludes(true);
			}
		}));
		this.toUnbind.push(this.contextService.onDidChangeWorkspaceFolders(() => this.updateExcludes(true)));
	}

	private updateExcludes(fromEvent: boolean): void {
		let changed = false;

		// Add excludes per workspaces that got added
		this.contextService.getWorkspace().folders.forEach(folder => {
			const rootExcludes = this.globFn(folder.uri);
			if (!this.mapRootToExpressionConfig.has(folder.uri.toString()) || !objects.equals(this.mapRootToExpressionConfig.get(folder.uri.toString()), rootExcludes)) {
				changed = true;

				this.mapRootToParsedExpression.set(folder.uri.toString(), parse(rootExcludes));
				this.mapRootToExpressionConfig.set(folder.uri.toString(), objects.deepClone(rootExcludes));
			}
		});

		// Remove excludes per workspace no longer present
		this.mapRootToExpressionConfig.forEach((value, root) => {
			if (root === ResourceGlobMatcher.NO_ROOT) {
				return; // always keep this one
			}

			if (!this.contextService.getWorkspaceFolder(URI.parse(root))) {
				this.mapRootToParsedExpression.delete(root);
				this.mapRootToExpressionConfig.delete(root);

				changed = true;
			}
		});

		// Always set for resources outside root as well
		const globalExcludes = this.globFn();
		if (!this.mapRootToExpressionConfig.has(ResourceGlobMatcher.NO_ROOT) || !objects.equals(this.mapRootToExpressionConfig.get(ResourceGlobMatcher.NO_ROOT), globalExcludes)) {
			changed = true;

			this.mapRootToParsedExpression.set(ResourceGlobMatcher.NO_ROOT, parse(globalExcludes));
			this.mapRootToExpressionConfig.set(ResourceGlobMatcher.NO_ROOT, objects.deepClone(globalExcludes));
		}

		if (fromEvent && changed) {
			this._onExpressionChange.fire();
		}
	}

	public matches(resource: URI): boolean {
		const folder = this.contextService.getWorkspaceFolder(resource);

		let expressionForRoot: ParsedExpression;
		if (folder && this.mapRootToParsedExpression.has(folder.uri.toString())) {
			expressionForRoot = this.mapRootToParsedExpression.get(folder.uri.toString());
		} else {
			expressionForRoot = this.mapRootToParsedExpression.get(ResourceGlobMatcher.NO_ROOT);
		}

		// If the resource if from a workspace, convert its absolute path to a relative
		// path so that glob patterns have a higher probability to match. For example
		// a glob pattern of "src/**" will not match on an absolute path "/folder/src/file.txt"
		// but can match on "src/file.txt"
		let resourcePathToMatch: string;
		if (folder) {
			resourcePathToMatch = normalize(relative(folder.uri.fsPath, resource.fsPath));
		} else {
			resourcePathToMatch = resource.fsPath;
		}

		return !!expressionForRoot(resourcePathToMatch);
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
	}
}