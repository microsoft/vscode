/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { deepClone, equals } from 'vs/base/common/objects';
import { isAbsolute } from 'vs/base/common/path';
import { Emitter } from 'vs/base/common/event';
import { relativePath } from 'vs/base/common/resources';
import { Disposable } from 'vs/base/common/lifecycle';
import { ParsedExpression, IExpression, parse } from 'vs/base/common/glob';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { Schemas } from 'vs/base/common/network';
import { ResourceSet } from 'vs/base/common/map';

interface IConfiguredExpression {
	readonly expression: IExpression;
	readonly hasAbsolutePath: boolean;
}

export class ResourceGlobMatcher extends Disposable {

	private static readonly NO_ROOT = null;

	private readonly _onExpressionChange = this._register(new Emitter<void>());
	readonly onExpressionChange = this._onExpressionChange.event;

	private readonly mapRootToParsedExpression = new Map<string | null, ParsedExpression>();
	private readonly mapRootToConfiguredExpression = new Map<string | null, IConfiguredExpression>();

	constructor(
		private getExpression: (folder?: URI) => IExpression | undefined,
		private shouldUpdate: (event: IConfigurationChangeEvent) => boolean,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.updateExpressions(false);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (this.shouldUpdate(e)) {
				this.updateExpressions(true);
			}
		}));

		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.updateExpressions(true)));
	}

	private updateExpressions(fromEvent: boolean): void {
		let changed = false;

		// Add expressions per workspaces that got added
		for (const folder of this.contextService.getWorkspace().folders) {
			const folderUriStr = folder.uri.toString();

			const newExpression = this.doGetExpression(folder.uri);
			const currentExpression = this.mapRootToConfiguredExpression.get(folderUriStr);

			if (newExpression) {
				if (!currentExpression || !equals(currentExpression.expression, newExpression)) {
					changed = true;

					this.mapRootToParsedExpression.set(folderUriStr, parse(newExpression));
					this.mapRootToConfiguredExpression.set(folderUriStr, this.toConfiguredExpression(newExpression));
				}
			} else {
				if (currentExpression) {
					changed = true;

					this.mapRootToParsedExpression.delete(folderUriStr);
					this.mapRootToConfiguredExpression.delete(folderUriStr);
				}
			}
		}

		// Remove expressions per workspace no longer present
		const foldersMap = new ResourceSet(this.contextService.getWorkspace().folders.map(folder => folder.uri));
		for (const [folder] of this.mapRootToConfiguredExpression) {
			if (folder === ResourceGlobMatcher.NO_ROOT) {
				continue; // always keep this one
			}

			if (!foldersMap.has(URI.parse(folder))) {
				this.mapRootToParsedExpression.delete(folder);
				this.mapRootToConfiguredExpression.delete(folder);

				changed = true;
			}
		}

		// Always set for resources outside root as well
		const globalNewExpression = this.doGetExpression(undefined);
		const globalCurrentExpression = this.mapRootToConfiguredExpression.get(ResourceGlobMatcher.NO_ROOT);
		if (globalNewExpression) {
			if (!globalCurrentExpression || !equals(globalCurrentExpression.expression, globalNewExpression)) {
				changed = true;

				this.mapRootToParsedExpression.set(ResourceGlobMatcher.NO_ROOT, parse(globalNewExpression));
				this.mapRootToConfiguredExpression.set(ResourceGlobMatcher.NO_ROOT, this.toConfiguredExpression(globalNewExpression));
			}
		} else {
			if (globalCurrentExpression) {
				changed = true;

				this.mapRootToParsedExpression.delete(ResourceGlobMatcher.NO_ROOT);
				this.mapRootToConfiguredExpression.delete(ResourceGlobMatcher.NO_ROOT);
			}
		}

		if (fromEvent && changed) {
			this._onExpressionChange.fire();
		}
	}

	private doGetExpression(resource: URI | undefined): IExpression | undefined {
		const expression = this.getExpression(resource);
		if (expression && Object.keys(expression).length > 0) {
			return expression;
		}

		return undefined;
	}

	private toConfiguredExpression(expression: IExpression): IConfiguredExpression {
		return {
			expression: deepClone(expression),
			hasAbsolutePath: Object.keys(expression).some(key => expression[key] === true && isAbsolute(key))
		};
	}

	matches(
		resource: URI,
		hasSibling?: (name: string) => boolean
	): boolean {
		if (this.mapRootToParsedExpression.size === 0) {
			return false; // return early: no expression for this matcher
		}

		const folder = this.contextService.getWorkspaceFolder(resource);

		let expressionForRoot: ParsedExpression | undefined;
		let expressionConfigForRoot: IConfiguredExpression | undefined;
		if (folder && this.mapRootToParsedExpression.has(folder.uri.toString())) {
			expressionForRoot = this.mapRootToParsedExpression.get(folder.uri.toString());
			expressionConfigForRoot = this.mapRootToConfiguredExpression.get(folder.uri.toString());
		} else {
			expressionForRoot = this.mapRootToParsedExpression.get(ResourceGlobMatcher.NO_ROOT);
			expressionConfigForRoot = this.mapRootToConfiguredExpression.get(ResourceGlobMatcher.NO_ROOT);
		}

		if (!expressionForRoot) {
			return false; // return early: no expression for this resource
		}

		// If the resource if from a workspace, convert its absolute path to a relative
		// path so that glob patterns have a higher probability to match. For example
		// a glob pattern of "src/**" will not match on an absolute path "/folder/src/file.txt"
		// but can match on "src/file.txt"

		let resourcePathToMatch: string | undefined;
		if (folder) {
			resourcePathToMatch = relativePath(folder.uri, resource); // always uses forward slashes
		} else {
			resourcePathToMatch = this.uriToPath(resource);
		}

		if (typeof resourcePathToMatch === 'string' && !!expressionForRoot(resourcePathToMatch, undefined, hasSibling)) {
			return true;
		}

		// If the configured expression has an absolute path, we also check for absolute paths
		// to match, otherwise we potentially miss out on matches.

		if (expressionConfigForRoot?.hasAbsolutePath) {
			return !!expressionForRoot(this.uriToPath(resource), undefined, hasSibling);
		}

		return false;
	}

	private uriToPath(uri: URI): string {
		if (uri.scheme === Schemas.file) {
			return uri.fsPath;
		}

		return uri.path;
	}
}
