/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace, Uri, Disposable, Event, EventEmitter, window, FileSystemProvider, FileChangeEvent, FileStat, FileType, FileChangeType, FileSystemError, LogOutputChannel } from 'vscode';
import { debounce, throttle } from './decorators';
import { fromGitUri, toGitUri } from './uri';
import { Model, ModelChangeEvent, OriginalResourceChangeEvent } from './model';
import { filterEvent, eventToPromise, isDescendant, pathEquals, EmptyDisposable } from './util';
import { Repository } from './repository';

interface CacheRow {
	uri: Uri;
	timestamp: number;
}

const THREE_MINUTES = 1000 * 60 * 3;
const FIVE_MINUTES = 1000 * 60 * 5;

function sanitizeRef(ref: string, path: string, submoduleOf: string | undefined, repository: Repository): string {
	if (ref === '~') {
		const fileUri = Uri.file(path);
		const uriString = fileUri.toString();
		const [indexStatus] = repository.indexGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString);
		return indexStatus ? '' : 'HEAD';
	}

	if (/^~\d$/.test(ref)) {
		return `:${ref[1]}`;
	}

	// Submodule HEAD
	if (submoduleOf && (ref === 'index' || ref === 'wt')) {
		return 'HEAD';
	}

	return ref;
}

export class GitFileSystemProvider implements FileSystemProvider {

	private _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();
	readonly onDidChangeFile: Event<FileChangeEvent[]> = this._onDidChangeFile.event;

	private changedRepositoryRoots = new Set<string>();
	private cache = new Map<string, CacheRow>();
	private mtime = new Date().getTime();
	private disposables: Disposable[] = [];

	constructor(private readonly model: Model, private readonly logger: LogOutputChannel) {
		this.disposables.push(
			model.onDidChangeRepository(this.onDidChangeRepository, this),
			model.onDidChangeOriginalResource(this.onDidChangeOriginalResource, this),
			workspace.registerFileSystemProvider('git', this, { isReadonly: true, isCaseSensitive: true }),
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

		const diffOriginalResourceUri = toGitUri(uri, '~',);
		const quickDiffOriginalResourceUri = toGitUri(uri, '', { replaceFileExtension: true });

		this.mtime = new Date().getTime();
		this._onDidChangeFile.fire([
			{ type: FileChangeType.Changed, uri: diffOriginalResourceUri },
			{ type: FileChangeType.Changed, uri: quickDiffOriginalResourceUri }
		]);
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

		const events: FileChangeEvent[] = [];

		for (const { uri } of this.cache.values()) {
			const fsPath = uri.fsPath;

			for (const root of this.changedRepositoryRoots) {
				if (isDescendant(root, fsPath)) {
					events.push({ type: FileChangeType.Changed, uri });
					break;
				}
			}
		}

		if (events.length > 0) {
			this.mtime = new Date().getTime();
			this._onDidChangeFile.fire(events);
		}

		this.changedRepositoryRoots.clear();
	}

	private cleanup(): void {
		const now = new Date().getTime();
		const cache = new Map<string, CacheRow>();

		for (const row of this.cache.values()) {
			const { path } = fromGitUri(row.uri);
			const isOpen = workspace.textDocuments
				.filter(d => d.uri.scheme === 'file')
				.some(d => pathEquals(d.uri.fsPath, path));

			if (isOpen || now - row.timestamp < THREE_MINUTES) {
				cache.set(row.uri.toString(), row);
			} else {
				// TODO: should fire delete events?
			}
		}

		this.cache = cache;
	}

	watch(): Disposable {
		return EmptyDisposable;
	}

	async stat(uri: Uri): Promise<FileStat> {
		await this.model.isInitialized;

		const { submoduleOf, path, ref } = fromGitUri(uri);
		const repository = submoduleOf ? this.model.getRepository(submoduleOf) : this.model.getRepository(uri);
		if (!repository) {
			this.logger.warn(`[GitFileSystemProvider][stat] Repository not found - ${uri.toString()}`);
			throw FileSystemError.FileNotFound();
		}

		try {
			const details = await repository.getObjectDetails(sanitizeRef(ref, path, submoduleOf, repository), path);
			return { type: FileType.File, size: details.size, mtime: this.mtime, ctime: 0 };
		} catch {
			// Empty tree
			if (ref === await repository.getEmptyTree()) {
				this.logger.warn(`[GitFileSystemProvider][stat] Empty tree - ${uri.toString()}`);
				return { type: FileType.File, size: 0, mtime: this.mtime, ctime: 0 };
			}

			// File does not exist in git. This could be because the file is untracked or ignored
			this.logger.warn(`[GitFileSystemProvider][stat] File not found - ${uri.toString()}`);
			throw FileSystemError.FileNotFound();
		}
	}

	readDirectory(): Thenable<[string, FileType][]> {
		throw new Error('Method not implemented.');
	}

	createDirectory(): void {
		throw new Error('Method not implemented.');
	}

	async readFile(uri: Uri): Promise<Uint8Array> {
		await this.model.isInitialized;

		const { path, ref, submoduleOf } = fromGitUri(uri);

		if (submoduleOf) {
			const repository = this.model.getRepository(submoduleOf);

			if (!repository) {
				throw FileSystemError.FileNotFound();
			}

			const encoder = new TextEncoder();

			if (ref === 'index') {
				return encoder.encode(await repository.diffIndexWithHEAD(path));
			} else {
				return encoder.encode(await repository.diffWithHEAD(path));
			}
		}

		const repository = this.model.getRepository(uri);

		if (!repository) {
			this.logger.warn(`[GitFileSystemProvider][readFile] Repository not found - ${uri.toString()}`);
			throw FileSystemError.FileNotFound();
		}

		const timestamp = new Date().getTime();
		const cacheValue: CacheRow = { uri, timestamp };

		this.cache.set(uri.toString(), cacheValue);

		try {
			return await repository.buffer(sanitizeRef(ref, path, submoduleOf, repository), path);
		} catch {
			// Empty tree
			if (ref === await repository.getEmptyTree()) {
				this.logger.warn(`[GitFileSystemProvider][readFile] Empty tree - ${uri.toString()}`);
				return new Uint8Array(0);
			}

			// File does not exist in git. This could be because the file is untracked or ignored
			this.logger.warn(`[GitFileSystemProvider][readFile] File not found - ${uri.toString()}`);
			throw FileSystemError.FileNotFound();
		}
	}

	writeFile(): void {
		throw new Error('Method not implemented.');
	}

	delete(): void {
		throw new Error('Method not implemented.');
	}

	rename(): void {
		throw new Error('Method not implemented.');
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
