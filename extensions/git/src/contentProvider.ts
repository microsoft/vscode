/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace, Uri, Disposable, Event, EventEmitter, window } from 'vscode';
import { debounce, throttle } from './decorators';
import { fromGitUri, toGitUri } from './uri';
import { Model, ModelChangeEvent, OriginalResourceChangeEvent } from './model';
import { filterEvent, eventToPromise, isDescendant, pathEquals } from './util';

interface CacheRow {
	uri: Uri;
	timestamp: number;
}

interface Cache {
	[uri: string]: CacheRow;
}

const THREE_MINUTES = 1000 * 60 * 3;
const FIVE_MINUTES = 1000 * 60 * 5;

export class GitContentProvider {

	private _onDidChange = new EventEmitter<Uri>();
	get onDidChange(): Event<Uri> { return this._onDidChange.event; }

	private changedRepositoryRoots = new Set<string>();
	private cache: Cache = Object.create(null);
	private disposables: Disposable[] = [];

	constructor(private model: Model) {
		this.disposables.push(
			model.onDidChangeRepository(this.onDidChangeRepository, this),
			model.onDidChangeOriginalResource(this.onDidChangeOriginalResource, this),
			workspace.registerTextDocumentContentProvider('git', this)
		);

		setInterval(() => this.cleanup(), FIVE_MINUTES);
	}

	private onDidChangeRepository({ repository }: ModelChangeEvent): void {
		this.changedRepositoryRoots.add(repository.root);
		this.eventuallyFireChangeEvents();
	}

	private onDidChangeOriginalResource({ uri }: OriginalResourceChangeEvent): void {
		if (uri.scheme !== 'file') {
			return;
		}

		this._onDidChange.fire(toGitUri(uri, '', { replaceFileExtension: true }));
	}

	@debounce(1100)
	private eventuallyFireChangeEvents(): void {
		this.fireChangeEvents();
	}

	@throttle
	private async fireChangeEvents(): Promise<void> {
		if (!window.state.focused) {
			const onDidFocusWindow = filterEvent(window.onDidChangeWindowState, e => e.focused);
			await eventToPromise(onDidFocusWindow);
		}

		Object.keys(this.cache).forEach(key => {
			const uri = this.cache[key].uri;
			const fsPath = uri.fsPath;

			for (const root of this.changedRepositoryRoots) {
				if (isDescendant(root, fsPath)) {
					this._onDidChange.fire(uri);
					return;
				}
			}
		});

		this.changedRepositoryRoots.clear();
	}

	async provideTextDocumentContent(uri: Uri): Promise<string> {
		let { path, ref, submoduleOf } = fromGitUri(uri);

		if (submoduleOf) {
			const repository = this.model.getRepository(submoduleOf);

			if (!repository) {
				return '';
			}

			if (ref === 'index') {
				return await repository.diffIndexWithHEAD(path);
			} else {
				return await repository.diffWithHEAD(path);
			}
		}

		const repository = this.model.getRepository(uri);

		if (!repository) {
			return '';
		}

		const cacheKey = uri.toString();
		const timestamp = new Date().getTime();
		const cacheValue: CacheRow = { uri, timestamp };

		this.cache[cacheKey] = cacheValue;

		if (ref === '~') {
			const fileUri = Uri.file(path);
			const uriString = fileUri.toString();
			const [indexStatus] = repository.indexGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString);
			ref = indexStatus ? '' : 'HEAD';
		} else if (/^~\d$/.test(ref)) {
			ref = `:${ref[1]}`;
		}

		try {
			return await repository.show(ref, path);
		} catch (err) {
			return '';
		}
	}

	private cleanup(): void {
		const now = new Date().getTime();
		const cache = Object.create(null);

		Object.keys(this.cache).forEach(key => {
			const row = this.cache[key];
			const { path } = fromGitUri(row.uri);
			const isOpen = workspace.textDocuments
				.filter(d => d.uri.scheme === 'file')
				.some(d => pathEquals(d.uri.fsPath, path));

			if (isOpen || now - row.timestamp < THREE_MINUTES) {
				cache[row.uri.toString()] = row;
			}
		});

		this.cache = cache;
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
