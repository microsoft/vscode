/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import {
	FileChangeType,
	FileSystemProviderCapabilities,
	FileSystemProviderError,
	FileSystemProviderErrorCode,
	FileType,
	IFileChange,
	IFileDeleteOptions,
	IFileOverwriteOptions,
	IFileSystemProviderWithFileReadWriteCapability,
	IStat,
	IWatchOptions,
} from '../../../../platform/files/common/files.js';
import { IPspSession } from '../common/processStateProtocolService.js';
import { IObservable } from '../../../../base/common/observable.js';

const SESSIONS_PATH = '/sessions';

/**
 * Read-only file system provider that exposes live PSP sessions as JSON files at
 * `psp:/sessions/<sessionId>.json`. Each read returns a pretty-printed snapshot of the session's
 * watch document; updates fire `onDidChangeFile` so open editors refresh automatically.
 */
export class PspFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.Readonly | FileSystemProviderCapabilities.PathCaseSensitive;
	readonly onDidChangeCapabilities = Event.None;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	private readonly _watchedSessions = this._register(new DisposableMap<string>());
	private readonly _mtimes = new Map<string, number>();

	constructor(
		private readonly _sessions: IObservable<ReadonlyMap<string, IPspSession>>,
	) {
		super();

		this._register(autorun(reader => {
			const sessions = this._sessions.read(reader);
			this._reconcileWatched(sessions);
		}));
	}

	private _reconcileWatched(sessions: ReadonlyMap<string, IPspSession>): void {
		// Drop watchers for sessions that disappeared.
		for (const id of [...this._watchedSessions.keys()]) {
			if (!sessions.has(id)) {
				this._watchedSessions.deleteAndDispose(id);
				this._mtimes.delete(id);
				this._fire(id, FileChangeType.DELETED);
			}
		}
		// Add watchers for new sessions.
		for (const [id, session] of sessions) {
			if (this._watchedSessions.has(id)) {
				continue;
			}
			let isFirst = true;
			const sub = autorun(reader => {
				session.doc.read(reader);
				const now = Date.now();
				this._mtimes.set(id, now);
				if (isFirst) {
					isFirst = false;
					this._fire(id, FileChangeType.ADDED);
				} else {
					this._fire(id, FileChangeType.UPDATED);
				}
			});
			this._watchedSessions.set(id, sub);
		}
	}

	private _fire(sessionId: string, type: FileChangeType): void {
		this._onDidChangeFile.fire([{ resource: sessionUri(sessionId), type }]);
	}

	watch(_resource: URI, _opts: IWatchOptions): IDisposable {
		// Provider already broadcasts every doc change globally; nothing per-resource to do.
		return toDisposable(() => { /* noop */ });
	}

	async stat(resource: URI): Promise<IStat> {
		const sessions = this._sessions.get();
		if (resource.path === '/' || resource.path === SESSIONS_PATH) {
			return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0 };
		}
		const id = sessionIdFromPath(resource.path);
		if (id && sessions.has(id)) {
			const content = this._renderSession(sessions.get(id)!);
			return {
				type: FileType.File,
				mtime: this._mtimes.get(id) ?? 0,
				ctime: 0,
				size: content.byteLength,
			};
		}
		throw FileSystemProviderError.create(`Not found: ${resource.toString()}`, FileSystemProviderErrorCode.FileNotFound);
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		if (resource.path === '/') {
			return [['sessions', FileType.Directory]];
		}
		if (resource.path === SESSIONS_PATH) {
			const sessions = this._sessions.get();
			return [...sessions.keys()].map<[string, FileType]>(id => [`${id}.json`, FileType.File]);
		}
		throw FileSystemProviderError.create(`Not a directory: ${resource.toString()}`, FileSystemProviderErrorCode.FileNotFound);
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const id = sessionIdFromPath(resource.path);
		const session = id ? this._sessions.get().get(id) : undefined;
		if (!session) {
			throw FileSystemProviderError.create(`Not found: ${resource.toString()}`, FileSystemProviderErrorCode.FileNotFound);
		}
		return this._renderSession(session);
	}

	private _renderSession(session: IPspSession): Uint8Array {
		const payload = {
			sessionId: session.id,
			client: session.client,
			doc: session.doc.get(),
		};
		return VSBuffer.fromString(JSON.stringify(payload, null, 2)).buffer;
	}

	// --- write surface (rejected) -----------------------------------------------------------------

	writeFile(): Promise<void> {
		throw FileSystemProviderError.create('PSP documents are read-only', FileSystemProviderErrorCode.NoPermissions);
	}
	mkdir(): Promise<void> {
		throw FileSystemProviderError.create('PSP documents are read-only', FileSystemProviderErrorCode.NoPermissions);
	}
	delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> {
		throw FileSystemProviderError.create('PSP documents are read-only', FileSystemProviderErrorCode.NoPermissions);
	}
	rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		throw FileSystemProviderError.create('PSP documents are read-only', FileSystemProviderErrorCode.NoPermissions);
	}
}

export function sessionUri(sessionId: string): URI {
	return URI.from({ scheme: 'psp', path: `${SESSIONS_PATH}/${sessionId}.json` });
}

function sessionIdFromPath(p: string): string | undefined {
	if (!p.startsWith(`${SESSIONS_PATH}/`)) {
		return undefined;
	}
	const tail = p.slice(SESSIONS_PATH.length + 1);
	if (!tail.endsWith('.json')) {
		return undefined;
	}
	return tail.slice(0, -'.json'.length);
}
