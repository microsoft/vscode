/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { FindReplaceState } from 'vs/editor/contrib/find/findState';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IShellLaunchConfig, TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { IEditorInput, IEditorPane } from 'vs/workbench/common/editor';
import { ITerminalEditorService, ITerminalInstance, ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditor } from 'vs/workbench/contrib/terminal/browser/terminalEditor';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';
import { SerializedTerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorSerializer';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class TerminalEditorService extends Disposable implements ITerminalEditorService {
	declare _serviceBrand: undefined;

	instances: ITerminalInstance[] = [];
	private _activeInstanceIndex: number = -1;
	private _isShuttingDown = false;

	private _editorInputs: Map</*instanceId*/number, TerminalEditorInput> = new Map();
	private _instanceDisposables: Map</*instanceId*/number, IDisposable[]> = new Map();

	private readonly _onDidDisposeInstance = new Emitter<ITerminalInstance>();
	readonly onDidDisposeInstance = this._onDidDisposeInstance.event;
	private readonly _onDidFocusInstance = new Emitter<ITerminalInstance>();
	readonly onDidFocusInstance = this._onDidFocusInstance.event;
	private readonly _onDidChangeActiveInstance = new Emitter<ITerminalInstance | undefined>();
	readonly onDidChangeActiveInstance = this._onDidChangeActiveInstance.event;
	private readonly _onDidChangeInstances = new Emitter<void>();
	readonly onDidChangeInstances = this._onDidChangeInstances.event;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		super();
		this._register(toDisposable(() => {
			for (const d of this._instanceDisposables.values()) {
				dispose(d);
			}
		}));
		this._register(lifecycleService.onWillShutdown(() => this._isShuttingDown = true));
		this._register(this._editorService.onDidActiveEditorChange(() => {
			const activeEditor = this._editorService.activeEditor;
			const instance = activeEditor instanceof TerminalEditorInput ? activeEditor?.terminalInstance : undefined;
			if (instance && activeEditor instanceof TerminalEditorInput) {
				activeEditor?.setGroup(this._editorService.activeEditorPane?.group);
				this._setActiveInstance(instance);
			}
		}));
		this._register(this._editorService.onDidVisibleEditorsChange(() => {
			// add any terminal editors created via the editor service split command
			const knownIds = this.instances.map(i => i.instanceId);
			const terminalEditors = this._getActiveTerminalEditors();
			const unknownEditor = terminalEditors.find(input => !knownIds.includes((input as any).terminalInstance.instanceId));
			if (unknownEditor instanceof TerminalEditorInput && unknownEditor.terminalInstance) {
				this._editorInputs.set(unknownEditor.terminalInstance.instanceId, unknownEditor);
				this.instances.push(unknownEditor.terminalInstance);
			}
		}));
		this._register(this.onDidDisposeInstance(instance => this.detachInstance(instance)));

		// Remove the terminal from the managed instances when the editor closes. This fires when
		// dragging and dropping to another editor or closing the editor via cmd/ctrl+w.
		this._register(this._editorService.onDidCloseEditor(e => {
			const instance = e.editor instanceof TerminalEditorInput ? e.editor.terminalInstance : undefined;
			if (instance) {
				const instanceIndex = this.instances.findIndex(e => e === instance);
				if (instanceIndex !== -1) {
					this.instances.splice(instanceIndex, 1);
				}
			}
		}));
	}

	private _getActiveTerminalEditors(): IEditorInput[] {
		return this._editorService.visibleEditors.filter(e => e instanceof TerminalEditorInput && e.terminalInstance?.instanceId);
	}

	private _getActiveTerminalEditor(): TerminalEditor | undefined {
		return this._editorService.activeEditorPane instanceof TerminalEditor ? this._editorService.activeEditorPane : undefined;
	}

	findPrevious(): void {
		const editor = this._getActiveTerminalEditor();
		editor?.showFindWidget();
		editor?.getFindWidget().find(true);
	}

	findNext(): void {
		const editor = this._getActiveTerminalEditor();
		editor?.showFindWidget();
		editor?.getFindWidget().find(false);
	}

	getFindState(): FindReplaceState {
		const editor = this._getActiveTerminalEditor();
		return editor!.findState!;
	}

	async focusFindWidget(): Promise<void> {
		const instance = this.activeInstance;
		if (instance) {
			await instance.focusWhenReady(true);
		}

		this._getActiveTerminalEditor()?.focusFindWidget();
	}

	hideFindWidget(): void {
		this._getActiveTerminalEditor()?.hideFindWidget();
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
		this._onDidChangeActiveInstance.fire(this.activeInstance);
	}

	async openEditor(instance: ITerminalInstance): Promise<void> {
		const input = this.getOrCreateEditorInput(instance);
		const editorPane: IEditorPane | undefined = await this._editorService.openEditor(input, {
			pinned: true,
			forceReload: true
		},
			input.group
		);
		input.setGroup(editorPane?.group);
	}

	getOrCreateEditorInput(instance: ITerminalInstance | SerializedTerminalEditorInput, isFutureSplit: boolean = false): TerminalEditorInput {
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

		const input = this._instantiationService.createInstance(TerminalEditorInput, instance);
		instance.target = TerminalLocation.Editor;
		this._editorInputs.set(instance.instanceId, input);
		this._instanceDisposables.set(instance.instanceId, [
			instance.onDisposed(this._onDidDisposeInstance.fire, this._onDidDisposeInstance),
			instance.onFocus(this._onDidFocusInstance.fire, this._onDidFocusInstance)
		]);
		this.instances.push(instance);
		this._onDidChangeInstances.fire();
		return input;
	}

	splitInstance(instanceToSplit: ITerminalInstance, shellLaunchConfig: IShellLaunchConfig = {}): ITerminalInstance {
		const input = this.getOrCreateEditorInput(instanceToSplit);
		const instance = this._terminalInstanceService.createInstance(shellLaunchConfig, TerminalLocation.Editor);
		input.setCopyInstance(instance);
		this._commandService.executeCommand('workbench.action.splitEditor');
		return instance;
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
		// Don't dispose the input when shutting down to avoid layouts in the editor area
		if (!this._isShuttingDown) {
			editorInput?.dispose();
		}
		const disposables = this._instanceDisposables.get(instance.instanceId);
		this._instanceDisposables.delete(instance.instanceId);
		if (disposables) {
			dispose(disposables);
		}
		this._onDidChangeInstances.fire();
	}
}
