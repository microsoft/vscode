/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { deepClone, equals } from 'vs/base/common/objects';
import { Emitter } from 'vs/base/common/event';
import { relativePath } from 'vs/base/common/resources';
import { Disposable } from 'vs/base/common/lifecycle';
import { ParsedExpression, IExpression, parse } from 'vs/base/common/glob';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';

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
