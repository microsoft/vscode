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

	private static readonly NO_FOLDER = null;

	private readonly _onExpressionChange = this._register(new Emitter<void>());
	readonly onExpressionChange = this._onExpressionChange.event;

	private readonly mapFolderToParsedExpression = new Map<string | null, ParsedExpression>();
	private readonly mapFolderToConfiguredExpression = new Map<string | null, IConfiguredExpression>();

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
			const currentExpression = this.mapFolderToConfiguredExpression.get(folderUriStr);

			if (newExpression) {
				if (!currentExpression || !equals(currentExpression.expression, newExpression)) {
					changed = true;

					this.mapFolderToParsedExpression.set(folderUriStr, parse(newExpression));
					this.mapFolderToConfiguredExpression.set(folderUriStr, this.toConfiguredExpression(newExpression));
				}
			} else {
				if (currentExpression) {
					changed = true;

					this.mapFolderToParsedExpression.delete(folderUriStr);
					this.mapFolderToConfiguredExpression.delete(folderUriStr);
				}
			}
		}

		// Remove expressions per workspace no longer present
		const foldersMap = new ResourceSet(this.contextService.getWorkspace().folders.map(folder => folder.uri));
		for (const [folder] of this.mapFolderToConfiguredExpression) {
			if (folder === ResourceGlobMatcher.NO_FOLDER) {
				continue; // always keep this one
			}

			if (!foldersMap.has(URI.parse(folder))) {
				this.mapFolderToParsedExpression.delete(folder);
				this.mapFolderToConfiguredExpression.delete(folder);

				changed = true;
			}
		}

		// Always set for resources outside workspace as well
		const globalNewExpression = this.doGetExpression(undefined);
		const globalCurrentExpression = this.mapFolderToConfiguredExpression.get(ResourceGlobMatcher.NO_FOLDER);
		if (globalNewExpression) {
			if (!globalCurrentExpression || !equals(globalCurrentExpression.expression, globalNewExpression)) {
				changed = true;

				this.mapFolderToParsedExpression.set(ResourceGlobMatcher.NO_FOLDER, parse(globalNewExpression));
				this.mapFolderToConfiguredExpression.set(ResourceGlobMatcher.NO_FOLDER, this.toConfiguredExpression(globalNewExpression));
			}
		} else {
			if (globalCurrentExpression) {
				changed = true;

				this.mapFolderToParsedExpression.delete(ResourceGlobMatcher.NO_FOLDER);
				this.mapFolderToConfiguredExpression.delete(ResourceGlobMatcher.NO_FOLDER);
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
		if (this.mapFolderToParsedExpression.size === 0) {
			return false; // return early: no expression for this matcher
		}

		const folder = this.contextService.getWorkspaceFolder(resource);
		let expressionForFolder: ParsedExpression | undefined;
		let expressionConfigForFolder: IConfiguredExpression | undefined;
		if (folder && this.mapFolderToParsedExpression.has(folder.uri.toString())) {
			expressionForFolder = this.mapFolderToParsedExpression.get(folder.uri.toString());
			expressionConfigForFolder = this.mapFolderToConfiguredExpression.get(folder.uri.toString());
		} else {
			expressionForFolder = this.mapFolderToParsedExpression.get(ResourceGlobMatcher.NO_FOLDER);
			expressionConfigForFolder = this.mapFolderToConfiguredExpression.get(ResourceGlobMatcher.NO_FOLDER);
		}

		if (!expressionForFolder) {
			return false; // return early: no expression for this resource
		}

		// If the resource if from a workspace, convert its absolute path to a relative
		// path so that glob patterns have a higher probability to match. For example
		// a glob pattern of "src/**" will not match on an absolute path "/folder/src/file.txt"
		// but can match on "src/file.txt"

		let resourcePathToMatch: string | undefined;
		if (folder) {
			resourcePathToMatch = relativePath(folder.uri, resource);
		} else {
			resourcePathToMatch = this.uriToPath(resource);
		}

		if (typeof resourcePathToMatch === 'string' && !!expressionForFolder(resourcePathToMatch, undefined, hasSibling)) {
			return true;
		}

		// If the configured expression has an absolute path, we also check for absolute paths
		// to match, otherwise we potentially miss out on matches. We only do that if we previously
		// matched on the relative path.

		if (resourcePathToMatch !== this.uriToPath(resource) && expressionConfigForFolder?.hasAbsolutePath) {
			return !!expressionForFolder(this.uriToPath(resource), undefined, hasSibling);
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
