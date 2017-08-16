/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, window, QuickPickItem, Disposable, SourceControl, SourceControlResourceGroup } from 'vscode';
import { Repository, State } from './repository';
import { memoize } from './decorators';
import { toDisposable, filterEvent, once } from './util';
import * as path from 'path';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

class RepositoryPick implements QuickPickItem {
	@memoize get label(): string { return path.basename(this.repositoryRoot.fsPath); }
	@memoize get description(): string { return path.dirname(this.repositoryRoot.fsPath); }
	constructor(protected repositoryRoot: Uri, public readonly repository: Repository) { }
}

export class Model {

	private repositories: Map<Uri, Repository> = new Map<Uri, Repository>();

	register(uri: Uri, repository: Repository): Disposable {
		if (this.repositories.has(uri)) {
			// TODO@Joao: what should happen?
			throw new Error('Cant register repository with the same URI');
		}

		this.repositories.set(uri, repository);

		const onDidDisappearRepository = filterEvent(repository.onDidChangeState, state => state === State.NotAGitRepository);
		const listener = onDidDisappearRepository(() => disposable.dispose());

		const disposable = toDisposable(once(() => {
			this.repositories.delete(uri);
			listener.dispose();
		}));

		return disposable;
	}

	async pickRepository(): Promise<Repository | undefined> {
		if (this.repositories.size === 0) {
			throw new Error(localize('no repositories', "There are no available repositories"));
		}

		// TODO@joao enable this code
		// if (this.repositories.size === 1) {
		// 	return this.repositories.values().next().value;
		// }

		const picks = Array.from(this.repositories.entries(), ([uri, model]) => new RepositoryPick(uri, model));
		const placeHolder = localize('pick repo', "Choose a repository");
		const pick = await window.showQuickPick(picks, { placeHolder });

		return pick && pick.repository;
	}

	getRepository(sourceControl: SourceControl): Repository | undefined;
	getRepository(resourceGroup: SourceControlResourceGroup): Repository | undefined;
	getRepository(resource: Uri): Repository | undefined;
	getRepository(hint: any): Repository | undefined {
		if (!hint) {
			return undefined;
		}

		if (hint instanceof Uri) {
			const resourcePath = hint.fsPath;

			for (let [root, repository] of this.repositories) {
				const repositoryRootPath = root.fsPath;
				const relativePath = path.relative(repositoryRootPath, resourcePath);

				if (!/^\./.test(relativePath)) {
					return repository;
				}
			}

			return undefined;
		}

		for (let [, repository] of this.repositories) {
			if (hint === repository.sourceControl) {
				return repository;
			}

			if (hint === repository.mergeGroup || hint === repository.indexGroup || hint === repository.workingTreeGroup) {
				return repository;
			}
		}

		return undefined;
	}
}