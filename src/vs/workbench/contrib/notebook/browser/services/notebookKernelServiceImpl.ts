/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { INotebookKernelSourceAction, INotebookTextModel } from '../../common/notebookCommon.js';
import { INotebookKernel, ISelectedNotebooksChangeEvent, INotebookKernelMatchResult, INotebookKernelService, INotebookTextModelLike, ISourceAction, INotebookSourceActionChangeEvent, INotebookKernelDetectionTask, IKernelSourceActionProvider } from '../../common/notebookKernelService.js';
import { LRUCache, ResourceMap } from '../../../../../base/common/map.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { URI } from '../../../../../base/common/uri.js';
import { INotebookService } from '../../common/notebookService.js';
import { IMenu, IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IAction } from '../../../../../base/common/actions.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { Schemas } from '../../../../../base/common/network.js';
import { getActiveWindow, runWhenWindowIdle } from '../../../../../base/browser/dom.js';

class KernelInfo {

	private static _logicClock = 0;

	readonly kernel: INotebookKernel;
	public score: number;
	readonly time: number;

	readonly notebookPriorities = new ResourceMap<number>();

	constructor(kernel: INotebookKernel) {
		this.kernel = kernel;
		this.score = -1;
		this.time = KernelInfo._logicClock++;
	}
}

class NotebookTextModelLikeId {
	static str(k: INotebookTextModelLike): string {
		return `${k.notebookType}/${k.uri.toString()}`;
	}
	static obj(s: string): INotebookTextModelLike {
		const idx = s.indexOf('/');
		return {
			notebookType: s.substring(0, idx),
			uri: URI.parse(s.substring(idx + 1))
		};
	}
}

class SourceAction extends Disposable implements ISourceAction {
	execution: Promise<void> | undefined;
	private readonly _onDidChangeState = this._register(new Emitter<void>());
	readonly onDidChangeState = this._onDidChangeState.event;

	constructor(
		readonly action: IAction,
		readonly model: INotebookTextModelLike,
		readonly isPrimary: boolean
	) {
		super();
	}

	async runAction() {
		if (this.execution) {
			return this.execution;
		}

		this.execution = this._runAction();
		this._onDidChangeState.fire();
		await this.execution;
		this.execution = undefined;
		this._onDidChangeState.fire();
	}

	private async _runAction(): Promise<void> {
		try {
			await this.action.run({
				uri: this.model.uri,
				$mid: MarshalledId.NotebookActionContext
			});

		} catch (error) {
			console.warn(`Kernel source command failed: ${error}`);
		}
	}
}

interface IKernelInfoCache {
	menu: IMenu;
	actions: [ISourceAction, IDisposable][];

}

export class NotebookKernelService extends Disposable implements INotebookKernelService {

	declare _serviceBrand: undefined;

	private readonly _kernels = new Map<string, KernelInfo>();

	private readonly _notebookBindings = new LRUCache<string, string>(1000, 0.7);

	private readonly _onDidChangeNotebookKernelBinding = this._register(new Emitter<ISelectedNotebooksChangeEvent>());
	private readonly _onDidAddKernel = this._register(new Emitter<INotebookKernel>());
	private readonly _onDidRemoveKernel = this._register(new Emitter<INotebookKernel>());
	private readonly _onDidChangeNotebookAffinity = this._register(new Emitter<void>());
	private readonly _onDidChangeSourceActions = this._register(new Emitter<INotebookSourceActionChangeEvent>());
	private readonly _onDidNotebookVariablesChange = this._register(new Emitter<URI>());
	private readonly _kernelSources = new Map<string, IKernelInfoCache>();
	private readonly _kernelSourceActionsUpdates = new Map<string, IDisposable>();
	private readonly _kernelDetectionTasks = new Map<string, INotebookKernelDetectionTask[]>();
	private readonly _onDidChangeKernelDetectionTasks = this._register(new Emitter<string>());
	private readonly _kernelSourceActionProviders = new Map<string, IKernelSourceActionProvider[]>();

	readonly onDidChangeSelectedNotebooks: Event<ISelectedNotebooksChangeEvent> = this._onDidChangeNotebookKernelBinding.event;
	readonly onDidAddKernel: Event<INotebookKernel> = this._onDidAddKernel.event;
	readonly onDidRemoveKernel: Event<INotebookKernel> = this._onDidRemoveKernel.event;
	readonly onDidChangeNotebookAffinity: Event<void> = this._onDidChangeNotebookAffinity.event;
	readonly onDidChangeSourceActions: Event<INotebookSourceActionChangeEvent> = this._onDidChangeSourceActions.event;
	readonly onDidChangeKernelDetectionTasks: Event<string> = this._onDidChangeKernelDetectionTasks.event;
	readonly onDidNotebookVariablesUpdate: Event<URI> = this._onDidNotebookVariablesChange.event;

	private static _storageNotebookBinding = 'notebook.controller2NotebookBindings';


	constructor(
		@INotebookService private readonly _notebookService: INotebookService,
		@IStorageService private readonly _storageService: IStorageService,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();

		// auto associate kernels to new notebook documents, also emit event when
		// a notebook has been closed (but don't update the memento)
		this._register(_notebookService.onDidAddNotebookDocument(this._tryAutoBindNotebook, this));
		this._register(_notebookService.onWillRemoveNotebookDocument(notebook => {
			const id = NotebookTextModelLikeId.str(notebook);
			const kernelId = this._notebookBindings.get(id);
			if (kernelId && notebook.uri.scheme === Schemas.untitled) {
				this.selectKernelForNotebook(undefined, notebook);
			}
			this._kernelSourceActionsUpdates.get(id)?.dispose();
			this._kernelSourceActionsUpdates.delete(id);
		}));

		// restore from storage
		try {
			const data = JSON.parse(this._storageService.get(NotebookKernelService._storageNotebookBinding, StorageScope.WORKSPACE, '[]'));
			this._notebookBindings.fromJSON(data);
		} catch {
			// ignore
		}
	}

	override dispose() {
		this._kernels.clear();
		this._kernelSources.forEach(v => {
			v.menu.dispose();
			v.actions.forEach(a => a[1].dispose());
		});
		this._kernelSourceActionsUpdates.forEach(v => {
			v.dispose();
		});
		this._kernelSourceActionsUpdates.clear();
		super.dispose();
	}

	private _persistSoonHandle?: IDisposable;

	private _persistMementos(): void {
		this._persistSoonHandle?.dispose();
		this._persistSoonHandle = runWhenWindowIdle(getActiveWindow(), () => {
			this._storageService.store(NotebookKernelService._storageNotebookBinding, JSON.stringify(this._notebookBindings), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}, 100);
	}

	private static _score(kernel: INotebookKernel, notebook: INotebookTextModelLike): number {
		if (kernel.viewType === '*') {
			return 5;
		} else if (kernel.viewType === notebook.notebookType) {
			return 10;
		} else {
			return 0;
		}
	}

	private _tryAutoBindNotebook(notebook: INotebookTextModel, onlyThisKernel?: INotebookKernel): void {

		const id = this._notebookBindings.get(NotebookTextModelLikeId.str(notebook));
		if (!id) {
			// no kernel associated
			return;
		}
		const existingKernel = this._kernels.get(id);
		if (!existingKernel || !NotebookKernelService._score(existingKernel.kernel, notebook)) {
			// associated kernel not known, not matching
			return;
		}
		if (!onlyThisKernel || existingKernel.kernel === onlyThisKernel) {
			this._onDidChangeNotebookKernelBinding.fire({ notebook: notebook.uri, oldKernel: undefined, newKernel: existingKernel.kernel.id });
		}
	}

	notifyVariablesChange(notebookUri: URI): void {
		this._onDidNotebookVariablesChange.fire(notebookUri);
	}

	registerKernel(kernel: INotebookKernel): IDisposable {
		if (this._kernels.has(kernel.id)) {
			throw new Error(`NOTEBOOK CONTROLLER with id '${kernel.id}' already exists`);
		}

		this._kernels.set(kernel.id, new KernelInfo(kernel));
		this._onDidAddKernel.fire(kernel);

		// auto associate the new kernel to existing notebooks it was
		// associated to in the past.
		for (const notebook of this._notebookService.getNotebookTextModels()) {
			this._tryAutoBindNotebook(notebook, kernel);
		}

		return toDisposable(() => {
			if (this._kernels.delete(kernel.id)) {
				this._onDidRemoveKernel.fire(kernel);
			}
			for (const [key, candidate] of Array.from(this._notebookBindings)) {
				if (candidate === kernel.id) {
					this._onDidChangeNotebookKernelBinding.fire({ notebook: NotebookTextModelLikeId.obj(key).uri, oldKernel: kernel.id, newKernel: undefined });
				}
			}
		});
	}

	getMatchingKernel(notebook: INotebookTextModelLike): INotebookKernelMatchResult {

		// all applicable kernels
		const kernels: { kernel: INotebookKernel; instanceAffinity: number; score: number }[] = [];
		for (const info of this._kernels.values()) {
			const score = NotebookKernelService._score(info.kernel, notebook);
			if (score) {
				kernels.push({
					score,
					kernel: info.kernel,
					instanceAffinity: info.notebookPriorities.get(notebook.uri) ?? 1 /* vscode.NotebookControllerPriority.Default */,
				});
			}
		}

		kernels
			.sort((a, b) => b.instanceAffinity - a.instanceAffinity || a.score - b.score || a.kernel.label.localeCompare(b.kernel.label));
		const all = kernels.map(obj => obj.kernel);

		// bound kernel
		const selectedId = this._notebookBindings.get(NotebookTextModelLikeId.str(notebook));
		const selected = selectedId ? this._kernels.get(selectedId)?.kernel : undefined;
		const suggestions = kernels.filter(item => item.instanceAffinity > 1).map(item => item.kernel);
		const hidden = kernels.filter(item => item.instanceAffinity < 0).map(item => item.kernel);
		return { all, selected, suggestions, hidden };
	}

	getSelectedOrSuggestedKernel(notebook: INotebookTextModel): INotebookKernel | undefined {
		const info = this.getMatchingKernel(notebook);
		if (info.selected) {
			return info.selected;
		}

		const preferred = info.all.filter(kernel => this._kernels.get(kernel.id)?.notebookPriorities.get(notebook.uri) === 2 /* vscode.NotebookControllerPriority.Preferred */);
		if (preferred.length === 1) {
			return preferred[0];
		}

		return info.all.length === 1 ? info.all[0] : undefined;
	}

	// a notebook has one kernel, a kernel has N notebooks
	// notebook <-1----N-> kernel
	selectKernelForNotebook(kernel: INotebookKernel | undefined, notebook: INotebookTextModelLike): void {
		const key = NotebookTextModelLikeId.str(notebook);
		const oldKernel = this._notebookBindings.get(key);
		if (oldKernel !== kernel?.id) {
			if (kernel) {
				this._notebookBindings.set(key, kernel.id);
			} else {
				this._notebookBindings.delete(key);
			}
			this._onDidChangeNotebookKernelBinding.fire({ notebook: notebook.uri, oldKernel, newKernel: kernel?.id });
			this._persistMementos();
		}
	}

	preselectKernelForNotebook(kernel: INotebookKernel, notebook: INotebookTextModelLike): void {
		const key = NotebookTextModelLikeId.str(notebook);
		const oldKernel = this._notebookBindings.get(key);
		if (oldKernel !== kernel?.id) {
			this._notebookBindings.set(key, kernel.id);
			this._persistMementos();
		}
	}

	updateKernelNotebookAffinity(kernel: INotebookKernel, notebook: URI, preference: number | undefined): void {
		const info = this._kernels.get(kernel.id);
		if (!info) {
			throw new Error(`UNKNOWN kernel '${kernel.id}'`);
		}
		if (preference === undefined) {
			info.notebookPriorities.delete(notebook);
		} else {
			info.notebookPriorities.set(notebook, preference);
		}
		this._onDidChangeNotebookAffinity.fire();
	}

	getRunningSourceActions(notebook: INotebookTextModelLike) {
		const id = NotebookTextModelLikeId.str(notebook);
		const existingInfo = this._kernelSources.get(id);
		if (existingInfo) {
			return existingInfo.actions.filter(action => action[0].execution).map(action => action[0]);
		}

		return [];
	}

	getSourceActions(notebook: INotebookTextModelLike, contextKeyService: IContextKeyService | undefined): ISourceAction[] {
		contextKeyService = contextKeyService ?? this._contextKeyService;
		const id = NotebookTextModelLikeId.str(notebook);
		const existingInfo = this._kernelSources.get(id);

		if (existingInfo) {
			return existingInfo.actions.map(a => a[0]);
		}

		const sourceMenu = this._register(this._menuService.createMenu(MenuId.NotebookKernelSource, contextKeyService));
		const info: IKernelInfoCache = { menu: sourceMenu, actions: [] };

		const loadActionsFromMenu = (menu: IMenu, document: INotebookTextModelLike) => {
			const groups = menu.getActions({ shouldForwardArgs: true });
			const sourceActions: [ISourceAction, IDisposable][] = [];
			groups.forEach(group => {
				const isPrimary = /^primary/.test(group[0]);
				group[1].forEach(action => {
					const sourceAction = new SourceAction(action, document, isPrimary);
					const stateChangeListener = sourceAction.onDidChangeState(() => {
						this._onDidChangeSourceActions.fire({
							notebook: document.uri,
							viewType: document.notebookType,
						});
					});
					sourceActions.push([sourceAction, stateChangeListener]);
				});
			});
			info.actions = sourceActions;
			this._kernelSources.set(id, info);
			this._onDidChangeSourceActions.fire({ notebook: document.uri, viewType: document.notebookType });
		};

		this._kernelSourceActionsUpdates.get(id)?.dispose();
		this._kernelSourceActionsUpdates.set(id, sourceMenu.onDidChange(() => {
			loadActionsFromMenu(sourceMenu, notebook);
		}));

		loadActionsFromMenu(sourceMenu, notebook);

		return info.actions.map(a => a[0]);
	}

	registerNotebookKernelDetectionTask(task: INotebookKernelDetectionTask): IDisposable {
		const notebookType = task.notebookType;
		const all = this._kernelDetectionTasks.get(notebookType) ?? [];
		all.push(task);
		this._kernelDetectionTasks.set(notebookType, all);
		this._onDidChangeKernelDetectionTasks.fire(notebookType);
		return toDisposable(() => {
			const all = this._kernelDetectionTasks.get(notebookType) ?? [];
			const idx = all.indexOf(task);
			if (idx >= 0) {
				all.splice(idx, 1);
				this._kernelDetectionTasks.set(notebookType, all);
				this._onDidChangeKernelDetectionTasks.fire(notebookType);
			}
		});
	}

	getKernelDetectionTasks(notebook: INotebookTextModelLike): INotebookKernelDetectionTask[] {
		return this._kernelDetectionTasks.get(notebook.notebookType) ?? [];
	}

	registerKernelSourceActionProvider(viewType: string, provider: IKernelSourceActionProvider): IDisposable {
		const providers = this._kernelSourceActionProviders.get(viewType) ?? [];
		providers.push(provider);
		this._kernelSourceActionProviders.set(viewType, providers);
		this._onDidChangeSourceActions.fire({ viewType: viewType });

		const eventEmitterDisposable = provider.onDidChangeSourceActions?.(() => {
			this._onDidChangeSourceActions.fire({ viewType: viewType });
		});

		return toDisposable(() => {
			const providers = this._kernelSourceActionProviders.get(viewType) ?? [];
			const idx = providers.indexOf(provider);
			if (idx >= 0) {
				providers.splice(idx, 1);
				this._kernelSourceActionProviders.set(viewType, providers);
			}

			eventEmitterDisposable?.dispose();
		});
	}

	/**
	 * Get kernel source actions from providers
	 */
	getKernelSourceActions2(notebook: INotebookTextModelLike): Promise<INotebookKernelSourceAction[]> {
		const viewType = notebook.notebookType;
		const providers = this._kernelSourceActionProviders.get(viewType) ?? [];
		const promises = providers.map(provider => provider.provideKernelSourceActions());
		return Promise.all(promises).then(actions => {
			return actions.reduce((a, b) => a.concat(b), []);
		});
	}
}
