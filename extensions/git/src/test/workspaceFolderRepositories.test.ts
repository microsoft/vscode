/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { EventEmitter, Uri, WorkspaceFolder } from 'vscode';
import { RepositoryState } from '../repository';
import { IFolderLocationModel, WorkspaceFolderRepositories } from '../workspaceFolderRepositories';
import { isDescendant, isMacintosh, isWindows, pathEquals } from '../util';

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

/**
 * The deepest of `roots` that `fsPath` is at or inside of.
 */
function deepest(roots: Iterable<string>, fsPath: string): string | undefined {
	return [...roots].filter(r => pathEquals(r, fsPath) || isDescendant(r, fsPath)).sort((a, b) => b.length - a.length)[0];
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
 * A repository at `root`, see `Repository`.
 */
class TestRepository {

	rootRealPath: string | undefined;

	private readonly _onDidChangeState = new EventEmitter<RepositoryState>();
	readonly onDidChangeState = this._onDidChangeState.event;

	/**
	 * @param parent The repository that this one is shown under, see `Repository.attach`.
	 */
	constructor(readonly root: string, readonly parent: TestRepository | undefined, private readonly onDidDispose: (repository: TestRepository) => void) { }

	/** The repository is gone, for example because its worktree was deleted. */
	disappear(): void {
		this._onDidChangeState.fire(RepositoryState.Disposed);
	}

	dispose(): void {
		this.onDidDispose(this);
	}
}

interface ITestWorkspaceOptions {
	/** Whether repositories open at once, instead of when `registerLocation` is called for their location. */
	readonly autoOpen?: boolean;
	/** The roots of the repositories on disk. */
	readonly roots?: string[];
	/** The locations that the folders know once their locations resolve. */
	readonly locations?: string[];
	/** The roots of the repositories that are open at first, by default the ones of the folders. */
	readonly attached?: string[];
}

/**
 * The workspace folders, and a git model that holds the attached repositories as `Model` does: switches go to
 * `WorkspaceFolderRepositories`, any other folder change closes the repository of the removed folder and opens the one
 * of the added folder, and an open of the location of a warm repository attaches it.
 */
class TestWorkspace implements IFolderLocationModel<TestRepository> {

	readonly workspaceFolderRepositories = new WorkspaceFolderRepositories<TestRepository>(this, () => this.folders, 3);

	/** The attached repositories by root. */
	private readonly attached = new Map<string, TestRepository>();

	/** The locations whose repository opens once `registerLocation` is called for it. */
	private readonly opens = new Map<string, Deferred>();

	/** The locations that the git model was asked to open. */
	readonly openRequests: string[] = [];

	/** The attaches and detaches that the git model was asked for, in order. */
	readonly calls: string[] = [];

	readonly disposed: string[] = [];
	readonly closedWhileCurrent: string[] = [];

	constructor(public folders: TestFolder[], private readonly options: ITestWorkspaceOptions = {}) {
		for (const root of options.attached ?? new Set(folders.map(f => deepest(this.roots, f.uri.fsPath)!))) {
			this.attached.set(root, this.createRepository(root));
		}
	}

	private get roots(): string[] { return this.options.roots ?? repositoriesOnDisk; }
	private get locations(): string[] { return this.options.locations ?? knownLocations; }

	getRepositories(): TestRepository[] {
		return [...this.attached.values()];
	}

	async openRepository(location: string): Promise<TestRepository | undefined> {
		this.openRequests.push(location);
		if (this.options.autoOpen === false) {
			const opened = this.opens.get(location) ?? new Deferred();
			this.opens.set(location, opened);
			await opened.promise;
		}
		return this.open(location);
	}

	attach(repository: TestRepository): void {
		this.calls.push(`attach ${repository.root}`);
		this.attached.set(repository.root, repository);
	}

	detach(repository: TestRepository): boolean {
		this.calls.push(`detach ${repository.root}`);
		return this.remove(repository);
	}

	/** Opens the repository at `root` under the attached repository at `parentRoot`. */
	openUnder(root: string, parentRoot: string): void {
		this.attached.set(root, this.createRepository(root, this.attached.get(parentRoot)));
	}

	/** The repository of `fsPath` opens. */
	registerLocation(fsPath: string): void {
		this.opens.get(fsPath)?.resolve();
		this.opens.delete(fsPath);
	}

	/** The attached repository that `fsPath` is at or inside of. */
	getRepository(fsPath: string): TestRepository | undefined {
		const root = deepest(this.attached.keys(), fsPath);
		return root ? this.attached.get(root) : undefined;
	}

	/** The folder at `index` moves to `fsPath`. */
	switchTo(fsPath: string, index = 0): void {
		const removed = this.folders[index];
		const added = folder(fsPath, index);
		this.folders = this.folders.map((f, i) => i === index ? added : f);
		const switches = this.workspaceFolderRepositories.getFolderLocationSwitches({ added: [added], removed: [removed] });
		if (switches) {
			this.workspaceFolderRepositories.switchFolderLocations(switches);
			return;
		}

		const opensAdded = !this.getRepository(added.uri.fsPath);
		const left = this.getRepository(removed.uri.fsPath);
		if (left && !this.folders.some(f => isDescendant(f.uri.fsPath, left.root))) {
			this.close(left);
		}
		if (opensAdded) {
			this.open(added.uri.fsPath);
		}
	}

	/** The locations of the workspace folders become known. */
	resolveLocations(): void {
		this.folders.forEach(f => f.locations ??= this.locations.map(l => ({ uri: Uri.file(l), name: path.basename(l) })));
		this.updateLocations();
	}

	/** The known locations of the workspace folders change. */
	updateLocations(switchingFolders: readonly WorkspaceFolder[] = this.folders): void {
		this.workspaceFolderRepositories.updateLeftLocations(switchingFolders);
	}

	/** The known locations whose repository a switch opens. */
	get opening(): string[] { return this.locations.filter(l => this.workspaceFolderRepositories.isOpeningLocationOf(l)); }
	get shown(): string[] { return [...this.attached.keys()].sort(); }
	get warm(): string[] { return this.workspaceFolderRepositories.warmRepositories.map(r => r.root).sort(); }
	get state() { return { shown: this.shown, warm: this.warm }; }

	/** Opens the repository of `fsPath` attached, or attaches the warm one. */
	private open(fsPath: string): TestRepository | undefined {
		const root = deepest(this.roots, fsPath);
		if (!root) {
			return undefined;
		}

		const repository = this.attached.get(root) ?? this.workspaceFolderRepositories.takeWarmRepositoryAt(root) ?? this.createRepository(root);
		this.attached.set(root, repository);
		return repository;
	}

	/**
	 * Removes an attached repository, and closes the repositories shown under it, as their parent's source control is
	 * disposed. Returns whether it was attached.
	 */
	private remove(repository: TestRepository): boolean {
		if (this.attached.get(repository.root) !== repository) {
			return false;
		}

		this.attached.delete(repository.root);
		this.getRepositories().filter(r => r.parent === repository).forEach(r => this.close(r));
		return true;
	}

	private close(repository: TestRepository): void {
		this.remove(repository);
		repository.dispose();
	}

	private createRepository(root: string, parent?: TestRepository): TestRepository {
		return new TestRepository(root, parent, repository => {
			this.disposed.push(repository.root);
			if (this.folders.some(f => deepest(this.roots, f.uri.fsPath) === repository.root)) {
				this.closedWhileCurrent.push(repository.root);
			}
		});
	}
}

suite('WorkspaceFolderRepositories', () => {

	test('a folder removed whose known locations include an added folder switched to it', () => {
		const model = new TestWorkspace([]).workspaceFolderRepositories;
		const known = folder(primary, 0, knownLocations);

		assert.deepStrictEqual([
			model.getFolderLocationSwitches({ added: [folder(wt1)], removed: [known] })?.map(s => s.to.uri.fsPath),
			model.getFolderLocationSwitches({ added: [folder(other)], removed: [known] }),
			model.getFolderLocationSwitches({ added: [folder(wt1)], removed: [folder(primary)] }),
			model.getFolderLocationSwitches({ added: [folder(primary)], removed: [known] }),
			model.getFolderLocationSwitches({ added: [folder(wt1), folder(other, 1)], removed: [known] }),
		], [[wt1], undefined, undefined, undefined, undefined]);
	});

	test('switching back to a warm location while the warm cache is full shows it instead of evicting it', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)]);
		for (const location of [wt1, wt2, wt3]) {
			ws.switchTo(location);
			await flush();
			ws.resolveLocations();
		}

		ws.switchTo(primary);

		assert.deepStrictEqual({ ...ws.state, disposed: ws.disposed, opening: ws.opening }, { shown: [primary], warm: [wt1, wt2, wt3], disposed: [], opening: [] });
	});

	test('only the folders that show the repository of their current location only keep the repositories of their other locations warm', async () => {
		const summary = async (switching: boolean) => {
			const ws = new TestWorkspace([folder(wt1, 0, knownLocations)], { attached: [primary, wt1] });
			ws.updateLocations(switching ? ws.folders : []);
			await flush();
			return { warm: ws.warm, openRequests: ws.openRequests };
		};

		assert.deepStrictEqual([await summary(false), await summary(true)], [{ warm: [], openRequests: [] }, { warm: [primary], openRequests: [] }]);
	});

	test('once its locations are known, a folder at a nested worktree whose containing repository stays open opens its own', async () => {
		const ws = new TestWorkspace([folder(nested, 0, knownLocations)], { autoOpen: false, attached: [primary] });

		try {
			ws.updateLocations();

			assert.deepStrictEqual({ openRequests: ws.openRequests, warm: ws.warm }, { openRequests: [nested], warm: [primary] });
		} finally {
			ws.registerLocation(nested);
			await flush();
		}
	});

	test('a path inside a location that a switch opens is known to be opening, while the repository that contains it is open', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)], { autoOpen: false });

		try {
			ws.switchTo(nested);

			assert.deepStrictEqual([path.join(nested, 'foo.txt'), nested, path.join(primary, 'foo.txt')].map(p => ws.workspaceFolderRepositories.isOpeningLocationOf(p)), [true, true, false]);
		} finally {
			ws.registerLocation(nested);
			await flush();
		}
	});

	(isWindows || isMacintosh ? test : test.skip)('the repository of a folder whose path differs only in casing or a trailing separator is its current one', async () => {
		const ws = new TestWorkspace([folder(primary.toUpperCase(), 0, knownLocations)], { autoOpen: false });
		ws.switchTo(wt1);
		const away = ws.warm;

		ws.folders = [folder(wt1.toUpperCase() + path.sep)];
		ws.registerLocation(wt1);
		await flush();

		assert.deepStrictEqual({ warm: away, shown: ws.shown }, { warm: [primary], shown: [wt1] });
	});

	test('a switch to a cold location keeps the location that is left warm at once and shows the new one once it is open', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)], { autoOpen: false });

		ws.switchTo(wt1);
		const whileOpening = { ...ws.state, opening: ws.opening };
		ws.registerLocation(wt1);
		await flush();

		assert.deepStrictEqual({ whileOpening, opened: { ...ws.state, opening: ws.opening } }, {
			whileOpening: { shown: [], warm: [primary], opening: [wt1] },
			opened: { shown: [wt1], warm: [primary], opening: [] }
		});
	});

	test('a switch back to a warm location shows it at once, before it keeps the location that is left warm', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)]);
		ws.switchTo(wt1);
		await flush();
		ws.resolveLocations();
		const callsBefore = ws.calls.length;

		ws.switchTo(primary);

		assert.deepStrictEqual({ ...ws.state, opening: ws.opening, calls: ws.calls.slice(callsBefore) }, {
			shown: [primary], warm: [wt1], opening: [], calls: [`attach ${primary}`, `detach ${wt1}`]
		});
	});

	test('a switch to a worktree nested in the location that is left opens the worktree', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)]);

		ws.switchTo(nested);
		await flush();

		assert.deepStrictEqual(ws.state, { shown: [nested], warm: [primary] });
	});

	test('keeps the three most recently left locations warm and closes the least recently left one', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)]);

		for (const location of [wt1, wt2, wt3, nested]) {
			ws.switchTo(location);
			await flush();
			ws.resolveLocations();
		}

		assert.deepStrictEqual({ ...ws.state, disposed: ws.disposed }, { shown: [nested], warm: [wt1, wt2, wt3], disposed: [primary] });
	});

	test('a warm repository is disposed once it is gone', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)]);
		const primaryRepository = ws.getRepository(primary)!;
		ws.switchTo(wt1);
		await flush();

		primaryRepository.disappear();

		assert.deepStrictEqual({ ...ws.state, disposed: ws.disposed }, { shown: [wt1], warm: [], disposed: [primary] });
	});

	test('an open takes the warm repository whose root or real path it asks for', async () => {
		const realPath = Uri.file('/real/primary').fsPath;
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)]);
		ws.getRepository(primary)!.rootRealPath = realPath;
		for (const location of [wt1, wt2]) {
			ws.switchTo(location);
			await flush();
			ws.resolveLocations();
		}

		const taken = [realPath, wt1, wt3].map(p => ws.workspaceFolderRepositories.takeWarmRepositoryAt(p)?.root);

		assert.deepStrictEqual({ taken, warm: ws.warm }, { taken: [primary, wt1, undefined], warm: [] });
	});

	test('a repository that is shown under one that is kept warm closes with it instead of being kept warm', () => {
		const ws = new TestWorkspace([folder(wt1, 0, knownLocations)], { attached: [wt1, primary] });
		ws.openUnder(nested, primary);

		ws.updateLocations();

		assert.deepStrictEqual({ ...ws.state, disposed: ws.disposed }, { shown: [wt1], warm: [primary], disposed: [nested] });
	});

	test('a repository that is the repository of another workspace folder is not hidden', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations), folder(path.join(primary, 'src'), 1)]);

		ws.switchTo(wt1);
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
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)], { autoOpen: false });

		ws.switchTo(wt1);
		const read = (async () => {
			await ws.workspaceFolderRepositories.whenLocationsOpened();
			return ws.getRepository(path.join(wt1, 'file.txt'))?.root;
		})();
		ws.registerLocation(wt1);

		assert.strictEqual(await read, wt1);
	});

	test('a switch before the locations were known keeps the location that is left warm once they are known', async () => {
		const ws = new TestWorkspace([folder(primary)]);

		ws.switchTo(nested);
		const beforeLocations = ws.state;
		ws.resolveLocations();
		await flush();

		assert.deepStrictEqual({ beforeLocations, afterLocations: ws.state }, {
			beforeLocations: { shown: [], warm: [] },
			afterLocations: { shown: [nested], warm: [] }
		});
	});

	test('a warm repository that is not a known location anymore is closed once the locations are known', async () => {
		const ws = new TestWorkspace([folder(primary, 0, knownLocations)]);
		ws.switchTo(wt1);
		await flush();
		ws.resolveLocations();

		ws.folders[0].locations = [{ uri: Uri.file(wt1), name: 'wt1' }, { uri: Uri.file(wt2), name: 'wt2' }];
		ws.updateLocations();

		assert.deepStrictEqual({ ...ws.state, disposed: ws.disposed }, { shown: [wt1], warm: [], disposed: [primary] });
	});


	// One test per first two switches keeps each well inside the test timeout on slower agents.
	type OrderEvent = { kind: 'begin' | 'register' | 'locations'; index: number };
	const ordersCache = new Map<string, OrderEvent[][]>();
	const orderTargets = [wt1, wt2, nested, primary];
	for (const a of orderTargets.filter(t => t !== primary)) {
		for (const b of orderTargets.filter(t => t !== a)) {
			test(`every order in which up to three switches of a folder, starting with ${path.basename(a)} then ${path.basename(b)}, begin, open and learn their locations shows the repository of the location the folder is at`, async () => {
				const sequences: string[][] = [[a, b], ...orderTargets.filter(t => t !== b).map(c => [a, b, c])];
				await checkEveryOrder(sequences);
			});
		}
	}

	async function checkEveryOrder(sequences: string[][]): Promise<void> {
		type Event = OrderEvent;

		// Each switch begins after the previous one and its locations are learnt after it begins, before the next switch
		// begins if at all, or at any time for the last one. A switch opens after it begins.
		const orders = (count: number, known: boolean[]): Event[][] => {
			const key = `${count}:${known.map(Number).join('')}`;
			const cached = ordersCache.get(key);
			if (cached) {
				return cached;
			}
			const all: Event[] = [];
			for (let index = 0; index < count; index++) {
				all.push({ kind: 'begin', index }, { kind: 'register', index });
				if (known[index]) {
					all.push({ kind: 'locations', index });
				}
			}
			const has = (done: Event[], kind: Event['kind'], index: number) => done.some(e => e.kind === kind && e.index === index);
			const canRun = (e: Event, done: Event[]) => {
				switch (e.kind) {
					case 'begin': return e.index === 0 || (has(done, 'begin', e.index - 1) && (!known[e.index - 1] || has(done, 'locations', e.index - 1)));
					case 'register': return has(done, 'begin', e.index);
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
			ordersCache.set(key, result);
			return result;
		};

		const violations: string[] = [];
		let runs = 0;
		for (const sequence of sequences) {
			for (let mask = 0; mask < 1 << sequence.length; mask++) {
				const known = sequence.map((_, i) => !!(mask & (1 << i)));
				for (const order of orders(sequence.length, known)) {
					runs++;
					const ws = new TestWorkspace([folder(primary, 0, knownLocations)], { autoOpen: false });
					const describe = () => `${sequence.map(l => path.basename(l)).join('>')} known=${known.map(Number).join('')} ${order.map(e => `${e.kind[0]}${e.index}`).join(' ')}`;
					let allSwitchesKnown = true;
					for (const event of order) {
						const location = sequence[event.index];
						switch (event.kind) {
							case 'begin': allSwitchesKnown &&= ws.folders[0].locations !== undefined; ws.switchTo(location); break;
							case 'register': ws.registerLocation(location); break;
							case 'locations': ws.resolveLocations(); break;
						}
						await flush();

						// Only the repository of the location the folder is at is shown
						const current = deepest(repositoriesOnDisk, ws.folders[0].uri.fsPath)!;
						const shown = ws.shown;
						if (allSwitchesKnown && shown.some(r => r !== current)) {
							violations.push(`${describe()}: after ${event.kind[0]}${event.index} shown=[${shown.map(r => path.basename(r))}]`);
						}
					}

					ws.resolveLocations();
					for (const location of [primary, ...sequence]) {
						ws.registerLocation(location);
					}
					await flush();

					const current = deepest(repositoriesOnDisk, ws.folders[0].uri.fsPath)!;
					if (ws.shown.length !== 1 || ws.shown[0] !== current || ws.opening.length !== 0) {
						violations.push(`${describe()}: settled shown=[${ws.shown.map(r => path.basename(r))}] warm=[${ws.warm.map(r => path.basename(r))}] opening=[${ws.opening.map(l => path.basename(l))}]`);
					}
					if (ws.closedWhileCurrent.length) {
						violations.push(`${describe()}: closed current [${ws.closedWhileCurrent.map(r => path.basename(r))}]`);
					}
				}
			}
		}

		assert.deepStrictEqual({ runs: runs > 1000, violations: violations.slice(0, 10), count: violations.length }, { runs: true, violations: [], count: 0 });
	}

	(isWindows ? suite : suite.skip)('Windows paths', () => {

		const locations = ['C:\\Repo\\Primary', 'C:\\Repo\\Primary\\.worktrees\\w1', '\\\\Server\\Share\\WT2'];
		const [windowsPrimary, windowsNested] = locations;

		test('a switch is recognised ignoring drive letter and path casing, separators and UNC share casing', () => {
			const model = new TestWorkspace([], { roots: locations, locations }).workspaceFolderRepositories;
			const from = folder('c:\\repo\\primary', 0, locations);

			assert.deepStrictEqual([
				model.getFolderLocationSwitches({ added: [folder('c:\\REPO\\primary\\.WORKTREES\\w1')], removed: [from] })?.length,
				model.getFolderLocationSwitches({ added: [folder('\\\\server\\share\\wt2\\')], removed: [from] })?.length,
				model.getFolderLocationSwitches({ added: [folder('C:\\Repo\\Other')], removed: [from] })?.length,
			], [1, 1, undefined]);
		});

		test('switching back shows the warm repository of the location whatever its path casing', async () => {
			const ws = new TestWorkspace([folder('c:\\repo\\primary', 0, locations)], { autoOpen: false, roots: locations, locations });

			ws.switchTo('c:\\repo\\PRIMARY\\.worktrees\\W1');
			const away = { ...ws.state, opening: ws.opening };
			ws.registerLocation(ws.folders[0].uri.fsPath);
			await flush();
			const opened = ws.state;
			ws.resolveLocations();
			ws.switchTo('C:\\REPO\\PRIMARY');

			assert.deepStrictEqual({ away, opened, back: ws.state }, {
				away: { shown: [], warm: [windowsPrimary], opening: [windowsNested] },
				opened: { shown: [windowsNested], warm: [windowsPrimary] },
				back: { shown: [windowsPrimary], warm: [windowsNested] }
			});
		});
	});
});
