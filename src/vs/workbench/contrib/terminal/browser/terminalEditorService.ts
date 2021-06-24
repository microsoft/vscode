/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITerminalEditorService, ITerminalInstance, ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';
import { SerializedTerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorSerializer';
import { TerminalLocation } from 'vs/workbench/contrib/terminal/common/terminal';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class TerminalEditorService extends Disposable implements ITerminalEditorService {
	declare _serviceBrand: undefined;

	instances: ITerminalInstance[] = [];
	private _activeInstanceIndex: number = -1;

	private _editorInputs: Map</*instanceId*/number, TerminalEditorInput> = new Map();
	private _instanceDisposables: Map</*instanceId*/number, IDisposable[]> = new Map();

	private readonly _onDidDisposeInstance = new Emitter<ITerminalInstance>();
	get onDidDisposeInstance(): Event<ITerminalInstance> { return this._onDidDisposeInstance.event; }
	private readonly _onDidChangeActiveInstance = new Emitter<ITerminalInstance | undefined>();
	get onDidChangeActiveInstance(): Event<ITerminalInstance | undefined> { return this._onDidChangeActiveInstance.event; }
	private readonly _onDidChangeInstances = new Emitter<void>();
	get onDidChangeInstances(): Event<void> { return this._onDidChangeInstances.event; }

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService,
		@IThemeService private readonly _themeService: IThemeService
	) {
		super();
		this._register(toDisposable(() => {
			for (const d of this._instanceDisposables.values()) {
				dispose(d);
			}
		}));
		this._register(this._editorService.onDidActiveEditorChange(() => {
			const activeEditor = this._editorService.activeEditor;
			this._setActiveInstance(activeEditor instanceof TerminalEditorInput ? activeEditor?.terminalInstance : undefined);
		}));
		this._register(this._editorService.onDidVisibleEditorsChange(() => {
			// add any terminal editors created via the editor service split command
			const knownIds = this.instances.map(i => i.instanceId);
			const terminalEditors = this._editorService.visibleEditors.filter(e => e instanceof TerminalEditorInput && e.terminalInstance?.instanceId);
			const unknownEditor = terminalEditors.find(input => !knownIds.includes((input as any).terminalInstance.instanceId));
			if (unknownEditor instanceof TerminalEditorInput && unknownEditor.terminalInstance) {
				this._editorInputs.set(unknownEditor.terminalInstance.instanceId, unknownEditor);
				this.instances.push(unknownEditor.terminalInstance);
			}
		}));
	}

	get activeInstance(): ITerminalInstance | undefined {
		if (this.instances.length === 0 || this._activeInstanceIndex === -1) {
			return undefined;
		}
		return this.instances[this._activeInstanceIndex];
	}

	setActiveInstance(instance: ITerminalInstance): void {
		this._setActiveInstance(instance);
	}

	private _setActiveInstance(instance: ITerminalInstance | undefined): void {
		if (instance === undefined) {
			this._activeInstanceIndex = -1;
		} else {
			this._activeInstanceIndex = this.instances.findIndex(e => e === instance);
		}
		const newActiveInstance = this.activeInstance;
		this._onDidChangeActiveInstance.fire(newActiveInstance);
	}

	async openEditor(instance: ITerminalInstance): Promise<void> {
		const input = this.getOrCreateEditorInput(instance);
		await this._editorService.openEditor(input, {
			pinned: true,
			forceReload: true
		});
	}

	getOrCreateEditorInput(instance: ITerminalInstance | SerializedTerminalEditorInput): TerminalEditorInput {
		let cachedEditor;
		if ('id' in instance) {
			cachedEditor = this._editorInputs.get(instance.id);
		} else if ('instanceId' in instance) {
			cachedEditor = this._editorInputs.get(instance.instanceId);
		}
		if (cachedEditor) {
			return cachedEditor;
		}

		if ('pid' in instance) {
			instance = this._terminalInstanceService.createInstance({ attachPersistentProcess: instance }, TerminalLocation.Editor);
		}

		const input = new TerminalEditorInput(instance, this._themeService, this._terminalInstanceService);
		instance.target = TerminalLocation.Editor;
		this._editorInputs.set(instance.instanceId, input);
		this._instanceDisposables.set(instance.instanceId, [
			instance.onDisposed(this._onDidDisposeInstance.fire, this._onDidDisposeInstance)
		]);
		this.instances.push(instance);
		this._onDidChangeInstances.fire();
		return input;
	}

	detachActiveEditorInstance(): ITerminalInstance {
		const activeEditor = this._editorService.activeEditor;
		if (!(activeEditor instanceof TerminalEditorInput)) {
			throw new Error('Active editor is not a terminal');
		}
		const instance = activeEditor.terminalInstance;
		if (!instance) {
			throw new Error('Terminal is already detached');
		}
		this.detachInstance(instance);
		return instance;
	}

	detachInstance(instance: ITerminalInstance) {
		const editorInput = this._editorInputs.get(instance.instanceId);
		editorInput?.detachInstance();
		this._editorInputs.delete(instance.instanceId);
		const instanceIndex = this.instances.findIndex(e => e === instance);
		if (instanceIndex !== -1) {
			this.instances.splice(instanceIndex, 1);
		}
		editorInput?.dispose();
		const disposables = this._instanceDisposables.get(instance.instanceId);
		this._instanceDisposables.delete(instance.instanceId);
		if (disposables) {
			dispose(disposables);
		}
		this._onDidChangeInstances.fire();
	}
}
