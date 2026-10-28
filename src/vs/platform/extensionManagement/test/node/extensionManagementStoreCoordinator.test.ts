/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { DeferredPromise } from '../../../../base/common/async.js';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionManagementStoreCoordinator } from '../../node/extensionManagementStoreCoordinator.js';

const coordinatorModule = new URL('../../node/extensionManagementStoreCoordinator.js', import.meta.url).href;

suite('ExtensionManagementStoreCoordinator', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let directory: string;
	const coordinators: ExtensionManagementStoreCoordinator[] = [];
	const children: ChildProcessWithoutNullStreams[] = [];

	setup(async () => {
		directory = await mkdtemp(join(tmpdir(), 'extension-store-coordination-'));
	});

	teardown(async () => {
		for (const child of children.splice(0)) {
			if (child.exitCode === null && child.signalCode === null) {
				const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
				child.kill('SIGKILL');
				await exited;
			}
		}
		for (const coordinator of coordinators.splice(0)) {
			await coordinator.close();
		}
		await rm(directory, { recursive: true, force: true });
	});

	function create(busyTimeout = 1000, filename = 'coordination.sqlite'): ExtensionManagementStoreCoordinator {
		const coordinator = new ExtensionManagementStoreCoordinator(join(directory, filename), busyTimeout);
		coordinators.push(coordinator);
		return coordinator;
	}

	function child(script: string): { process: ChildProcessWithoutNullStreams; output: Promise<string> } {
		const process = spawn(globalThis.process.execPath, ['--input-type=module', '-e', `
			import { ExtensionManagementStoreCoordinator } from ${JSON.stringify(coordinatorModule)};
			const coordinator = new ExtensionManagementStoreCoordinator(${JSON.stringify(join(directory, 'coordination.sqlite'))}, 50);
			${script}
		`], { env: globalThis.process.env, stdio: 'pipe' });
		children.push(process);
		let stdout = '', stderr = '';
		process.stdout.on('data', data => stdout += data);
		process.stderr.on('data', data => stderr += data);
		const output = new Promise<string>((resolve, reject) => {
			process.once('error', reject);
			process.once('exit', code => code === 0 ? resolve(stdout) : reject(new Error(`Child exited ${code}: ${stderr}`)));
		});
		// Crash tests intentionally kill the child and separately observe its exit.
		output.catch(() => { });
		return { process, output };
	}

	test('compatible shared reads coalesce only until completion', async () => {
		const coordinator = create();
		const owner = {};
		const entered = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		let calls = 0;
		const read = async () => { calls++; entered.complete(); await finish.p; return calls; };
		const first = coordinator.withSharedRead(owner, 'options', read);
		await entered.p;
		const duplicates = Array.from({ length: 40 }, () => coordinator.withSharedRead(owner, 'options', read));
		assert.ok(duplicates.every(promise => promise === first));
		finish.complete();
		assert.deepStrictEqual(await Promise.all([first, ...duplicates]), Array(41).fill(1));
		assert.strictEqual(await coordinator.withSharedRead(owner, 'options', async () => ++calls), 2);
	});

	test('closing prevents later calls from borrowing an earlier shared read', async () => {
		const coordinator = create();
		const owner = {};
		const finish = new DeferredPromise<void>();
		const first = coordinator.withSharedRead(owner, 'inventory', async () => { await finish.p; return 'before close'; });
		const closed = coordinator.close();
		const late = coordinator.withSharedRead(owner, 'inventory', async () => assert.fail('read after close'));
		late.catch(() => { });
		finish.complete();
		assert.strictEqual(await first, 'before close');
		await closed;
		await assert.rejects(late, /closed/);
	});

	test('shared reads isolate owners and option keys', async () => {
		const coordinator = create();
		const owner = {};
		let calls = 0;
		const read = async () => ++calls;
		const results = await Promise.all([
			coordinator.withSharedRead(owner, 'profile-one', read),
			coordinator.withSharedRead(owner, 'profile-two', read),
			coordinator.withSharedRead({}, 'profile-one', read),
		]);
		assert.deepStrictEqual(results, [1, 2, 3]);
	});

	test('a queued writer separates shared read cohorts and preserves observation order', async () => {
		const coordinator = create();
		const owner = {};
		const entered = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		let inventory = 'before';
		const first = coordinator.withSharedRead(owner, 'inventory', async () => {
			const captured = inventory;
			entered.complete();
			await finish.p;
			return captured;
		});
		await entered.p;
		const write = coordinator.withMutation(async () => { inventory = 'after'; });
		const next = coordinator.withSharedRead(owner, 'inventory', async () => inventory);
		assert.notStrictEqual(next, first);
		assert.strictEqual(coordinator.withSharedRead(owner, 'inventory', async () => assert.fail('duplicate next scan')), next);
		finish.complete();
		assert.strictEqual(await first, 'before');
		await write;
		assert.strictEqual(await next, 'after');
	});

	test('plain reads and protocol calls also separate queued shared cohorts', async () => {
		const coordinator = create();
		const owner = {};
		const finish = new DeferredPromise<void>();
		const first = coordinator.withSharedRead(owner, 'inventory', async () => { await finish.p; return 1; });
		const plain = coordinator.withRead(async () => { });
		const second = coordinator.withSharedRead(owner, 'inventory', async () => 2);
		const identity = coordinator.getIdentity();
		const third = coordinator.withSharedRead(owner, 'inventory', async () => 3);
		assert.notStrictEqual(first, second);
		assert.notStrictEqual(second, third);
		finish.complete();
		assert.deepStrictEqual(await Promise.all([first, second, third]), [1, 2, 3]);
		await Promise.all([plain, identity]);
	});

	test('reservation-owned shared reads bypass outside cohorts without deadlocking', async () => {
		const coordinator = create();
		const owner = {};
		const finish = new DeferredPromise<void>();
		const blocker = coordinator.withRead(async () => { await finish.p; });
		const reserved = coordinator.reserve('owned-read', () => coordinator.withSharedRead(owner, 'inventory', async () => 'reserved'));
		const outside = coordinator.withSharedRead(owner, 'inventory', async () => 'outside');
		finish.complete();
		await blocker;
		assert.strictEqual(await reserved, 'reserved');
		assert.strictEqual(await outside, 'outside');
		await coordinator.release('owned-read');
	});

	test('failed shared reads evict their cohort and allow a fresh retry', async () => {
		const coordinator = create();
		const owner = {};
		const first = coordinator.withSharedRead(owner, 'inventory', async () => { throw new Error('scan failed'); });
		const second = coordinator.withSharedRead(owner, 'inventory', async () => assert.fail('duplicate failed scan'));
		assert.strictEqual(first, second);
		await assert.rejects(first, /scan failed/);
		await assert.rejects(second, /scan failed/);
		assert.strictEqual(await coordinator.withSharedRead(owner, 'inventory', async () => 'retry'), 'retry');
	});

	test('expired operation callbacks cannot borrow a fresh shared cohort', async () => {
		const coordinator = create();
		const owner = {};
		const trigger = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		let late: Promise<unknown> | undefined;
		await coordinator.withRead(async () => {
			late = trigger.p.then(() => coordinator.withSharedRead(owner, 'inventory', async () => assert.fail('expired read ran')));
			late.catch(() => { });
		});
		const fresh = coordinator.withSharedRead(owner, 'inventory', async () => { await finish.p; return 'fresh'; });
		trigger.complete();
		try {
			await assert.rejects(late!, /already finished/);
		} finally {
			finish.complete();
		}
		assert.strictEqual(await fresh, 'fresh');
	});

	test('nested mutation invalidates a shared cohort before changing inventory', async () => {
		const coordinator = create();
		const owner = {};
		const mutate = new DeferredPromise<void>();
		const mutated = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		let inventory = 'before';
		const first = coordinator.withSharedRead(owner, 'inventory', async () => {
			const captured = inventory;
			await mutate.p;
			await coordinator.withMutation(async () => { inventory = 'after'; });
			mutated.complete();
			await finish.p;
			return captured;
		});
		mutate.complete();
		await mutated.p;
		const next = coordinator.withSharedRead(owner, 'inventory', async () => inventory);
		assert.notStrictEqual(next, first);
		finish.complete();
		assert.strictEqual(await first, 'before');
		assert.strictEqual(await next, 'after');
	});

	test('persists reservations across reopen and permits reads but rejects foreign writes', async () => {
		const first = create();
		await first.reserve('remote', async () => 'inventory');
		await first.close();
		const reopened = create();
		assert.strictEqual(await reopened.withRead(async () => 'read'), 'read');
		await assert.rejects(reopened.withMutation(async () => assert.fail('must not mutate')), /reserved/);
		await reopened.release('remote');
		await reopened.withMutation(async () => { });
		await assert.rejects(reopened.reserve('remote', async () => assert.fail('late begin')), /released/);
	});

	test('release and abort fence delayed requests even when they arrive before prepare or reserve', async () => {
		const coordinator = create();
		await coordinator.release('late-reservation');
		await assert.rejects(coordinator.reserve('late-reservation', async () => { }), /released/);
		await coordinator.abortOperation('late-operation');
		await assert.rejects(coordinator.prepareOperation('late-operation', 'payload'), /prepared again/);
		await assert.rejects(coordinator.commitOperation('late-operation', async () => assert.fail('late commit')), /not prepared/);
	});

	test('commits under its matching reservation and never replays a terminal callback', async () => {
		const coordinator = create();
		await coordinator.reserve('own', async () => { await coordinator.withMutation(async () => { }); });
		await coordinator.prepareOperation('own', 'payload');
		await coordinator.prepareOperation('own', 'payload');
		let calls = 0;
		await coordinator.commitOperation('own', async payload => {
			assert.strictEqual(payload, 'payload');
			await coordinator.withMutation(async () => { calls++; });
		});
		await assert.rejects(coordinator.commitOperation('own', async () => { calls++; }), /not prepared/);
		assert.strictEqual(calls, 1);
		await coordinator.release('own');
	});

	test('release fences a prepared same-host operation with the same identifier', async () => {
		const coordinator = create();
		await coordinator.reserve('released', async () => { });
		await coordinator.prepareOperation('released', 'payload');
		await coordinator.release('released');
		await assert.rejects(coordinator.commitOperation('released', async () => assert.fail('commit after release')), /released/);
	});

	test('a foreign reservation blocks a prepared commit without consuming it', async () => {
		const coordinator = create();
		await coordinator.prepareOperation('local', 'payload');
		await coordinator.reserve('foreign', async () => { });
		await assert.rejects(coordinator.commitOperation('local', async () => assert.fail('foreign writer')), /reserved/);
		await coordinator.release('foreign');
		await coordinator.commitOperation('local', async () => { });
	});

	test('task errors preserve partial filesystem effects but durably prevent replay', async () => {
		const coordinator = create();
		const file = join(directory, 'partial');
		await coordinator.prepareOperation('partial', file);
		await assert.rejects(coordinator.commitOperation('partial', async payload => {
			await writeFile(payload, 'changed');
			throw new Error('filesystem task failed');
		}), /filesystem task failed/);
		await coordinator.close();
		const reopened = create();
		await assert.rejects(reopened.commitOperation('partial', async () => assert.fail('replayed')), /not prepared/);
		assert.strictEqual(await readFile(file, 'utf8'), 'changed');
	});

	test('abort waits for a running commit before fencing subsequent commits', async () => {
		const coordinator = create();
		const other = create();
		await other.withRead(async () => { });
		await coordinator.prepareOperation('operation', 'payload');
		const entered = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		const commit = coordinator.commitOperation('operation', async () => { entered.complete(); await finish.p; });
		await entered.p;
		const abort = other.abortOperation('operation');
		finish.complete();
		await Promise.all([commit, abort]);
		await assert.rejects(coordinator.commitOperation('operation', async () => assert.fail('replayed')), /not prepared/);
	});

	test('separate connections exclude filesystem callbacks with bounded busy failure', async () => {
		const coordinator = create();
		const other = create(25);
		await other.withRead(async () => { });
		const entered = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		const writer = coordinator.withMutation(async () => { entered.complete(); await finish.p; });
		await entered.p;
		try {
			await assert.rejects(other.withMutation(async () => assert.fail('concurrent writer')), /SQLITE_BUSY/);
		} finally {
			finish.complete();
			await writer;
		}
		await other.withMutation(async () => { });
	});

	test('cached authorization is valid only inside its exclusive transaction', async () => {
		const coordinator = create();
		const other = create(25);
		await other.withRead(async () => { });
		let mutations = 0;
		await coordinator.withMutation(async () => {
			await coordinator.withMutation(async () => { mutations++; });
			await assert.rejects(other.reserve('next transaction', async () => assert.fail('reservation appeared inside authorized transaction')), /SQLITE_BUSY/);
			await coordinator.withMutation(async () => { mutations++; });
			await assert.rejects(coordinator.reserve('nested', async () => assert.fail('nested protocol')), /inside another operation/);
		});
		await other.reserve('next transaction', async () => { });
		await assert.rejects(coordinator.withMutation(async () => { mutations++; }), /reserved/);
		await assert.rejects(coordinator.withRead(() => coordinator.withMutation(async () => { mutations++; })), /reserved/);
		assert.strictEqual(mutations, 2);
		await other.release('next transaction');
		await coordinator.withMutation(async () => { mutations++; });
		assert.strictEqual(mutations, 3);
	});

	test('separate processes cannot enter while a filesystem task holds the transaction', async () => {
		const coordinator = create();
		await coordinator.withMutation(async () => {
			const contender = child(`
				try { await coordinator.withMutation(async () => { throw new Error('entered filesystem callback'); }); process.exitCode = 1; }
				catch (error) { if (error.code !== 'SQLITE_BUSY') throw error; console.log('blocked'); }
			`);
			assert.match(await contender.output, /blocked/);
		});
	});

	test('a reservation survives its creating process exiting', async () => {
		await child(`await coordinator.reserve('durable', async () => {}); await coordinator.close();`).output;
		const coordinator = create();
		await assert.rejects(coordinator.withMutation(async () => assert.fail('ignored durable reservation')), /reserved/);
		await coordinator.release('durable');
	});

	test('a committed reservation survives its creating process being killed', async () => {
		const running = child(`await coordinator.reserve('crash-reservation', async () => {}); console.log('reserved'); setInterval(() => {}, 1000);`);
		await new Promise<void>((resolve, reject) => {
			let output = '';
			running.process.stdout.on('data', data => { output += data; if (output.includes('reserved')) { resolve(); } });
			running.process.once('exit', () => reject(new Error('Child exited before reserving')));
		});
		const exited = new Promise<void>(resolve => running.process.once('exit', () => resolve()));
		running.process.kill('SIGKILL');
		await exited;
		const coordinator = create();
		await assert.rejects(coordinator.withMutation(async () => assert.fail('reservation expired on crash')), /reserved/);
		await coordinator.release('crash-reservation');
	});

	test('process death rolls back SQL, retains partial files and allows abort to fence the prepared operation', async () => {
		const file = join(directory, 'crash-partial');
		const running = child(`
			await coordinator.prepareOperation('crash', ${JSON.stringify(file)});
			await coordinator.commitOperation('crash', async payload => {
				const { writeFile } = await import('fs/promises');
				await writeFile(payload, 'partial');
				console.log('entered');
				await new Promise(() => { setInterval(() => {}, 1000); });
			});
		`);
		await new Promise<void>((resolve, reject) => {
			running.process.stdout.on('data', data => { if (data.toString().includes('entered')) { resolve(); } });
			running.process.once('exit', () => reject(new Error('Child exited before entering task')));
		});
		const exited = new Promise<void>(resolve => running.process.once('exit', () => resolve()));
		running.process.kill('SIGKILL');
		await exited;
		const coordinator = create();
		await coordinator.abortOperation('crash');
		await assert.rejects(coordinator.commitOperation('crash', async () => assert.fail('replayed crash')), /not prepared/);
		assert.strictEqual(await readFile(file, 'utf8'), 'partial');
	});

	test('read upgrades check reservations and nested work cannot admit an unrelated caller', async () => {
		const coordinator = create();
		await coordinator.withRead(() => coordinator.withMutation(async () => { }));
		await coordinator.reserve('owner', async () => coordinator.withRead(() => coordinator.withMutation(async () => { })));
		await assert.rejects(coordinator.withRead(() => coordinator.withMutation(async () => assert.fail('foreign upgrade'))), /reserved/);
		await coordinator.release('owner');
		const entered = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		const order: string[] = [];
		const first = coordinator.withMutation(async () => {
			await Promise.all([coordinator.withMutation(async () => order.push('nested one')), coordinator.withRead(async () => order.push('nested two'))]);
			entered.complete();
			await finish.p;
			order.push('first finished');
		});
		await entered.p;
		const unrelated = coordinator.withMutation(async () => { order.push('unrelated'); });
		finish.complete();
		await Promise.all([first, unrelated]);
		assert.deepStrictEqual({ nested: order.slice(0, 2).sort(), completion: order.slice(2) }, { nested: ['nested one', 'nested two'], completion: ['first finished', 'unrelated'] });
	});

	test('holds the transaction until nested work started by the task finishes', async () => {
		const coordinator = create();
		const entered = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		const order: string[] = [];
		const first = coordinator.withMutation(async () => {
			void coordinator.withMutation(async () => { entered.complete(); await finish.p; order.push('nested finished'); });
		});
		await entered.p;
		const other = coordinator.withMutation(async () => { order.push('unrelated'); });
		finish.complete();
		await Promise.all([first, other]);
		assert.deepStrictEqual(order, ['nested finished', 'unrelated']);
	});

	test('expired operation contexts cannot turn delayed callbacks into unowned mutations', async () => {
		const coordinator = create();
		const trigger = new DeferredPromise<void>();
		let late: Promise<void> | undefined;
		let mutated = false;
		await coordinator.prepareOperation('delayed', 'payload');
		await coordinator.commitOperation('delayed', async () => {
			late = trigger.p.then(() => coordinator.withMutation(async () => { mutated = true; }));
			late.catch(() => { });
		});
		await coordinator.abortOperation('delayed');
		await coordinator.release('delayed');
		trigger.complete();
		await assert.rejects(late!, /already finished/);
		assert.strictEqual(mutated, false);
		await coordinator.withMutation(async () => { });
	});

	test('a reservation drains nested background reads before capturing its inventory', async () => {
		const coordinator = create();
		const other = create(25);
		await other.withRead(async () => { });
		const entered = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		const read = coordinator.withRead(async () => {
			void coordinator.withRead(async () => { entered.complete(); await finish.p; });
		});
		await entered.p;
		try {
			await assert.rejects(other.reserve('read-fence', async () => assert.fail('read still active')), /SQLITE_BUSY/);
		} finally {
			finish.complete();
			await read;
		}
		assert.strictEqual(await other.reserve('read-fence', async () => 'new inventory'), 'new inventory');
		await other.release('read-fence');
	});

	test('identity survives reopen and mismatches cannot reserve or release another store', async () => {
		const original = create();
		const identity = await original.getIdentity();
		await original.reserve('bound', async () => { }, identity);
		const other = create(1000, 'other.sqlite');
		assert.notStrictEqual(await other.getIdentity(), identity);
		await assert.rejects(other.reserve('bound', async () => assert.fail('wrong store read'), identity), /identity has changed/);
		await assert.rejects(other.release('bound', identity), /identity has changed/);
		// A failed release must not install a RELEASED tombstone in the wrong store.
		await other.reserve('bound', async () => { });
		await assert.rejects(original.withMutation(async () => assert.fail('original reservation removed')), /reserved/);
		await assert.rejects(original.release('bound', await other.getIdentity()), /identity has changed/);
		await original.close();
		assert.strictEqual(await create().getIdentity(), identity);
	});

	test('prepare and recovery intent are atomic and exact retries cannot change the target', async () => {
		const coordinator = create();
		await assert.rejects(coordinator.prepareOperation('atomic', 'payload', ''), /invalid/);
		await assert.rejects(coordinator.commitOperation('atomic', async () => assert.fail('partial prepare')), /not prepared/);
		await coordinator.prepareOperation('atomic', 'payload', 'opaque workspace target');
		await coordinator.prepareOperation('atomic', 'payload', 'opaque workspace target');
		await assert.rejects(coordinator.prepareOperation('atomic', 'payload', 'other'), /prepared again/);
		await assert.rejects(coordinator.prepareOperation('atomic', 'payload'), /prepared again/);
		assert.deepStrictEqual(await coordinator.pendingOperations('opaque workspace target'), ['atomic']);
		assert.deepStrictEqual(await coordinator.pendingOperations('other'), []);
		await assert.rejects(coordinator.acknowledgeOperation('atomic'), /must finish/);
		await coordinator.abortOperation('atomic');
		assert.deepStrictEqual(await coordinator.pendingOperations('opaque workspace target'), ['atomic']);
		await coordinator.acknowledgeOperation('atomic');
		await coordinator.acknowledgeOperation('atomic');
		assert.deepStrictEqual(await coordinator.pendingOperations('opaque workspace target'), []);
		await assert.rejects(coordinator.prepareOperation('atomic', 'payload', 'opaque workspace target'), /prepared again/);
		await assert.rejects(coordinator.commitOperation('atomic', async () => assert.fail('late commit')), /not prepared/);
	});

	test('intent insertion failure rolls back the prepared operation', async () => {
		const coordinator = create();
		await coordinator.getIdentity();
		const sqlite3 = await import('@vscode/sqlite3');
		const database = new sqlite3.default.Database(join(directory, 'coordination.sqlite'));
		try {
			await new Promise<void>((resolve, reject) => database.exec(`CREATE TRIGGER reject_intent BEFORE INSERT ON intents BEGIN SELECT RAISE(ABORT, 'intent rejected'); END`, error => error ? reject(error) : resolve()));
			await assert.rejects(coordinator.prepareOperation('rollback', 'payload', 'target'), /intent rejected/);
			await assert.rejects(coordinator.commitOperation('rollback', async () => assert.fail('unrecoverable prepare')), /not prepared/);
			assert.deepStrictEqual(await coordinator.pendingOperations('target'), []);
			await new Promise<void>((resolve, reject) => database.exec('DROP TRIGGER reject_intent', error => error ? reject(error) : resolve()));
			await coordinator.prepareOperation('rollback', 'payload', 'target');
			assert.deepStrictEqual(await coordinator.pendingOperations('target'), ['rollback']);
		} finally {
			await new Promise<void>((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
		}
	});

	test('invalid durable metadata and intent rows fail closed', async () => {
		const coordinator = create();
		await coordinator.prepareOperation('corrupt-intent', 'payload', 'target');
		const sqlite3 = await import('@vscode/sqlite3');
		const database = new sqlite3.default.Database(join(directory, 'coordination.sqlite'));
		try {
			await new Promise<void>((resolve, reject) => database.exec(`PRAGMA ignore_check_constraints = ON; UPDATE intents SET state = 'invalid'`, error => error ? reject(error) : resolve()));
			await assert.rejects(coordinator.pendingOperations('target'), /data is invalid/);
			await new Promise<void>((resolve, reject) => database.exec(`UPDATE intents SET state = 'PENDING'; UPDATE metadata SET value = 'invalid'`, error => error ? reject(error) : resolve()));
			await assert.rejects(coordinator.getIdentity(), /data is invalid/);
			await assert.rejects(coordinator.reserve('new', async () => assert.fail('invalid identity')), /data is invalid/);
			await assert.rejects(coordinator.release('new'), /data is invalid/);
		} finally {
			await new Promise<void>((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
		}
	});

	test('acknowledgement permits absent intents only after a terminal fence', async () => {
		const coordinator = create();
		await assert.rejects(coordinator.acknowledgeOperation('unknown'), /must finish/);
		await coordinator.abortOperation('unknown');
		await coordinator.acknowledgeOperation('unknown');
		await assert.rejects(coordinator.prepareOperation('unknown', 'late'), /prepared again/);
		await coordinator.prepareOperation('reserved', 'payload', 'target');
		await coordinator.reserve('reserved', async () => { });
		await coordinator.abortOperation('reserved');
		await assert.rejects(coordinator.acknowledgeOperation('reserved'), /must finish/);
		await coordinator.release('reserved');
		await coordinator.acknowledgeOperation('reserved');
	});

	test('pending recovery survives process kill and release-before-ack is retriable', async () => {
		const worker = child(`
			await coordinator.prepareOperation('crash-intent', 'payload', 'target');
			await coordinator.reserve('crash-intent', async () => { });
			console.log('ready');
			setInterval(() => {}, 1000);
		`);
		await new Promise<void>(resolve => worker.process.stdout.on('data', data => { if (String(data).includes('ready')) { resolve(); } }));
		const exited = new Promise<void>(resolve => worker.process.once('exit', () => resolve()));
		worker.process.kill('SIGKILL');
		await exited;
		const coordinator = create();
		assert.deepStrictEqual(await coordinator.pendingOperations('target'), ['crash-intent']);
		await coordinator.abortOperation('crash-intent');
		await coordinator.release('crash-intent', await coordinator.getIdentity());
		await coordinator.close();
		const reopened = create();
		assert.deepStrictEqual(await reopened.pendingOperations('target'), ['crash-intent']);
		await reopened.abortOperation('crash-intent');
		await reopened.release('crash-intent', await reopened.getIdentity());
		await reopened.acknowledgeOperation('crash-intent');
		assert.deepStrictEqual(await reopened.pendingOperations('target'), []);
		await assert.rejects(reopened.reserve('crash-intent', async () => assert.fail('late reserve')), /released/);
		await assert.rejects(reopened.commitOperation('crash-intent', async () => assert.fail('late commit')), /not prepared/);
	});

	test('unpublished version one databases are rejected without migration', async () => {
		const coordinator = create();
		await coordinator.getIdentity();
		await coordinator.close();
		const sqlite3 = await import('@vscode/sqlite3');
		const database = new sqlite3.default.Database(join(directory, 'coordination.sqlite'));
		await new Promise<void>((resolve, reject) => database.exec('PRAGMA user_version = 1', error => error ? reject(error) : resolve()));
		await new Promise<void>((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
		await assert.rejects(create().getIdentity(), /version is unsupported/);
	});

	test('invalid database data fails closed without replacing the database', async () => {
		const file = join(directory, 'coordination.sqlite');
		await writeFile(file, 'not a sqlite database');
		const coordinator = create();
		await assert.rejects(coordinator.withMutation(async () => assert.fail('corrupt database admitted mutation')), /SQLITE_NOTADB/);
		assert.strictEqual(await readFile(file, 'utf8'), 'not a sqlite database');
	});

	test('missing coordination tables fail closed instead of recreating lost fences', async () => {
		const coordinator = create();
		await coordinator.release('tombstone');
		await coordinator.close();
		const sqlite3 = await import('@vscode/sqlite3');
		const database = new sqlite3.default.Database(join(directory, 'coordination.sqlite'));
		try {
			await new Promise<void>((resolve, reject) => database.exec('DROP TABLE reservations', error => error ? reject(error) : resolve()));
		} finally {
			await new Promise<void>((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
		}
		await assert.rejects(create().withMutation(async () => assert.fail('lost fences recreated')), /data is invalid/);
	});
});
