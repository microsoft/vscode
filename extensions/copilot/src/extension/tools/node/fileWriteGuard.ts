/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import type { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { CancellationError } from '../../../util/vs/base/common/errors';
import type { URI } from '../../../util/vs/base/common/uri';
import type { IBuildPromptContext } from '../../prompt/common/intents';

export interface FileWriteLineage {
	readonly owner: object;
	readonly id: string;
}

export interface FileReadState {
	readonly kind: 'text' | 'bytes' | 'missing' | 'blocked';
	readonly hash?: string;
	readonly diskHash?: string;
}

export interface FileWriteSnapshot {
	readonly uri: URI;
	readonly keys: readonly string[];
	readonly epochs: readonly number[];
	readonly state: FileReadState;
}

export interface FileCreateReservation {
	/** Check the reservation before emitting edits. */
	verify(): Promise<boolean>;
	/** Remove only a reservation whose identity can still be verified. */
	rollback(): Promise<void>;
}

export interface FileWriteGuardDependencies {
	canonicalize(uri: URI): Promise<readonly string[]>;
	reserveCreate(uri: URI): Promise<FileCreateReservation>;
	assertWriteSupported?(uri: URI): void;
}

/** Filesystem-specific canonicalization and create reservations. */
export interface FileWriteProvider extends FileWriteGuardDependencies { }

export class StaleFileWriteError extends Error {
	readonly code = 'STALE_WRITE';
	constructor(readonly targets: readonly URI[]) {
		super(l10n.t('STALE_WRITE: Re-read every affected target and rebase the change. This invocation emitted no edits.'));
	}
}

/** Missing files use structured codes (or the exact legacy test sentinel); access-error prose is never matched. */
export function isFileNotFound(error: unknown): boolean {
	if (typeof error === 'object' && error !== null && 'code' in error) {
		return error.code === 'ENOENT' || error.code === 'FileNotFound' || error.code === 'EntryNotFound';
	}
	return error instanceof Error && error.message === 'ENOENT';
}

export function hashFileContent(content: string | Uint8Array): string {
	return createHash('sha256').update(content).digest('hex');
}

export function throwIfFileWriteCancelled(token: vscode.CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}

export function getFileWriteLineage(options: Pick<vscode.LanguageModelToolInvocationOptions<object>, 'toolInvocationToken' | 'chatRequestId'>, context?: IBuildPromptContext): FileWriteLineage {
	const agent = context?.tools?.subAgentInvocationId ?? context?.request?.subAgentInvocationId;
	return {
		owner: context?.conversation ?? options.toolInvocationToken ?? context?.request ?? context ?? options,
		id: agent ? `agent:${agent}` : `request:${options.chatRequestId ?? context?.requestId ?? context?.request?.id ?? ''}`,
	};
}

/** Serializes cooperating tools through edit emission, not asynchronous workbench application or external writers. */
export class FileWriteGuard {
	private readonly locks = new Map<string, Promise<void>>();
	private readonly epochs = new Map<string, number>();
	private readonly sessions = new WeakMap<object, Map<string, Map<string, FileWriteSnapshot>>>();

	constructor(private readonly dependencies: FileWriteGuardDependencies) { }

	private scope(lineage: FileWriteLineage): Map<string, FileWriteSnapshot> {
		let session = this.sessions.get(lineage.owner);
		if (!session) {
			session = new Map();
			this.sessions.set(lineage.owner, session);
		}
		let scope = session.get(lineage.id);
		if (!scope) {
			scope = new Map();
			session.set(lineage.id, scope);
		}
		return scope;
	}

	async snapshot(uri: URI, state: FileReadState): Promise<FileWriteSnapshot> {
		const keys = [...new Set(await this.dependencies.canonicalize(uri))].sort();
		return { uri, keys, epochs: keys.map(key => this.epochs.get(key) ?? 0), state };
	}

	recordRead(lineage: FileWriteLineage, snapshot: FileWriteSnapshot): void {
		const scope = this.scope(lineage);
		for (const [key, previous] of scope) {
			if (previous.uri.toString() !== snapshot.uri.toString() && previous.keys.some(candidate => snapshot.keys.includes(candidate))) {
				scope.set(key, { ...previous, state: snapshot.state, epochs: previous.keys.map(candidate => this.epochs.get(candidate) ?? 0) });
			}
		}
		for (const key of snapshot.keys) {
			scope.set(key, snapshot);
		}
		scope.set(`uri:${snapshot.uri.toString()}`, snapshot);
	}

	async recordFailedRead(lineage: FileWriteLineage, uri: URI, missing: boolean): Promise<void> {
		const state: FileReadState = { kind: missing ? 'missing' : 'blocked' };
		try {
			this.recordRead(lineage, await this.snapshot(uri, state));
		} catch {
			this.recordRead(lineage, { uri, keys: [], epochs: [], state });
		}
	}

	async capture(uris: readonly URI[], read: (uri: URI) => Promise<FileReadState>): Promise<FileWriteSnapshot[]> {
		const snapshots: FileWriteSnapshot[] = [];
		for (const uri of uris) {
			const before = await this.snapshot(uri, { kind: 'blocked' });
			const state = await read(uri);
			const after = await this.snapshot(uri, state);
			if (!this.sameIdentity(before, after)) {
				throw new StaleFileWriteError([uri]);
			}
			snapshots.push(after);
		}
		return snapshots;
	}

	private sameIdentity(before: FileWriteSnapshot, after: FileWriteSnapshot): boolean {
		return before.keys.length === after.keys.length && before.keys.every((key, i) => key === after.keys[i] && before.epochs[i] === after.epochs[i]);
	}

	private matches(before: FileWriteSnapshot, after: FileWriteSnapshot): boolean {
		const sharedKeys = before.keys.filter(key => after.keys.includes(key));
		const sameVersion = before.uri.toString() === after.uri.toString()
			? this.sameIdentity(before, after)
			: sharedKeys.length > 0 && sharedKeys.every(key => before.epochs[before.keys.indexOf(key)] === after.epochs[after.keys.indexOf(key)])
				&& before.keys.filter(key => key.startsWith('inode:')).join('\n') === after.keys.filter(key => key.startsWith('inode:')).join('\n');
		return sameVersion && before.state.kind !== 'blocked' && after.state.kind !== 'blocked'
			&& before.state.kind === after.state.kind && before.state.hash === after.state.hash && before.state.diskHash === after.state.diskHash;
	}

	assertTracked(lineage: FileWriteLineage, snapshots: readonly FileWriteSnapshot[]): void {
		const scope = this.scope(lineage);
		const stale = snapshots.filter(snapshot => [...snapshot.keys, `uri:${snapshot.uri.toString()}`].some(key => {
			const baseline = scope.get(key);
			return baseline && !this.matches(baseline, snapshot);
		}));
		if (stale.length) {
			this.block(lineage, snapshots);
			throw new StaleFileWriteError(stale.map(snapshot => snapshot.uri));
		}
	}

	async validate(lineage: FileWriteLineage, prepared: readonly FileWriteSnapshot[], targets: readonly URI[], read: (uri: URI) => Promise<FileReadState>): Promise<void> {
		const current = await this.capture(targets, read);
		const stale = current.filter(snapshot => {
			const baseline = prepared.find(candidate => candidate.uri.toString() === snapshot.uri.toString());
			return !baseline || !this.matches(baseline, snapshot);
		});
		if (stale.length || prepared.length !== current.length) {
			this.block(lineage, prepared);
			throw new StaleFileWriteError(stale.length ? stale.map(snapshot => snapshot.uri) : targets);
		}
		this.assertTracked(lineage, current);
	}

	block(lineage: FileWriteLineage, snapshots: readonly FileWriteSnapshot[]): void {
		for (const snapshot of snapshots) {
			this.recordRead(lineage, { ...snapshot, state: { kind: 'blocked' } });
		}
	}

	/** Epochs change even for uncertain/partial emission; only a fresh read clears the lineage block. */
	emitted(lineage: FileWriteLineage, snapshots: readonly FileWriteSnapshot[]): void {
		for (const key of new Set(snapshots.flatMap(snapshot => [...snapshot.keys]))) {
			this.epochs.set(key, (this.epochs.get(key) ?? 0) + 1);
		}
		this.block(lineage, snapshots);
	}

	async acquire(uris: readonly URI[], token: vscode.CancellationToken, readOnly = false): Promise<() => void> {
		throwIfFileWriteCancelled(token);
		if (!readOnly) {
			for (const uri of uris) {
				this.dependencies.assertWriteSupported?.(uri);
			}
		}
		const keys = [...new Set((await Promise.all(uris.map(uri => this.dependencies.canonicalize(uri)))).flat())].sort();
		const releases: (() => void)[] = [];
		try {
			for (const key of keys) {
				throwIfFileWriteCancelled(token);
				const previous = this.locks.get(key) ?? Promise.resolve();
				let unlock!: () => void;
				const gate = new Promise<void>(resolve => unlock = resolve);
				const tail = previous.then(() => gate);
				this.locks.set(key, tail);
				let released = false;
				releases.push(() => {
					if (!released) {
						released = true;
						unlock();
						if (this.locks.get(key) === tail) {
							// Retain the queue while an earlier owner is still holding it.
							void tail.then(() => { if (this.locks.get(key) === tail) { this.locks.delete(key); } });
						}
					}
				});
				await this.wait(previous, token);
			}
			throwIfFileWriteCancelled(token);
			const currentKeys = [...new Set((await Promise.all(uris.map(uri => this.dependencies.canonicalize(uri)))).flat())].sort();
			if (keys.length !== currentKeys.length || keys.some((key, i) => key !== currentKeys[i])) {
				throw new StaleFileWriteError(uris);
			}
			throwIfFileWriteCancelled(token);
		} catch (error) {
			for (const release of releases.reverse()) {
				release();
			}
			throw error;
		}
		return () => { for (const release of [...releases].reverse()) { release(); } };
	}

	private async wait(promise: Promise<void>, token: vscode.CancellationToken): Promise<void> {
		let cancel!: () => void;
		const cancelled = new Promise<never>((_, reject) => cancel = () => reject(new CancellationError()));
		const subscription = token.onCancellationRequested(cancel);
		try {
			if (token.isCancellationRequested) {
				cancel();
			}
			await Promise.race([promise, cancelled]);
		} finally {
			subscription.dispose();
		}
	}

	reserveCreate(uri: URI): Promise<FileCreateReservation> {
		return this.dependencies.reserveCreate(uri);
	}
}

/** Injectable Node filesystem operations keep realpath/reservation tests isolated from globals. */
export class NodeFileWriteIdentity implements FileWriteGuardDependencies {
	constructor(private readonly native: Pick<typeof fs, 'realpath' | 'stat' | 'lstat' | 'open' | 'mkdir' | 'unlink'> = fs, private readonly platform: NodeJS.Platform = process.platform, private readonly provider?: FileWriteProvider) { }

	assertWriteSupported(uri: URI): void {
		if (uri.scheme !== 'file') {
			if (!this.provider) {
				throw new Error(l10n.t('This filesystem provider does not expose native file identity and exclusive creation.'));
			}
			this.provider.assertWriteSupported?.(uri);
		}
	}

	private localPath(uri: URI): string {
		if (this.platform !== 'win32' && uri.authority && uri.authority.toLowerCase() !== 'localhost') {
			throw new Error(l10n.t('A non-local file URI requires a native filesystem provider.'));
		}
		return this.platform === 'win32' ? uri.fsPath : uri.path;
	}

	async canonicalize(uri: URI): Promise<readonly string[]> {
		if (uri.scheme !== 'file') {
			// No local path conversion or case folding for provider resources.
			return this.provider ? this.provider.canonicalize(uri) : [uri.toString()];
		}
		const filePath = this.localPath(uri);
		let resolved = path.resolve(filePath);
		const suffix: string[] = [];
		for (;;) {
			try {
				resolved = path.join(await this.native.realpath(resolved), ...suffix.reverse());
				break;
			} catch (error) {
				if (!isFileNotFound(error)) {
					throw error;
				}
				const parent = path.dirname(resolved);
				if (parent === resolved) {
					throw error;
				}
				suffix.push(path.basename(resolved));
				resolved = parent;
			}
		}
		const normalized = this.platform === 'win32' ? resolved.toLowerCase() : resolved;
		const keys = [`file:${normalized}`];
		try {
			const stat = await this.native.stat(filePath, { bigint: true });
			if (stat.ino) {
				keys.push(`inode:${stat.dev}:${stat.ino}`);
			}
		} catch (error) {
			if (!isFileNotFound(error)) {
				throw error;
			}
		}
		return keys.sort();
	}

	async reserveCreate(uri: URI): Promise<FileCreateReservation> {
		if (uri.scheme !== 'file') {
			if (!this.provider) {
				throw new Error(l10n.t('This filesystem provider does not expose native exclusive creation and reservation identity.'));
			}
			return this.provider.reserveCreate(uri);
		}
		const filePath = this.localPath(uri);
		await this.native.mkdir(path.dirname(filePath), { recursive: true });
		const handle = await this.native.open(filePath, 'wx');
		let identity: { dev: bigint; ino: bigint };
		try {
			identity = await handle.stat({ bigint: true });
		} finally {
			await handle.close();
		}
		const verify = async () => {
			try {
				const current = await this.native.lstat(filePath, { bigint: true });
				return !current.isSymbolicLink() && current.size === 0n && current.dev === identity.dev && current.ino === identity.ino && identity.ino !== 0n;
			} catch (error) {
				if (isFileNotFound(error)) {
					return false;
				}
				throw error;
			}
		};
		return {
			verify,
			rollback: async () => {
				// Identity-check/unlink is best effort against external renames; not an OS compare-and-delete.
				if (await verify()) {
					await this.native.unlink(filePath);
				}
			},
		};
	}
}

class ProviderFileWriteIdentity implements FileWriteProvider {
	constructor(private readonly service: IFileSystemService) { }

	async canonicalize(uri: URI): Promise<readonly string[]> {
		return [uri.toString()];
	}

	async reserveCreate(uri: URI): Promise<FileCreateReservation> {
		const parent = uri.with({ path: path.posix.dirname(uri.path) });
		const staging = uri.with({ path: path.posix.join(parent.path, `.vscode-create-${randomUUID()}`) });
		await this.service.createDirectory(parent);
		await this.service.writeFile(staging, new Uint8Array());
		try {
			await this.service.rename(staging, uri, { overwrite: false });
		} finally {
			await this.service.delete(staging).catch(() => { });
		}
		return {
			verify: async () => {
				try {
					return (await this.service.stat(uri)).size === 0 && (await this.service.readFile(uri)).byteLength === 0;
				} catch (error) {
					if (isFileNotFound(error)) {
						return false;
					}
					throw error;
				}
			},
			// Providers expose no inode identity; leave the target intact on failed emission.
			rollback: async () => { },
		};
	}
}

const guards = new WeakMap<IFileSystemService, FileWriteGuard>();

/** One guard per extension filesystem service, shared by all three tools; no activation/core lifecycle changes. */
export function getFileWriteGuard(service: IFileSystemService): FileWriteGuard {
	let guard = guards.get(service);
	if (!guard) {
		guard = new FileWriteGuard(new NodeFileWriteIdentity(fs, process.platform, new ProviderFileWriteIdentity(service)));
		guards.set(service, guard);
	}
	return guard;
}

/** Wire a provider's native identity/exclusive-create adapter before invoking any of the tools. */
export function initializeFileWriteGuard(service: IFileSystemService, dependencies: FileWriteGuardDependencies): FileWriteGuard {
	if (guards.has(service)) {
		throw new Error('File write guard is already initialized');
	}
	const guard = new FileWriteGuard(dependencies);
	guards.set(service, guard);
	return guard;
}

export async function readFileWriteState(service: IFileSystemService, uri: URI, text?: () => Promise<string>): Promise<FileReadState> {
	let diskHash: string;
	try {
		await service.stat(uri);
		const bytes = await service.readFile(uri);
		diskHash = hashFileContent(bytes);
	} catch (error) {
		if (isFileNotFound(error)) {
			return { kind: 'missing' };
		}
		throw error;
	}
	if (text) {
		try {
			return { kind: 'text', hash: hashFileContent(await text()), diskHash };
		} catch (error) {
			if (!(error instanceof Error) || !error.message.includes('seems to be binary')) {
				throw error;
			}
		}
	}
	return { kind: 'bytes', hash: diskHash, diskHash };
}