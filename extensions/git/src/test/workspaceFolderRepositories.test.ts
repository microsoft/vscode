/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { Uri, WorkspaceFolder } from 'vscode';
import { IWorkspaceFolderRepositoriesHost, WorkspaceFolderRepositories } from '../workspaceFolderRepositories';
import { isDescendant } from '../util';

const primary = Uri.file('/repo/primary').fsPath;
const wt1 = Uri.file('/repo/wt1').fsPath;
const wt2 = Uri.file('/repo/wt2').fsPath;
const wt3 = Uri.file('/repo/wt3').fsPath;
const nested = path.join(primary, '.worktrees', 'w1');
const other = Uri.file('/other').fsPath;
const knownLocations = [primary, wt1, wt2, wt3, nested];
const repositoriesOnDisk = [primary, wt1, wt2, wt3, nested, other];

type TestFolder = { -readonly [K in keyof WorkspaceFolder]: WorkspaceFolder[K] };

/**
 * A workspace folder at `fsPath` whose known locations are `locations`, or not known yet.
 */
function folder(fsPath: string, index = 0, locations?: string[]): TestFolder {
	return { uri: Uri.file(fsPath), name: path.basename(fsPath), index, locations: locations?.map(l => ({ uri: Uri.file(l), name: path.basename(l) })) };
}

function deepest(roots: Iterable<string>, fsPath: string): string | undefined {
	return [...roots].filter(r => isDescendant(r, fsPath)).sort((a, b) => b.length - a.length)[0];
}

class Deferred {
	readonly promise: Promise<void>;
	resolve!: () => void;
	constructor() { this.promise = new Promise(c => this.resolve = c); }
}

async function flush(): Promise<void> {
	for (let i = 0; i < 20; i++) {
		await Promise.resolve();
	}
}

/**
 * A workspace with the git model's repositories, where each repository is its root. Repositories open when
 * `register` is called for their location and are ready when `ready` is called for them, unless `autoOpen`.
 */
class TestWorkspace implements IWorkspaceFolderRepositoriesHost<string> {

	folders: TestFolder[];
	readonly open = new Map<string, { warm: boolean; ready: Deferred; isReady: boolean }>();
	readonly opens = new Map<string, Deferred>();
	readonly closedWhileCurrent: string[] = [];
	opening = 0;

	readonly model: WorkspaceFolderRepositories<string>;

	constructor(folders: TestFolder[], private readonly autoOpen = true, firstStatusTimeout = 1e9) {
		this.folders = folders;
		this.model = new WorkspaceFolderRepositories<string>(this, 3, firstStatusTimeout);
		for (const f of folders) {
			this.register(deepest(repositoriesOnDisk, f.uri.fsPath)!, false, true);
		}
	}

	getWorkspaceFolders() { return this.folders; }
	getOpenRepositories() { return [...this.open.keys()]; }
	getRoot(r: string) { return r; }
	getOpenRepository(fsPath: string) { return deepest(this.open.keys(), fsPath); }
	isWarm(r: string) { return this.open.get(r)!.warm; }
	setWarm(r: string, warm: boolean) { this.open.get(r)!.warm = warm; }
	whenFirstStatus(r: string) { return this.open.get(r)!.ready.promise; }

	openRepository(fsPath: string): Promise<void> {
		if (this.autoOpen) {
			this.registerLocation(fsPath);
			return Promise.resolve();
		}
		const deferred = this.opens.get(fsPath) ?? new Deferred();
		this.opens.set(fsPath, deferred);
		return deferred.promise;
	}

	close(r: string) {
		if (this.folders.some(f => deepest(repositoriesOnDisk, f.uri.fsPath) === r)) {
			this.closedWhileCurrent.push(r);
		}
		this.open.delete(r);
		this.model.delete(r);
	}

	showOpening(opening: Promise<void>) {
		this.opening++;
		const done = () => this.opening--;
		opening.then(done, done);
	}

	/** The repository at `fsPath` opens, see `openRepository`. */
	registerLocation(fsPath: string): void {
		const root = deepest(repositoriesOnDisk, fsPath);
		if (root && !this.open.has(root)) {
			this.register(root, true, this.autoOpen);
		}
		this.opens.get(fsPath)?.resolve();
		this.opens.delete(fsPath);
	}

	ready(root: string): void {
		const r = this.open.get(root);
		if (r) {
			r.isReady = true;
			r.ready.resolve();
		}
	}

	/** `Model.onDidChangeWorkspaceFolders`: a switch, or the code of `main` for a folder that is not known to switch. */
	switchTo(fsPath: string, index = 0): void {
		const removed = this.folders[index];
		const added = folder(fsPath, index);
		this.folders = this.folders.map((f, i) => i === index ? added : f);
		const switches = this.model.getFolderLocationSwitches([added], [removed]);
		if (switches.length) {
			this.model.switchFolderLocations(switches);
			return;
		}

		this.model.onDidRemoveWorkspaceFolders([removed]);
		const toOpen = this.getOpenRepository(added.uri.fsPath) ? undefined : deepest(repositoriesOnDisk, added.uri.fsPath);
		const left = this.getOpenRepository(removed.uri.fsPath);
		if (left && !this.folders.some(f => isDescendant(f.uri.fsPath, left))) {
			this.close(left);
		}
		if (toOpen && !this.open.has(toOpen)) {
			this.register(toOpen, false, true);
		}
	}

	/** The locations of the workspace folders become known. */
	resolveLocations(): void {
		this.folders.forEach(f => f.locations ??= knownLocations.map(l => ({ uri: Uri.file(l), name: path.basename(l) })));
		this.model.onDidChangeWorkspaceFolderLocations(true);
	}

	get shown(): string[] { return [...this.open].filter(([, r]) => !r.warm).map(([root]) => root); }
	get warm(): string[] { return [...this.open].filter(([, r]) => r.warm).map(([root]) => root).sort(); }
	get state() { return { shown: this.shown, warm: this.warm }; }

	private register(root: string, warm: boolean, isReady: boolean): void {
		const ready = new Deferred();
		if (isReady) {
			ready.resolve();
		}
		this.open.set(root, { warm, ready, isReady });
	}
}

suite('WorkspaceFolderRepositories', () => {

	test('a folder removed whose known locations include an added folder switched to it', () => {
		const model = new TestWorkspace([]).model;
		const known = folder(primary, 0, knownLocations);

		assert.deepStrictEqual([
			model.getFolderLocationSwitches([folder(wt1)], [known]).map(s => s.to.uri.fsPath),
			model.getFolderLocationSwitches([folder(other)], [known]),
			model.getFolderLocationSwitches([folder(wt1)], [folder(primary)]),
			model.getFolderLocationSwitches([folder(primary)], [known]),
		], [[wt1], [], [], []]);
	});

	test('a switch to a cold location hides the location that is left at once and shows the new one once ready', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)]);

		ws.switchTo(wt1);
		const whileOpening = { ...ws.state, opening: ws.opening };
		ws.ready(wt1);
		await flush();

		assert.deepStrictEqual({ whileOpening, ready: { ...ws.state, opening: ws.opening } }, {
			whileOpening: { shown: [], warm: [primary, wt1].sort(), opening: 1 },
			ready: { shown: [wt1], warm: [primary], opening: 0 }
		});
	});

	test('a switch back to a warm location shows it at once', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)]);
		ws.switchTo(wt1);
		ws.ready(wt1);
		await flush();
		ws.resolveLocations();

		ws.switchTo(primary);

		assert.deepStrictEqual({ ...ws.state, opening: ws.opening }, { shown: [primary], warm: [wt1], opening: 0 });
	});

	test('a switch to a worktree nested in the location that is left opens the worktree', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)]);

		ws.switchTo(nested);
		ws.ready(nested);
		await flush();

		assert.deepStrictEqual(ws.state, { shown: [nested], warm: [primary] });
	});

	test('keeps the three most recently left locations warm and closes the least recently left one', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)]);

		for (const location of [wt1, wt2, wt3, nested]) {
			ws.switchTo(location);
			ws.ready(location);
			await flush();
			ws.resolveLocations();
		}

		assert.deepStrictEqual(ws.state, { shown: [nested], warm: [wt1, wt2, wt3] });
	});

	test('the new location is shown after the first status timeout', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)], true, 10);

		ws.switchTo(wt1);
		await new Promise(c => setTimeout(c, 50));

		assert.deepStrictEqual(ws.state, { shown: [wt1], warm: [primary] });
	});

	test('a repository that is the repository of another workspace folder is not hidden', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations), folder(path.join(primary, 'src'), 1)]);

		ws.switchTo(wt1);
		ws.ready(wt1);
		await flush();

		assert.deepStrictEqual(ws.state, { shown: [primary, wt1], warm: [] });
	});

	test('a location in the repository of the location that is left shows that repository', async () => {
		const ws = new TestWorkspace([folder(primary, 0, [primary, path.join(primary, 'src')])]);

		ws.switchTo(path.join(primary, 'src'));
		await flush();

		assert.deepStrictEqual(ws.state, { shown: [primary], warm: [] });
	});

	test('a git resource read in the same tick as a switch to a cold location waits until its repository is open', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)], false);

		ws.switchTo(wt1);
		const read = (async () => {
			await ws.model.whenSwitchesOpened();
			return ws.getOpenRepository(path.join(wt1, 'file.txt'));
		})();
		ws.registerLocation(wt1);

		assert.strictEqual(await read, wt1);
	});

	test('a switch before the locations were known keeps the location that is left warm once they are known', async () => {
		const ws = new TestWorkspace([folder(primary)]);
		ws.folders[0].locations = undefined;

		ws.switchTo(nested);
		const beforeLocations = ws.state;
		ws.resolveLocations();
		ws.ready(nested);
		await flush();

		assert.deepStrictEqual({ beforeLocations, afterLocations: ws.state }, {
			beforeLocations: { shown: [], warm: [] },
			afterLocations: { shown: [nested], warm: [] }
		});
	});

	test('a warm repository that is not a known location anymore is closed once the locations are known', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)]);
		ws.switchTo(wt1);
		ws.ready(wt1);
		await flush();
		ws.resolveLocations();

		ws.folders[0].locations = [{ uri: Uri.file(wt1), name: 'wt1' }, { uri: Uri.file(wt2), name: 'wt2' }];
		ws.model.onDidChangeWorkspaceFolderLocations(true);

		assert.deepStrictEqual(ws.state, { shown: [wt1], warm: [] });
	});

	test('every order in which up to three switches of a folder begin, open, get their first status and learn their locations shows the repository of the location the folder is at', async () => {
		type Event = { kind: 'begin' | 'register' | 'ready' | 'locations'; index: number };
		const targets = [wt1, wt2, nested, primary];
		const sequences: string[][] = [];
		for (const a of targets.filter(t => t !== primary)) {
			for (const b of targets.filter(t => t !== a)) {
				sequences.push([a, b]);
				for (const c of targets.filter(t => t !== b)) {
					sequences.push([a, b, c]);
				}
			}
		}

		// Each switch begins after the previous one and its locations are learnt after it begins, before the next switch
		// begins if at all, or at any time for the last one. A switch opens after it begins and is ready after it opens.
		const orders = (count: number, known: boolean[]): Event[][] => {
			const all: Event[] = [];
			for (let index = 0; index < count; index++) {
				all.push({ kind: 'begin', index }, { kind: 'register', index }, { kind: 'ready', index });
				if (known[index]) {
					all.push({ kind: 'locations', index });
				}
			}
			const has = (done: Event[], kind: Event['kind'], index: number) => done.some(e => e.kind === kind && e.index === index);
			const canRun = (e: Event, done: Event[]) => {
				switch (e.kind) {
					case 'begin': return e.index === 0 || (has(done, 'begin', e.index - 1) && (!known[e.index - 1] || has(done, 'locations', e.index - 1)));
					case 'register': return has(done, 'begin', e.index);
					case 'ready': return has(done, 'register', e.index);
					case 'locations': return has(done, 'begin', e.index) && !has(done, 'begin', e.index + 1);
				}
			};
			const result: Event[][] = [];
			const visit = (done: Event[]) => {
				if (done.length === all.length) {
					result.push(done);
					return;
				}
				all.filter(e => !done.includes(e) && canRun(e, done)).forEach(e => visit([...done, e]));
			};
			visit([]);
			return result;
		};

		const violations: string[] = [];
		let runs = 0;
		for (const sequence of sequences) {
			for (let mask = 0; mask < 1 << sequence.length; mask++) {
				const known = sequence.map((_, i) => !!(mask & (1 << i)));
				for (const order of orders(sequence.length, known)) {
					runs++;
					const ws = new TestWorkspace([folder(primary, 0, knownLocations)], false);
					const describe = () => `${sequence.map(l => path.basename(l)).join('>')} known=${known.map(Number).join('')} ${order.map(e => `${e.kind === 'ready' ? 's' : e.kind[0]}${e.index}`).join(' ')}`;
					let allSwitchesKnown = true;
					for (const event of order) {
						const location = sequence[event.index];
						switch (event.kind) {
							case 'begin': allSwitchesKnown &&= ws.folders[0].locations !== undefined; ws.switchTo(location); break;
							case 'register': ws.registerLocation(location); break;
							case 'ready': ws.ready(deepest(repositoriesOnDisk, location)!); break;
							case 'locations': ws.resolveLocations(); break;
						}
						await flush();

						// Only the repository of the location the folder is at is shown, once its first status ran
						const current = deepest(repositoriesOnDisk, ws.folders[0].uri.fsPath)!;
						const shown = ws.shown;
						if (allSwitchesKnown && (shown.some(r => r !== current) || shown.some(r => !ws.open.get(r)!.isReady))) {
							violations.push(`${describe()}: after ${event.kind === 'ready' ? 's' : event.kind[0]}${event.index} shown=[${shown.map(r => path.basename(r))}]`);
						}
					}

					ws.resolveLocations();
					for (const location of [primary, ...sequence]) {
						ws.registerLocation(location);
						ws.ready(deepest(repositoriesOnDisk, location)!);
					}
					await flush();

					const current = deepest(repositoriesOnDisk, ws.folders[0].uri.fsPath)!;
					if (ws.shown.length !== 1 || ws.shown[0] !== current || ws.opening !== 0) {
						violations.push(`${describe()}: settled shown=[${ws.shown.map(r => path.basename(r))}] warm=[${ws.warm.map(r => path.basename(r))}] opening=${ws.opening}`);
					}
					if (ws.closedWhileCurrent.length) {
						violations.push(`${describe()}: closed current [${ws.closedWhileCurrent.map(r => path.basename(r))}]`);
					}
				}
			}
		}

		assert.deepStrictEqual({ runs: runs > 1000, violations: violations.slice(0, 10), count: violations.length }, { runs: true, violations: [], count: 0 });
	});
});
