/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { Uri, WorkspaceFolder } from 'vscode';
import { ILocationOpening, IRepositoryChanges, WorkspaceFolderRepositories } from '../workspaceFolderRepositories';
import { isDescendant, isMacintosh, isWindows, PendingOperations } from '../util';

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
 * A repository at `root`, ready once its first git status ran, see `Repository`.
 */
class TestRepository {
	private readonly ready = new Deferred();
	readonly closed = new Deferred();
	isReady = false;

	constructor(readonly root: string, public isWarm: boolean, isReady: boolean) {
		if (isReady) {
			this.setReady();
		}
	}

	get whenFirstStatus() { return this.ready.promise; }
	setReady() { this.isReady = true; this.ready.resolve(); }
}

/**
 * A workspace and the git model, which applies the changes that `WorkspaceFolderRepositories` decides as `Model` does.
 * Repositories open when `registerLocation` is called for their location and are ready when `ready` is called for
 * them, unless `autoOpen`.
 */
class TestWorkspace {

	folders: TestFolder[];
	readonly open = new Map<string, TestRepository>();
	readonly opens = new Map<string, Deferred>();
	readonly closedWhileCurrent: string[] = [];
	readonly model = new WorkspaceFolderRepositories<TestRepository>(3);

	/** The repositories of switched locations until they are open, see `Model.locationOpens`. */
	readonly locationOpens = new PendingOperations();

	/** The switched locations until their repository is shown or kept warm, see `Model.locationSwitches`. */
	private readonly locationSwitches = new Set<Promise<void>>();

	constructor(folders: TestFolder[], private readonly autoOpen = true, private readonly firstStatusTimeout = 1e9) {
		this.folders = folders;
		for (const f of folders) {
			const root = deepest(repositoriesOnDisk, f.uri.fsPath)!;
			this.open.set(root, new TestRepository(root, false, true));
		}
	}

	get repositories() { return [...this.open.values()]; }
	getRepository(fsPath: string) { const root = deepest(this.open.keys(), fsPath); return root ? this.open.get(root) : undefined; }

	/** The repository at `fsPath` opens, see `Model.openRepository`. */
	registerLocation(fsPath: string): void {
		const opened = this.opens.get(fsPath);
		if (opened) {
			this.opens.delete(fsPath);
			this.addHiddenRepository(fsPath);
			opened.resolve();
		}
	}

	private addHiddenRepository(fsPath: string): void {
		const root = deepest(repositoriesOnDisk, fsPath);
		if (root && !this.open.has(root)) {
			this.open.set(root, new TestRepository(root, true, this.autoOpen));
		}
	}

	ready(root: string): void {
		this.open.get(root)?.setReady();
	}

	/** The folder at `index` moves to `fsPath`: `Model.onDidChangeWorkspaceFolders` handles a switch, or runs the code of `main`. */
	switchTo(fsPath: string, index = 0): void {
		const removed = this.folders[index];
		const added = folder(fsPath, index);
		this.folders = this.folders.map((f, i) => i === index ? added : f);
		const switches = this.model.getFolderLocationSwitches({ added: [added], removed: [removed] });
		if (switches) {
			this.apply(this.model.switchFolderLocations(switches, this.folders, this.repositories));
			return;
		}

		const toOpen = this.getRepository(added.uri.fsPath) ? undefined : deepest(repositoriesOnDisk, added.uri.fsPath);
		const left = this.getRepository(removed.uri.fsPath);
		if (left && !this.folders.some(f => isDescendant(f.uri.fsPath, left.root))) {
			this.close(left);
		}
		if (toOpen && !this.open.has(toOpen)) {
			this.open.set(toOpen, new TestRepository(toOpen, false, true));
		}
	}

	/** The locations of the workspace folders become known, see `Model.onDidChangeWorkspaceFolderLocations`. */
	resolveLocations(): void {
		this.folders.forEach(f => f.locations ??= knownLocations.map(l => ({ uri: Uri.file(l), name: path.basename(l) })));
		this.updateLocations();
	}

	/** The known locations of the workspace folders change, see `Model.onDidChangeWorkspaceFolderLocations`. */
	updateLocations(): void {
		this.apply(this.model.updateLeftLocations(this.folders, this.repositories, this.folders));
	}

	get opening(): number { return this.locationSwitches.size > 0 ? 1 : 0; }
	get shown(): string[] { return this.repositories.filter(r => !r.isWarm).map(r => r.root); }
	get warm(): string[] { return this.repositories.filter(r => r.isWarm).map(r => r.root).sort(); }
	get state() { return { shown: this.shown, warm: this.warm }; }

	/** `Model.applyRepositoryChanges` */
	private apply(changes: IRepositoryChanges<TestRepository>): void {
		changes.warm.forEach(r => r.isWarm = true);
		changes.show.forEach(r => r.isWarm = false);
		changes.close.forEach(r => this.close(r));
		for (const opening of changes.open) {
			const switching = this.openSwitchedLocation(opening);
			this.locationSwitches.add(switching);
			switching.finally(() => this.locationSwitches.delete(switching));
		}
	}

	/** `Model.openSwitchedLocation` */
	private async openSwitchedLocation(opening: ILocationOpening): Promise<void> {
		await this.locationOpens.track(this.openRepository(opening.location));

		const repository = this.getRepository(opening.location);
		if (repository?.isWarm && !this.model.setOpenedRepository(opening, repository)) {
			await Promise.race([repository.whenFirstStatus, repository.closed.promise, new Promise(c => setTimeout(c, this.firstStatusTimeout))]);
		}

		this.apply(this.model.completeOpening(opening, this.folders, this.repositories));
	}

	private openRepository(fsPath: string): Promise<void> {
		if (this.autoOpen) {
			this.addHiddenRepository(fsPath);
			return Promise.resolve();
		}
		const deferred = this.opens.get(fsPath) ?? new Deferred();
		this.opens.set(fsPath, deferred);
		return deferred.promise;
	}

	private close(repository: TestRepository) {
		if (!this.open.has(repository.root)) {
			return;
		}
		if (this.folders.some(f => deepest(repositoriesOnDisk, f.uri.fsPath) === repository.root)) {
			this.closedWhileCurrent.push(repository.root);
		}
		this.open.delete(repository.root);
		this.model.delete(repository);
		repository.closed.resolve();
	}
}

suite('WorkspaceFolderRepositories', () => {

	test('a folder removed whose known locations include an added folder switched to it', () => {
		const model = new TestWorkspace([]).model;
		const known = folder(primary, 0, knownLocations);

		assert.deepStrictEqual([
			model.getFolderLocationSwitches({ added: [folder(wt1)], removed: [known] })?.map(s => s.to.uri.fsPath),
			model.getFolderLocationSwitches({ added: [folder(other)], removed: [known] }),
			model.getFolderLocationSwitches({ added: [folder(wt1)], removed: [folder(primary)] }),
			model.getFolderLocationSwitches({ added: [folder(primary)], removed: [known] }),
			model.getFolderLocationSwitches({ added: [folder(wt1), folder(other, 1)], removed: [known] }),
		], [[wt1], undefined, undefined, undefined, undefined]);
	});

	test('decides to keep the location that is left warm, to open a cold location and to show it once opened, and to show a warm one at once', () => {
		const model = new WorkspaceFolderRepositories<{ root: string }>();
		const primaryRepository = { root: primary };
		const wt1Repository = { root: wt1 };
		const at = (fsPath: string) => folder(fsPath, 0, knownLocations);
		const summary = (changes: IRepositoryChanges<{ root: string }>) => ({ show: changes.show.map(r => r.root), warm: changes.warm.map(r => r.root), close: changes.close.map(r => r.root), open: changes.open.map(o => o.location) });

		const toWt1 = model.switchFolderLocations([{ from: at(primary), to: folder(wt1) }], [folder(wt1)], [primaryRepository]);
		const ready = model.setOpenedRepository(toWt1.open[0], wt1Repository);
		const opened = model.completeOpening(toWt1.open[0], [folder(wt1)], [primaryRepository, wt1Repository]);
		const back = model.switchFolderLocations([{ from: at(wt1), to: folder(primary) }], [folder(primary)], [primaryRepository, wt1Repository]);

		assert.deepStrictEqual({ toWt1: summary(toWt1), ready, opened: summary(opened), back: summary(back) }, {
			toWt1: { show: [], warm: [primary], close: [], open: [wt1] },
			ready: false,
			opened: { show: [wt1], warm: [], close: [], open: [] },
			back: { show: [primary], warm: [wt1], close: [], open: [] }
		});
	});

	test('switching back to a warm location while the warm cache is full shows it instead of evicting it', () => {
		const model = new WorkspaceFolderRepositories<{ root: string }>(3);
		const repositories = [primary, wt1, wt2, wt3].map(root => ({ root }));
		const at = (fsPath: string) => folder(fsPath, 0, knownLocations);
		let current = primary;
		for (const to of [wt1, wt2, wt3]) {
			const changes = model.switchFolderLocations([{ from: at(current), to: folder(to) }], [folder(to)], repositories.slice(0, [primary, wt1, wt2, wt3].indexOf(current) + 1));
			model.setOpenedRepository(changes.open[0], repositories.find(r => r.root === to)!);
			model.completeOpening(changes.open[0], [folder(to)], repositories);
			current = to;
		}

		const back = model.switchFolderLocations([{ from: at(wt3), to: folder(primary) }], [folder(primary)], repositories);

		assert.deepStrictEqual({ show: back.show.map(r => r.root), warm: back.warm.map(r => r.root), close: back.close.map(r => r.root), open: back.open.length }, {
			show: [primary], warm: [wt3], close: [], open: 0
		});
	});

	test('a full warm cache does not close a repository that other open repositories are shown under', () => {
		const model = new WorkspaceFolderRepositories<{ root: string; parentRoot?: string }>(3);
		const repositories = [{ root: primary }, ...[wt1, wt2, wt3, nested].map(root => ({ root, parentRoot: primary }))];
		const repository = (root: string) => repositories.find(r => r.root === root)!;
		const at = (fsPath: string) => folder(fsPath, 0, knownLocations);
		let changes!: IRepositoryChanges<{ root: string; parentRoot?: string }>;
		const open = [repository(primary)];
		let current = primary;
		for (const to of [wt1, wt2, wt3, nested]) {
			changes = model.switchFolderLocations([{ from: at(current), to: folder(to) }], [folder(to)], open);
			open.push(repository(to));
			model.setOpenedRepository(changes.open[0], repository(to));
			model.completeOpening(changes.open[0], [folder(to)], open);
			current = to;
		}

		assert.deepStrictEqual({ warm: changes.warm.map(r => r.root), close: changes.close.map(r => r.root) }, { warm: [wt3], close: [wt1] });
	});

	test('only the folders that show the repository of their current location only keep the repositories of their other locations warm', () => {
		const at = folder(wt1, 0, knownLocations);
		const repositories = [{ root: primary }, { root: wt1 }];
		const summary = (switchingFolders: WorkspaceFolder[]) => {
			const changes = new WorkspaceFolderRepositories<{ root: string }>().updateLeftLocations([at], repositories, switchingFolders);
			return { warm: changes.warm.map(r => r.root), open: changes.open.map(o => o.location) };
		};

		assert.deepStrictEqual([summary([]), summary([at])], [{ warm: [], open: [] }, { warm: [primary], open: [] }]);
	});

	test('once its locations are known, a folder at a nested worktree whose containing repository stays open opens its own', () => {
		const at = folder(nested, 0, knownLocations);
		const changes = new WorkspaceFolderRepositories<{ root: string }>().updateLeftLocations([at], [{ root: primary }], [at]);

		assert.deepStrictEqual({ open: changes.open.map(o => o.location), warm: changes.warm.map(r => r.root) }, { open: [nested], warm: [primary] });
	});

	test('a path inside a location that a switch opens is known to be opening, while the repository that contains it is open', () => {
		const model = new WorkspaceFolderRepositories<{ root: string }>();
		model.switchFolderLocations([{ from: folder(primary, 0, knownLocations), to: folder(nested) }], [folder(nested)], [{ root: primary }]);

		assert.deepStrictEqual([path.join(nested, 'foo.txt'), nested, path.join(primary, 'foo.txt')].map(p => model.isOpeningLocationOf(p)), [true, true, false]);
	});

	(isWindows || isMacintosh ? test : test.skip)('the repository of a folder whose path differs only in casing or a trailing separator is its current one', () => {
		const model = new WorkspaceFolderRepositories<{ root: string }>();
		const primaryRepository = { root: primary };
		const wt1Repository = { root: wt1 };
		const toWt1 = folder(wt1);
		const away = model.switchFolderLocations([{ from: folder(primary.toUpperCase(), 0, knownLocations), to: toWt1 }], [toWt1], [primaryRepository]);
		model.setOpenedRepository(away.open[0], wt1Repository);
		const opened = model.completeOpening(away.open[0], [folder(wt1.toUpperCase() + path.sep)], [primaryRepository, wt1Repository]);

		assert.deepStrictEqual({ warm: away.warm.map(r => r.root), shown: opened.show.map(r => r.root) }, { warm: [primary], shown: [wt1] });
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
			await ws.locationOpens.settled();
			return ws.getRepository(path.join(wt1, 'file.txt'))?.root;
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
		ws.updateLocations();

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
