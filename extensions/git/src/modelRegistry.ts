/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, window, QuickPickItem } from 'vscode';
import { Repository } from './repository';
import { memoize } from './decorators';
import * as path from 'path';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

class ModelPick implements QuickPickItem {
	@memoize get label(): string { return path.basename(this.repositoryRoot.fsPath); }
	@memoize get description(): string { return path.dirname(this.repositoryRoot.fsPath); }
	constructor(protected repositoryRoot: Uri, public readonly model: Repository) { }
}

export class ModelRegistry {

	private models: Map<Uri, Repository> = new Map<Uri, Repository>();

	register(uri: Uri, model): void {
		this.models.set(uri, model);
	}

	async pickModel(): Promise<Repository | undefined> {
		const picks = Array.from(this.models.entries(), ([uri, model]) => new ModelPick(uri, model));
		const placeHolder = localize('pick repo', "Choose a repository");
		const pick = await window.showQuickPick(picks, { placeHolder });

		return pick && pick.model;
	}

	getModel(resource: Uri): Repository | undefined {
		const resourcePath = resource.fsPath;

		for (let [repositoryRoot, model] of this.models) {
			const repositoryRootPath = repositoryRoot.fsPath;
			const relativePath = path.relative(repositoryRootPath, resourcePath);

			if (!/^\./.test(relativePath)) {
				return model;
			}
		}

		return undefined;
	}

	async resolve(resource: Uri): Promise<Repository | undefined> {
		const model = this.getModel(resource);

		if (model) {
			return model;
		}

		const picks = Array.from(this.models.entries(), ([uri, model]) => new ModelPick(uri, model));
		const placeHolder = localize('pick repo', "Choose a repository");
		const pick = await window.showQuickPick(picks, { placeHolder });

		if (pick) {
			return pick.model;
		}

		return undefined;
	}
}
