/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { FileCreateReservation, FileReadState, FileWriteGuard, FileWriteGuardDependencies, FileWriteLineage, getFileWriteGuard, hashFileContent, isFileNotFound, NodeFileWriteIdentity, StaleFileWriteError } from '../fileWriteGuard';

class MemoryIdentity implements FileWriteGuardDependencies {
	readonly aliases = new Map<string, string>();
	readonly nativeKeys = new Map<string, readonly string[]>();
	readonly states = new Map<string, FileReadState>();
	canonicalizationError: Error | undefined;

	async canonicalize(uri: URI): Promise<readonly string[]> {
		if (this.canonicalizationError) {
			throw this.canonicalizationError;
		}
		return this.nativeKeys.get(uri.toString()) ?? [this.aliases.get(uri.toString()) ?? uri.toString()];
	}

	async reserveCreate(): Promise<FileCreateReservation> {
		throw new Error('Reservations are not used in memory snapshot tests');
	}

	async read(uri: URI): Promise<FileReadState> {
		return this.states.get(uri.toString()) ?? { kind: 'missing' };
	}

	text(uri: URI, text: string): void {
		const hash = hashFileContent(text);
		this.states.set(uri.toString(), { kind: 'text', hash, diskHash: hash });
	}
}

describe('provider file reservations', () => {
	test('default provider adapter creates without overwrite and preserves a replacement on rollback', async () => {
		const service = new MockFileSystemService();
		const target = URI.parse('memfs:/workspace/created.ts');
		const guard = getFileWriteGuard(service);
		const reservation = await guard.reserveCreate(target);
		expect(await reservation.verify()).toBe(true);
		await service.writeFile(target, new TextEncoder().encode('replacement'));
		await reservation.rollback();
		await expect(guard.reserveCreate(target)).rejects.toThrow('EEXIST');
		expect({ verified: await reservation.verify(), content: new TextDecoder().decode(await service.readFile(target)) }).toEqual({ verified: false, content: 'replacement' });
	});

	test('concurrent provider reservations only create one target', async () => {
		const service = new MockFileSystemService();
		const guard = getFileWriteGuard(service);
		const target = URI.parse('memfs:/workspace/shared.ts');
		const outcomes = await Promise.allSettled([guard.reserveCreate(target), guard.reserveCreate(target)]);
		expect({ created: outcomes.filter(outcome => outcome.status === 'fulfilled').length, content: (await service.readFile(target)).byteLength }).toEqual({ created: 1, content: 0 });
	});
});

describe('FileWriteGuard', () => {
	const a = URI.file('/workspace/a.ts');
	const b = URI.file('/workspace/b.ts');
	let identity: MemoryIdentity;
	let guard: FileWriteGuard;
	let lineage: FileWriteLineage;

	beforeEach(() => {
		identity = new MemoryIdentity();
		identity.text(a, 'visible line\nhidden line');
		identity.text(b, 'other file');
		guard = new FileWriteGuard(identity);
		lineage = { owner: {}, id: 'agent:one' };
	});

	test('locks aliases, deduplicates keys, and releases idempotently', async () => {
		const alias = URI.file('/workspace/link.ts');
		identity.aliases.set(alias.toString(), a.toString());
		const first = await guard.acquire([a, alias], CancellationToken.None);
		const order: string[] = [];
		const waiting = guard.acquire([alias], CancellationToken.None).then(release => { order.push('alias'); release(); });
		const independent = await guard.acquire([b], CancellationToken.None);
		order.push('independent');
		independent();
		first();
		first();
		await waiting;
		expect(order).toEqual(['independent', 'alias']);
	});

	test('reversed multi-target order is deadlock-free and overlapping batches are serialized', async () => {
		const first = await guard.acquire([b, a], CancellationToken.None);
		const secondStarted = new DeferredPromise<void>();
		const second = guard.acquire([a, b], CancellationToken.None).then(async release => {
			await secondStarted.complete();
			release();
		});
		first();
		await second;
		expect(secondStarted.isResolved).toBe(true);
	});

	test('cancelling a queued owner does not let a successor bypass the current owner', async () => {
		const first = await guard.acquire([a], CancellationToken.None);
		const cancellation = new CancellationTokenSource();
		const cancelled = guard.acquire([a], cancellation.token);
		// Let canonicalization complete and the waiter join the queue.
		await Promise.resolve();
		await Promise.resolve();
		cancellation.cancel();
		await expect(cancelled).rejects.toThrow('Canceled');
		let acquired = false;
		const successor = guard.acquire([a], CancellationToken.None).then(release => { acquired = true; release(); });
		await Promise.resolve();
		await Promise.resolve();
		expect(acquired).toBe(false);
		first();
		await successor;
		cancellation.dispose();
		expect(acquired).toBe(true);
	});

	test('full text detects changes beyond a displayed range', async () => {
		const [read] = await guard.capture([a], uri => identity.read(uri));
		guard.recordRead(lineage, read);
		identity.text(a, 'visible line\nchanged hidden line');
		const prepared = await guard.capture([a], uri => identity.read(uri));
		expect(() => guard.assertTracked(lineage, prepared)).toThrow(StaleFileWriteError);
	});

	test('epoch rejects an ABA write even when bytes are restored', async () => {
		const prepared = await guard.capture([a], uri => identity.read(uri));
		guard.recordRead(lineage, prepared[0]);
		guard.emitted({ owner: lineage.owner, id: 'agent:two' }, prepared);
		await expect(guard.validate(lineage, prepared, [a], uri => identity.read(uri))).rejects.toThrow(StaleFileWriteError);
	});

	test('another invocation lineage has independent reads; a fresh reread rebases a blocked lineage', async () => {
		const prepared = await guard.capture([a], uri => identity.read(uri));
		guard.recordRead(lineage, prepared[0]);
		guard.emitted(lineage, prepared);
		identity.text(a, 'new content');
		const reread = await guard.capture([a], uri => identity.read(uri));
		const other = { owner: lineage.owner, id: 'agent:two' };
		guard.assertTracked(other, reread);
		expect(() => guard.assertTracked(lineage, reread)).toThrow(StaleFileWriteError);
		guard.recordRead(lineage, reread[0]);
		expect(() => guard.assertTracked(lineage, reread)).not.toThrow();
	});

	test('rereading through a hard-link alias rebases shared native identity without losing path checks', async () => {
		identity.nativeKeys.set(a.toString(), ['path:a', 'inode:1:2']);
		identity.nativeKeys.set(b.toString(), ['path:b', 'inode:1:2']);
		identity.text(b, 'visible line\nhidden line');
		const first = await guard.capture([a], uri => identity.read(uri));
		guard.recordRead(lineage, first[0]);
		guard.assertTracked(lineage, await guard.capture([b], uri => identity.read(uri)));
		guard.emitted(lineage, first);
		identity.text(a, 'rebased');
		identity.text(b, 'rebased');
		const [reread] = await guard.capture([b], uri => identity.read(uri));
		guard.recordRead(lineage, reread);
		expect(() => guard.assertTracked(lineage, [reread])).not.toThrow();
		const current = await guard.capture([a], uri => identity.read(uri));
		expect(() => guard.assertTracked(lineage, current)).not.toThrow();
	});

	test('cached multi-file delete/move preconditions reject before running a mutation callback', async () => {
		const destination = URI.file('/workspace/destination.ts');
		const targets = [a, b, destination];
		const prepared = await guard.capture(targets, uri => identity.read(uri));
		identity.text(destination, 'concurrently created');
		const mutations: string[] = [];
		try {
			await guard.validate(lineage, prepared, targets, uri => identity.read(uri));
			mutations.push('delete a and move b');
		} catch (error) {
			expect(error).toBeInstanceOf(StaleFileWriteError);
		}
		expect(mutations).toEqual([]);
	});

	test('extra healed targets and removed targets do not inherit a prepared check', async () => {
		const prepared = await guard.capture([a], uri => identity.read(uri));
		await expect(guard.validate(lineage, prepared, [a, b], uri => identity.read(uri))).rejects.toThrow(StaleFileWriteError);
		await expect(guard.validate(lineage, prepared, [], uri => identity.read(uri))).rejects.toThrow(StaleFileWriteError);
	});

	test('bytes hash covers the entire input, not just a hexdump window', async () => {
		const bytes = new Uint8Array(4096);
		const original = hashFileContent(bytes);
		identity.states.set(a.toString(), { kind: 'bytes', hash: original, diskHash: original });
		const prepared = await guard.capture([a], uri => identity.read(uri));
		bytes[4000] = 1;
		const changed = hashFileContent(bytes);
		identity.states.set(a.toString(), { kind: 'bytes', hash: changed, diskHash: changed });
		await expect(guard.validate(lineage, prepared, [a], uri => identity.read(uri))).rejects.toThrow(StaleFileWriteError);
	});

	test('permission/transport errors are not interpreted as missing files by message heuristics', () => {
		expect([
			isFileNotFound({ code: 'ENOENT' }),
			isFileNotFound({ code: 'FileNotFound' }),
			isFileNotFound({ code: 'EACCES', message: 'file not found or inaccessible' }),
			isFileNotFound({ code: 'Unavailable', message: 'not found' }),
			isFileNotFound({ code: 'EACCES', message: 'ENOENT' }),
			isFileNotFound(new Error('no such file')),
		]).toEqual([true, true, false, false, false, false]);
	});

	test('identity changes between canonicalization and payload capture reject the snapshot', async () => {
		await expect(guard.capture([a], async uri => {
			identity.aliases.set(uri.toString(), 'replacement-file-identity');
			return identity.read(uri);
		})).rejects.toThrow(StaleFileWriteError);
	});

	test('a queued writer rejects changed canonical identity and releases obsolete keys', async () => {
		const first = await guard.acquire([a], CancellationToken.None);
		const waiting = guard.acquire([a], CancellationToken.None);
		await Promise.resolve();
		await Promise.resolve();
		identity.aliases.set(a.toString(), 'new-native-identity');
		first();
		await expect(waiting).rejects.toThrow(StaleFileWriteError);
		const release = await guard.acquire([a], CancellationToken.None);
		release();
	});

	test('a failed read stays blocked until a successful reread even without a native identity', async () => {
		identity.canonicalizationError = Object.assign(new Error('Inaccessible identity'), { code: 'EACCES' });
		await guard.recordFailedRead(lineage, a, false);
		identity.canonicalizationError = undefined;
		const current = await guard.capture([a], uri => identity.read(uri));
		expect(() => guard.assertTracked(lineage, current)).toThrow(StaleFileWriteError);
		guard.recordRead(lineage, current[0]);
		expect(() => guard.assertTracked(lineage, current)).not.toThrow();
	});
});

describe('NodeFileWriteIdentity', () => {
	let directory: string;
	let identity: NodeFileWriteIdentity;

	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-file-guard-'));
		identity = new NodeFileWriteIdentity();
	});

	afterEach(async () => {
		await fs.rm(directory, { recursive: true, force: true });
	});

	test('exclusive create refuses existing empty files, and cleanup restores absence', async () => {
		const uri = URI.file(path.join(directory, 'nested', 'empty.ts'));
		const reservation = await identity.reserveCreate(uri);
		expect(await reservation.verify()).toBe(true);
		await expect(identity.reserveCreate(uri)).rejects.toMatchObject({ code: 'EEXIST' });
		await reservation.rollback();
		await expect(fs.stat(uri.fsPath)).rejects.toMatchObject({ code: 'ENOENT' });
	});

	test('rollback preserves a replacement empty file with a different native identity', async () => {
		const uri = URI.file(path.join(directory, 'file.ts'));
		const reservation = await identity.reserveCreate(uri);
		await fs.rename(uri.fsPath, path.join(directory, 'original-reservation.ts'));
		await fs.writeFile(uri.fsPath, '', { flag: 'wx' });
		await reservation.rollback();
		expect({ matches: await reservation.verify(), size: (await fs.stat(uri.fsPath)).size }).toEqual({ matches: false, size: 0 });
	});

	test('rollback preserves content written into the reserved identity', async () => {
		const uri = URI.file(path.join(directory, 'file.ts'));
		const reservation = await identity.reserveCreate(uri);
		await fs.writeFile(uri.fsPath, 'external content');
		await reservation.rollback();
		expect(await fs.readFile(uri.fsPath, 'utf8')).toBe('external content');
	});

	test('hard-link aliases share a native inode lock key', async () => {
		const uri = URI.file(path.join(directory, 'file.ts'));
		const alias = URI.file(path.join(directory, 'alias.ts'));
		await fs.writeFile(uri.fsPath, 'content');
		await fs.link(uri.fsPath, alias.fsPath);
		const first = await identity.canonicalize(uri);
		const second = await identity.canonicalize(alias);
		expect(first.filter(key => key.startsWith('inode:'))).toHaveLength(1);
		expect(first.filter(key => key.startsWith('inode:'))).toEqual(second.filter(key => key.startsWith('inode:')));
	});

	test('symlinked missing descendants canonicalize through the nearest existing parent', async () => {
		const target = path.join(directory, 'target');
		const alias = path.join(directory, 'link');
		await fs.mkdir(target);
		await fs.symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
		expect(await identity.canonicalize(URI.file(path.join(alias, 'missing', 'new.ts')))).toEqual(await identity.canonicalize(URI.file(path.join(target, 'missing', 'new.ts'))));
	});

	test('provider identities and reservations come from the injected provider, never local URI casing', async () => {
		const native = new MemoryIdentity();
		const uri = URI.parse('testfs://authority/Upper.ts');
		native.aliases.set(uri.toString(), 'provider:native:42');
		const provider = new NodeFileWriteIdentity(fs, process.platform, native);
		expect(await provider.canonicalize(uri)).toEqual(['provider:native:42']);
		await expect(provider.reserveCreate(uri)).rejects.toThrow('Reservations are not used in memory snapshot tests');
		expect(() => identity.assertWriteSupported(uri)).toThrow('native file identity');
		await expect(identity.reserveCreate(uri)).rejects.toThrow('native exclusive creation');
	});
});