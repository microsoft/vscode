/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { Uri, WorkspaceFolder } from 'vscode';
import { WorkspaceFolderRepositories } from '../workspaceFolderRepositories';
import { isDescendant } from '../util';

const primary = Uri.file('/repo/primary').fsPath;
const wt1 = Uri.file('/repo/wt1').fsPath;
const wt2 = Uri.file('/repo/wt2').fsPath;
const wt3 = Uri.file('/repo/wt3').fsPath;
const nested = path.join(primary, '.worktrees', 'w1');
const other = Uri.file('/other').fsPath;
const another = Uri.file('/another').fsPath;
const submodule = path.join(primary, 'submodule');
const knownLocations = [primary, wt1, wt2, wt3, nested];

type TestFolder = { -readonly [K in keyof WorkspaceFolder]: WorkspaceFolder[K] };

/**
 * A workspace folder at `fsPath` whose known locations are `locations`, the primary first, or not known yet.
 */
function folder(fsPath: string, index = 0, locations?: string[]): TestFolder {
	return {
		uri: Uri.file(fsPath),
		name: path.basename(fsPath),
		index,
		locations: locations?.map(l => ({ uri: Uri.file(l), name: path.basename(l) }))
	};
}

/**
 * The folder of a single-folder workspace at the location `fsPath`, with the locations of the
 * repository at `primary` if they are known yet.
 */
function folderAt(fsPath: string, resolved = true): TestFolder {
	return folder(fsPath, 0, resolved ? knownLocations : undefined);
}

/**
 * The open repositories of a workspace, where each repository is its root, opened, closed and kept warm as the git model does.
 */
class TestWorkspace {

	private readonly tracker = new WorkspaceFolderRepositories<string>(root => root);
	private readonly repositoriesOnDisk = [primary, wt1, wt2, wt3, nested, submodule, other, another];

	/** The shown repositories. */
	readonly repositories = new Set<string>();

	/** The warm repositories, hidden, the least recently left first. */
	readonly warm: string[] = [];

	/** The hidden repositories of the locations that folders switch to, until the switch completes. */
	private readonly opening = new Set<string>();

	/** The opened repositories awaiting their first status, see `Model.pendingSwitchRepositories`. */
	private readonly pending = new Set<string>();

	/** The locations whose repository is opening or awaiting its first status, see `Model.pendingSwitchLocations`. */
	private readonly pendingLocations: string[] = [];

	private visibleEditors: string[] = [];

	constructor(private folders: TestFolder[]) {
		folders.forEach(f => this.repositories.add(this.getRepositoryRoot(f.uri.fsPath)));
	}

	/** `Model.onDidChangeWorkspaceFolders`, where a repository that is opened is ready right away. */
	updateFolders(folders: TestFolder[]): void {
		this.beginUpdateFolders(folders)();
	}

	/**
	 * `Model.onDidChangeWorkspaceFolders` up to awaiting the first git status of the locations that open:
	 * returns the completion, see `Model.switchFolderLocation`.
	 */
	beginUpdateFolders(folders: TestFolder[]): () => void {
		const { register, complete } = this.beginOpeningFolders(folders);
		register();
		return complete;
	}

	/**
	 * `Model.onDidChangeWorkspaceFolders` up to opening the repositories of the locations that open: `register`
	 * opens them, after which they await their first git status, and `complete` completes the switch.
	 */
	beginOpeningFolders(folders: TestFolder[]): { register: () => void; complete: () => void } {
		const removed = this.folders.filter(f => !folders.includes(f));
		const added = folders.filter(f => !this.folders.includes(f));
		this.folders = folders;

		const { close, leave } = this.tracker.onDidChangeWorkspaceFolders({ added, removed }, folders, uri => this.getOpenRepository(uri.fsPath), r => this.hasVisibleEditor(r), r => this.repositories.has(r));
		close.forEach(r => this.close(r));

		const show = added.map(f => this.tracker.takeWarm(f.uri.fsPath)).filter((r): r is string => !!r);
		show.forEach(r => this.warm.splice(this.warm.indexOf(r), 1));
		const toOpen = this.tracker.getAddedFoldersToOpen(added, [...this.repositories, ...this.warm, ...this.opening, ...show]).map(f => f.uri.fsPath);
		const opened = toOpen.map(l => this.getRepositoryRoot(l));

		if (leave.length === 0 && show.length === 0) {
			opened.forEach(r => this.repositories.add(r));
			return { register: () => { }, complete: () => { } };
		}

		show.forEach(r => this.opening.add(r));
		this.pendingLocations.push(...toOpen);
		let registered = false;
		const register = () => {
			if (!registered) {
				registered = true;
				opened.forEach(r => {
					this.opening.add(r);
					this.pending.add(r);
				});
			}
		};
		const complete = () => {
			register();
			// A repository can have been closed meanwhile
			const candidates = [...new Set([...show, ...opened, ...leave])].filter(r => this.repositories.has(r) || this.warm.includes(r) || this.opening.has(r));
			[...show, ...opened].forEach(r => this.opening.delete(r));
			opened.forEach(r => this.pending.delete(r));
			toOpen.forEach(l => this.pendingLocations.splice(this.pendingLocations.indexOf(l), 1));
			this.completeSwitch(candidates);
		};
		return { register, complete };
	}

	/** `Model.switchFolderLocation`: the views change in one step, following the current folders. */
	private completeSwitch(candidates: string[]): void {
		const { show, warm } = this.tracker.completeSwitch(this.folders, candidates, [...this.repositories, ...this.warm, ...this.opening], [...this.pending], this.pendingLocations);
		for (const repository of show) {
			this.tracker.takeWarm(repository);
			if (this.warm.includes(repository)) {
				this.warm.splice(this.warm.indexOf(repository), 1);
			}
			this.repositories.add(repository);
		}
		warm.forEach(r => this.keepWarm(r));
	}

	setVisibleEditors(files: string[]): void {
		this.visibleEditors = files;
		this.tracker.onDidChangeVisibleEditors(this.folders, r => this.hasVisibleEditor(r)).forEach(r => this.close(r));
	}

	/** The locations of the folders become known, see `Model.onDidChangeWorkspaceFolderLocations`. */
	resolveLocations(locations = knownLocations): void {
		this.folders.forEach(f => f.locations = locations.map(l => ({ uri: Uri.file(l), name: path.basename(l) })));
		const { close, leave } = this.tracker.onDidChangeWorkspaceFolderLocations(this.folders);
		close.forEach(r => this.close(r));
		leave.forEach(r => this.keepWarm(r));
	}

	/**
	 * A switch as the workbench applies it: the folder is replaced by a folder whose locations are not known yet,
	 * then the editors of the new location are restored, then the locations of the new folder become known.
	 */
	switchTo(location: string): { beforeEditorsSwap: string[]; afterEditorsSwap: string[]; afterLocations: string[]; warm: string[] } {
		this.updateFolders([folderAt(location, false)]);
		const beforeEditorsSwap = [...this.repositories];
		this.setVisibleEditors([path.join(location, 'a.txt')]);
		const afterEditorsSwap = [...this.repositories];
		this.resolveLocations();
		return { beforeEditorsSwap, afterEditorsSwap, afterLocations: [...this.repositories], warm: [...this.warm] };
	}

	private keepWarm(repository: string): void {
		this.repositories.delete(repository);
		if (!this.warm.includes(repository)) {
			this.warm.push(repository);
		} else {
			this.warm.push(this.warm.splice(this.warm.indexOf(repository), 1)[0]);
		}
		this.tracker.keepWarm(repository).forEach(r => this.close(r));
	}

	private close(repository: string): void {
		this.repositories.delete(repository);
		this.opening.delete(repository);
		if (this.warm.includes(repository)) {
			this.warm.splice(this.warm.indexOf(repository), 1);
		}
		this.tracker.delete(repository);
	}

	private getRepositoryRoot(fsPath: string): string {
		return this.getDeepest(this.repositoriesOnDisk, fsPath)!;
	}

	private getOpenRepository(fsPath: string): string | undefined {
		return this.getDeepest([...this.repositories, ...this.warm, ...this.opening], fsPath);
	}

	private getDeepest(repositories: string[], fsPath: string): string | undefined {
		return repositories.filter(r => isDescendant(r, fsPath)).sort((a, b) => b.length - a.length)[0];
	}

	private hasVisibleEditor(repository: string): boolean {
		return this.visibleEditors.some(e => this.getOpenRepository(e) === repository);
	}
}

suite('WorkspaceFolderRepositories', () => {

	test('closes the repository of a removed folder once its last visible editor is gone', () => {
		const otherFolder = folder(other, 1);
		const ws = new TestWorkspace([folder(primary), otherFolder]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);

		ws.updateFolders([otherFolder]);
		const whileVisible = [...ws.repositories];
		ws.setVisibleEditors([]);

		assert.deepStrictEqual({ whileVisible, after: [...ws.repositories] }, { whileVisible: [primary, other], after: [other] });
	});

	test('closes the repository of a removed folder without visible editors right away', () => {
		const otherFolder = folder(other, 1);
		const ws = new TestWorkspace([folder(primary), otherFolder]);

		ws.updateFolders([otherFolder]);

		assert.deepStrictEqual([...ws.repositories], [other]);
	});

	test('keeps a retained repository whose folder is added back', () => {
		const otherFolder = folder(other, 0);
		const ws = new TestWorkspace([folder(primary), otherFolder]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);
		ws.updateFolders([otherFolder]);

		ws.updateFolders([otherFolder, folder(primary, 1)]);
		ws.setVisibleEditors([]);

		assert.deepStrictEqual([...ws.repositories], [primary, other]);
	});

	test('retains the repository of a removed folder that is replaced by an unrelated folder', () => {
		const ws = new TestWorkspace([folder(primary)]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);

		ws.updateFolders([folder(other)]);

		assert.deepStrictEqual([...ws.repositories], [primary, other]);
	});

	test('a folder replaced by its worktrees in turn with editors open leaves one repository', () => {
		const ws = new TestWorkspace([folder(primary)]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);
		const replaceWith = (fsPath: string) => {
			ws.updateFolders([folder(fsPath)]);
			const beforeEditorsSwap = [...ws.repositories];
			ws.setVisibleEditors([path.join(fsPath, 'a.txt')]);
			return { beforeEditorsSwap, after: [...ws.repositories] };
		};

		const steps = [replaceWith(wt1), replaceWith(wt2), replaceWith(wt1)];

		assert.deepStrictEqual(steps, [
			{ beforeEditorsSwap: [primary, wt1], after: [wt1] },
			{ beforeEditorsSwap: [wt1, wt2], after: [wt2] },
			{ beforeEditorsSwap: [wt2, wt1], after: [wt1] },
		]);
	});

	test('a folder switching locations shows one repository and keeps the locations it left warm', () => {
		const ws = new TestWorkspace([folderAt(primary)]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);

		const steps = [ws.switchTo(wt1), ws.switchTo(wt2), ws.switchTo(wt1)];

		assert.deepStrictEqual(steps, [
			{ beforeEditorsSwap: [wt1], afterEditorsSwap: [wt1], afterLocations: [wt1], warm: [primary] },
			{ beforeEditorsSwap: [wt2], afterEditorsSwap: [wt2], afterLocations: [wt2], warm: [primary, wt1] },
			{ beforeEditorsSwap: [wt1], afterEditorsSwap: [wt1], afterLocations: [wt1], warm: [primary, wt2] },
		]);
	});

	test('keeps the three most recently left locations warm and closes the least recently left one', () => {
		const ws = new TestWorkspace([folderAt(primary)]);

		[wt1, wt2, wt3].forEach(location => ws.switchTo(location));

		assert.deepStrictEqual(ws.switchTo(nested), { beforeEditorsSwap: [nested], afterEditorsSwap: [nested], afterLocations: [nested], warm: [wt1, wt2, wt3] });
	});

	test('a switch that completes after the folder switched back keeps the location it is at shown', () => {
		const ws = new TestWorkspace([folderAt(primary)]);

		const completeFirst = ws.beginUpdateFolders([folderAt(wt1, false)]);
		ws.resolveLocations();
		ws.updateFolders([folderAt(primary, false)]);
		const beforeFirstCompletes = { shown: [...ws.repositories], warm: [...ws.warm] };
		completeFirst();

		assert.deepStrictEqual({ beforeFirstCompletes, after: { shown: [...ws.repositories], warm: ws.warm } }, {
			beforeFirstCompletes: { shown: [primary], warm: [wt1] },
			after: { shown: [primary], warm: [wt1] }
		});
	});

	test('a switch that completes after the folder was replaced before its locations were known keeps the location it is at shown', () => {
		const ws = new TestWorkspace([folderAt(primary)]);

		const completeFirst = ws.beginUpdateFolders([folderAt(wt1, false)]);
		ws.updateFolders([folder(primary)]);
		completeFirst();

		assert.deepStrictEqual({ shown: [...ws.repositories], warm: ws.warm }, { shown: [primary], warm: [] });
	});

	test('a switch that completes while the folder switched on again is opening keeps the left location shown until the location the folder is at now is ready', () => {
		const scenario = (target: string, targetOpens: 'beforeFirstCompletes' | 'afterFirstCompletes', completesFirst: 'first' | 'target') => {
			const state = (ws: TestWorkspace) => ({ shown: [...ws.repositories], warm: [...ws.warm].sort() });
			const ws = new TestWorkspace([folderAt(primary)]);
			const completeFirst = ws.beginUpdateFolders([folderAt(wt1, false)]);
			ws.resolveLocations();
			const second = ws.beginOpeningFolders([folderAt(target, false)]);
			if (targetOpens === 'beforeFirstCompletes') {
				second.register();
			}
			const [completeEarlier, completeLater] = completesFirst === 'first' ? [completeFirst, second.complete] : [second.complete, completeFirst];
			completeEarlier();
			const meanwhile = state(ws);
			second.register();
			const beforeLaterCompletes = state(ws);
			completeLater();
			ws.resolveLocations();
			return { target, targetOpens, completesFirst, meanwhile, beforeLaterCompletes, settled: state(ws) };
		};
		const leftShown = { shown: [primary], warm: [wt1] };
		const atTarget = (target: string) => ({ shown: [target], warm: [primary, wt1].sort() });

		assert.deepStrictEqual([
			scenario(wt2, 'beforeFirstCompletes', 'first'),
			scenario(wt2, 'afterFirstCompletes', 'first'),
			scenario(wt2, 'beforeFirstCompletes', 'target'),
			scenario(nested, 'beforeFirstCompletes', 'first'),
			scenario(nested, 'afterFirstCompletes', 'first'),
			scenario(nested, 'beforeFirstCompletes', 'target'),
		], [
			{ target: wt2, targetOpens: 'beforeFirstCompletes', completesFirst: 'first', meanwhile: leftShown, beforeLaterCompletes: leftShown, settled: atTarget(wt2) },
			{ target: wt2, targetOpens: 'afterFirstCompletes', completesFirst: 'first', meanwhile: leftShown, beforeLaterCompletes: leftShown, settled: atTarget(wt2) },
			{ target: wt2, targetOpens: 'beforeFirstCompletes', completesFirst: 'target', meanwhile: atTarget(wt2), beforeLaterCompletes: atTarget(wt2), settled: atTarget(wt2) },
			{ target: nested, targetOpens: 'beforeFirstCompletes', completesFirst: 'first', meanwhile: leftShown, beforeLaterCompletes: leftShown, settled: atTarget(nested) },
			{ target: nested, targetOpens: 'afterFirstCompletes', completesFirst: 'first', meanwhile: leftShown, beforeLaterCompletes: leftShown, settled: atTarget(nested) },
			{ target: nested, targetOpens: 'beforeFirstCompletes', completesFirst: 'target', meanwhile: atTarget(nested), beforeLaterCompletes: atTarget(nested), settled: atTarget(nested) },
		]);
	});

	test('a switch completes for its folder while another folder changes', () => {
		const otherFolder = folder(other, 1);
		const ws = new TestWorkspace([folderAt(primary), otherFolder]);
		const wt1Folder = folderAt(wt1, false);

		const completeFirst = ws.beginUpdateFolders([wt1Folder, otherFolder]);
		ws.updateFolders([wt1Folder, folder(another, 1)]);
		completeFirst();

		assert.deepStrictEqual({ shown: [...ws.repositories].sort(), warm: ws.warm }, { shown: [another, wt1].sort(), warm: [primary] });
	});

	test('closes a warm repository once it is not a known location anymore', () => {
		const ws = new TestWorkspace([folderAt(primary)]);
		ws.switchTo(wt1);

		ws.resolveLocations([primary, wt1]);
		const whileKnown = [...ws.warm];
		ws.resolveLocations([wt1, wt2]);

		assert.deepStrictEqual({ whileKnown, after: ws.warm, shown: [...ws.repositories] }, { whileKnown: [primary], after: [], shown: [wt1] });
	});

	test('a folder switching locations before its locations are known closes the location that is left once its editors are replaced', () => {
		const ws = new TestWorkspace([folderAt(primary, false)]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);

		assert.deepStrictEqual(ws.switchTo(wt1), { beforeEditorsSwap: [primary, wt1], afterEditorsSwap: [wt1], afterLocations: [wt1], warm: [] });
	});

	test('a folder switching to a worktree nested in its primary location opens the worktree', () => {
		const ws = new TestWorkspace([folderAt(primary)]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);

		assert.deepStrictEqual(ws.switchTo(nested), { beforeEditorsSwap: [nested], afterEditorsSwap: [nested], afterLocations: [nested], warm: [primary] });
	});

	test('a folder switching from a nested worktree back to its primary location keeps the worktree warm', () => {
		const ws = new TestWorkspace([folderAt(nested)]);
		ws.setVisibleEditors([path.join(nested, 'a.txt')]);

		assert.deepStrictEqual(ws.switchTo(primary), { beforeEditorsSwap: [primary], afterEditorsSwap: [primary], afterLocations: [primary], warm: [nested] });
	});

	test('a folder switching from a nested worktree back to its primary location before its locations are known keeps the worktree warm once they are', () => {
		const ws = new TestWorkspace([folderAt(nested, false)]);
		ws.setVisibleEditors([path.join(nested, 'a.txt')]);

		assert.deepStrictEqual(ws.switchTo(primary), { beforeEditorsSwap: [nested, primary], afterEditorsSwap: [nested, primary], afterLocations: [primary], warm: [nested] });
	});

	test('keeps the repository of a removed folder inside a remaining folder that is not one of its locations', () => {
		const primaryFolder = folder(primary);
		const ws = new TestWorkspace([primaryFolder, folder(submodule, 1)]);

		ws.updateFolders([primaryFolder]);
		ws.resolveLocations();

		assert.deepStrictEqual({ shown: [...ws.repositories], warm: ws.warm }, { shown: [primary, submodule], warm: [] });
	});

	test('a folder replaced by a repository nested in it with editors open ends with the nested repository', () => {
		const ws = new TestWorkspace([folder(primary)]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);

		ws.updateFolders([folder(nested)]);
		const whileVisible = [...ws.repositories];
		ws.setVisibleEditors([path.join(nested, 'a.txt')]);

		assert.deepStrictEqual({ whileVisible, after: [...ws.repositories] }, { whileVisible: [primary, nested], after: [nested] });
	});
});

suite('WorkspaceFolderRepositories.getAddedFoldersToOpen', () => {

	test('opens the added folders that are not the root of an open repository', () => {
		const folders = [folder(primary), folder(nested, 1), folder(path.join(primary, 'src'), 2)];

		assert.deepStrictEqual(new WorkspaceFolderRepositories<string>(root => root).getAddedFoldersToOpen(folders, [primary]).map(f => f.uri.fsPath), [nested, path.join(primary, 'src')]);
	});
});

/**
 * Whether the repository of the removed folder `removed`, which a visible editor belongs to, is left
 * right away, to keep warm, when `added` are added.
 */
function leavesRightAway(removed: TestFolder, added: TestFolder[]): boolean {
	const tracker = new WorkspaceFolderRepositories<string>(root => root);
	return tracker.onDidChangeWorkspaceFolders({ added, removed: [removed] }, added, () => removed.uri.fsPath, () => true).leave.length === 1;
}

suite('WorkspaceFolderRepositories locations', () => {

	test('leaves the repository of a removed folder right away only when the added folder is one of its known locations', () => {
		assert.deepStrictEqual([
			leavesRightAway(folderAt(primary), [folderAt(wt1, false)]),
			leavesRightAway(folderAt(wt1), [folderAt(wt2, false)]),
			leavesRightAway(folderAt(wt2), [folderAt(primary, false)]),
			leavesRightAway(folderAt(primary), [folderAt(nested, false)]),
			leavesRightAway(folderAt(primary), [folder(other)]),
			leavesRightAway(folderAt(primary, false), [folderAt(wt1, false)]),
			leavesRightAway(folderAt(primary), []),
		], [true, true, true, true, false, false, false]);
	});

	test('once the locations are known, leaves a kept repository that is another location, and keeps the current location and others', () => {
		const tracker = new WorkspaceFolderRepositories<string>(root => root);
		const removed = [folder(nested, 1), folder(submodule, 2), folder(path.join(primary, 'src'), 3)];
		const roots = [nested, submodule, primary];

		const onRemove = tracker.onDidChangeWorkspaceFolders({ added: [], removed }, [folder(primary)], uri => roots[removed.findIndex(f => f.uri.toString() === uri.toString())], () => false);
		const onLocations = tracker.onDidChangeWorkspaceFolderLocations([folder(primary, 0, [primary, wt1, nested])]);

		assert.deepStrictEqual({ onRemove, onLocations }, { onRemove: { close: [], leave: [] }, onLocations: { close: [], leave: [nested] } });
	});

	test('a switch completes with the candidates that are the deepest ready repository containing a workspace folder', () => {
		const complete = (folders: TestFolder[], candidates: string[], open: string[], pending: string[] = [], pendingLocations: string[] = [], tracker = new WorkspaceFolderRepositories<string>(root => root)) => tracker.completeSwitch(folders, candidates, open, pending, pendingLocations);
		const warmTracker = new WorkspaceFolderRepositories<string>(root => root);
		warmTracker.keepWarm(nested);

		assert.deepStrictEqual([
			complete([folder(nested)], [primary, nested, wt1], [primary, nested, wt1]),
			complete([folder(primary)], [nested, wt1], [nested, wt1]),
			complete([folder(wt1), folder(path.join(primary, 'src'), 1)], [primary, wt1, wt2], [primary, wt1, wt2]),
			complete([folder(nested)], [primary, wt1], [primary, wt1, nested]),
			complete([folder(nested)], [primary, wt1], [primary, wt1, nested], [], [], warmTracker),
			complete([folder(nested)], [primary, wt1], [primary, wt1, nested], [nested]),
			complete([folder(nested)], [primary, wt1], [primary, wt1], [], [nested]),
		], [
			{ show: [nested], warm: [primary, wt1] },
			{ show: [], warm: [nested, wt1] },
			{ show: [wt1, primary], warm: [wt2] },
			{ show: [], warm: [primary, wt1] },
			{ show: [primary], warm: [wt1] },
			{ show: [primary], warm: [wt1] },
			{ show: [primary], warm: [wt1] },
		]);
	});

	test('the shown repository of a location that a folder left stays shown until the location the folder is at now is ready, also after further switches', () => {
		const tracker = new WorkspaceFolderRepositories<string>(root => root);
		const switchFolder = (from: string, to: string) => tracker.onDidChangeWorkspaceFolders({ added: [folder(to)], removed: [folder(from, 0, [primary, to])] }, [folder(to)], uri => uri.fsPath === primary ? primary : undefined, () => false, r => r === primary);

		switchFolder(primary, wt1);
		switchFolder(wt1, wt2);
		assert.deepStrictEqual([
			tracker.completeSwitch([folder(wt2)], [wt1], [primary, wt1], [], [wt2]),
			tracker.completeSwitch([folder(wt2)], [wt2], [primary, wt1, wt2], [], []),
			tracker.completeSwitch([folder(wt2)], [wt2], [primary, wt1, wt2], [], []),
		], [
			{ show: [primary], warm: [wt1] },
			{ show: [wt2], warm: [primary] },
			{ show: [wt2], warm: [] },
		]);
	});

	test('takes a warm repository by its root, keeps at most the capacity and closes the least recently left one first', () => {
		const tracker = new WorkspaceFolderRepositories<string>(root => root, 2);

		const evicted = [wt1, wt2, wt3].map(r => tracker.keepWarm(r));
		const taken = [tracker.takeWarm(Uri.file('/repo/wt3/').fsPath), tracker.takeWarm(wt3), tracker.takeWarm(wt1)];

		assert.deepStrictEqual({ evicted, taken }, { evicted: [[], [], [wt1]], taken: [wt3, undefined, undefined] });
	});
});
