/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, window, QuickPickItem, Disposable } from 'vscode';
import { GitErrorCodes } from './git';
import { Repository, IRepository, State } from './repository';
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

export class Model implements IRepository {

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
		const picks = Array.from(this.repositories.entries(), ([uri, model]) => new RepositoryPick(uri, model));
		const placeHolder = localize('pick repo', "Choose a repository");
		const pick = await window.showQuickPick(picks, { placeHolder });

		return pick && pick.repository;
	}

	getRepository(resource: Uri): Repository | undefined {
		const resourcePath = resource.fsPath;

		for (let [repositoryRoot, model] of this.repositories) {
			const repositoryRootPath = repositoryRoot.fsPath;
			const relativePath = path.relative(repositoryRootPath, resourcePath);

			if (!/^\./.test(relativePath)) {
				return model;
			}
		}

		return undefined;
	}

	private async runByRepository<T>(resources: Uri[], fn: (repository: Repository, resources: Uri[]) => Promise<T>): Promise<T[]> {
		const groups = resources.reduce((result, resource) => {
			const repository = this.getRepository(resource);

			// TODO@Joao: what should happen?
			if (!repository) {
				console.warn('Could not find git repository for ', resource);
				return result;
			}

			const tuple = result.filter(p => p[0] === repository)[0];

			if (tuple) {
				tuple.resources.push(resource);
			} else {
				result.push({ repository, resources: [resource] });
			}

			return result;
		}, [] as { repository: Repository, resources: Uri[] }[]);

		const promises = groups
			.map(({ repository, resources }) => this.run(repository, () => fn(repository as Repository, resources)));

		return Promise.all(promises);
	}

	private async run<T>(repository: Repository, fn: () => Promise<T>): Promise<T> {
		try {
			return fn();
		} catch (err) {
			if (err.gitErrorCode === GitErrorCodes.NotAGitRepository) {
				// do something about it
			}

			throw err;
		}
	}

	// IRepository

	async add(...resources: Uri[]): Promise<void> {
		await this.runByRepository(resources, async (repository, resources) => repository.add(...resources));
	}
}