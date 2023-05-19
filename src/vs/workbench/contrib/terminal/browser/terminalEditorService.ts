/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorActivation } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IShellLaunchConfig, TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { IEditorPane } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IDeserializedTerminalEditorInput, ITerminalEditorService, ITerminalInstance, ITerminalInstanceService, TerminalEditorLocation } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';
import { getInstanceFromResource } from 'vs/workbench/contrib/terminal/browser/terminalUri';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, ACTIVE_GROUP, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class TerminalEditorService extends Disposable implements ITerminalEditorService {
	declare _serviceBrand: undefined;

	instances: ITerminalInstance[] = [];
	private _activeInstanceIndex: number = -1;
	private _isShuttingDown = false;
	private _activeOpenEditorRequest?: { instanceId: number; promise: Promise<IEditorPane | undefined> };

	private _terminalEditorActive: IContextKey<boolean>;

	private _editorInputs: Map</*resource*/string, TerminalEditorInput> = new Map();
	private _instanceDisposables: Map</*resource*/string, IDisposable[]> = new Map();

	private readonly _onDidDisposeInstance = new Emitter<ITerminalInstance>();
	readonly onDidDisposeInstance = this._onDidDisposeInstance.event;
	private readonly _onDidFocusInstance = new Emitter<ITerminalInstance>();
	readonly onDidFocusInstance = this._onDidFocusInstance.event;
	private readonly _onDidChangeInstanceCapability = new Emitter<ITerminalInstance>();
	readonly onDidChangeInstanceCapability = this._onDidChangeInstanceCapability.event;
	private readonly _onDidChangeActiveInstance = new Emitter<ITerminalInstance | undefined>();
	readonly onDidChangeActiveInstance = this._onDidChangeActiveInstance.event;
	private readonly _onDidChangeInstances = new Emitter<void>();
	readonly onDidChangeInstances = this._onDidChangeInstances.event;

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();
		this._terminalEditorActive = TerminalContextKeys.terminalEditorActive.bindTo(contextKeyService);
		this._register(toDisposable(() => {
			for (const d of this._instanceDisposables.values()) {
				dispose(d);
			}
		}));
		this._register(lifecycleService.onWillShutdown(() => this._isShuttingDown = true));
		this._register(this._editorService.onDidActiveEditorChange(() => {
			const activeEditor = this._editorService.activeEditor;
			const instance = activeEditor instanceof TerminalEditorInput ? activeEditor?.terminalInstance : undefined;
			const terminalEditorActive = !!instance && activeEditor instanceof TerminalEditorInput;
			this._terminalEditorActive.set(terminalEditorActive);
			if (terminalEditorActive) {
				activeEditor?.setGroup(this._editorService.activeEditorPane?.group);
				this.setActiveInstance(instance);
			} else {
				for (const instance of this.instances) {
					instance.resetFocusContextKey();
				}
			}
		}));
		this._register(this._editorService.onDidVisibleEditorsChange(() => {
			// add any terminal editors created via the editor service split command
			const knownIds = this.instances.map(i => i.instanceId);
			const terminalEditors = this._getActiveTerminalEditors();
			const unknownEditor = terminalEditors.find(input => {
				const inputId = input instanceof TerminalEditorInput ? input.terminalInstance?.instanceId : undefined;
				if (inputId === undefined) {
					return false;
				}
				return !knownIds.includes(inputId);
			});
			if (unknownEditor instanceof TerminalEditorInput && unknownEditor.terminalInstance) {
				this._editorInputs.set(unknownEditor.terminalInstance.resource.path, unknownEditor);
				this.instances.push(unknownEditor.terminalInstance);
			}
		}));

		// Remove the terminal from the managed instances when the editor closes. This fires when
		// dragging and dropping to another editor or closing the editor via cmd/ctrl+w.
		this._register(this._editorService.onDidCloseEditor(e => {
			const instance = e.editor instanceof TerminalEditorInput ? e.editor.terminalInstance : undefined;
			if (instance) {
				const instanceIndex = this.instances.findIndex(e => e === instance);
				if (instanceIndex !== -1) {
					const wasActiveInstance = this.instances[instanceIndex] === this.activeInstance;
					this._removeInstance(instance);
					if (wasActiveInstance) {
						this.setActiveInstance(undefined);
					}
				}
			}
		}));
	}

	private _getActiveTerminalEditors(): EditorInput[] {
		return this._editorService.visibleEditors.filter(e => e instanceof TerminalEditorInput && e.terminalInstance?.instanceId);
	}

	get activeInstance(): ITerminalInstance | undefined {
		if (this.instances.length === 0 || this._activeInstanceIndex === -1) {
			return undefined;
		}
		return this.instances[this._activeInstanceIndex];
	}

	setActiveInstance(instance: ITerminalInstance | undefined): void {
		this._activeInstanceIndex = instance ? this.instances.findIndex(e => e === instance) : -1;
		this._onDidChangeActiveInstance.fire(this.activeInstance);
	}

	async focusActiveInstance(): Promise<void> {
		return this.activeInstance?.focusWhenReady(true);
	}

	async openEditor(instance: ITerminalInstance, editorOptions?: TerminalEditorLocation): Promise<void> {
		const resource = this.resolveResource(instance);
		if (resource) {
			await this._activeOpenEditorRequest?.promise;
			this._activeOpenEditorRequest = {
				instanceId: instance.instanceId,
				promise: this._editorService.openEditor({
					resource,
					description: instance.description || instance.shellLaunchConfig.type,
					options: {
						pinned: true,
						forceReload: true,
						preserveFocus: editorOptions?.preserveFocus
					}
				}, editorOptions?.viewColumn ?? ACTIVE_GROUP)
			};
			await this._activeOpenEditorRequest?.promise;
			this._activeOpenEditorRequest = undefined;
		}
	}

	resolveResource(instance: ITerminalInstance): URI {
		const resource = instance.resource;
		const inputKey = resource.path;
		const cachedEditor = this._editorInputs.get(inputKey);

		if (cachedEditor) {
			return cachedEditor.resource;
		}

		instance.target = TerminalLocation.Editor;
		const input = this._instantiationService.createInstance(TerminalEditorInput, resource, instance);
		this._registerInstance(inputKey, input, instance);
		return input.resource;
	}

	getInputFromResource(resource: URI): TerminalEditorInput {
		const input = this._editorInputs.get(resource.path);
		if (!input) {
			throw new Error(`Could not get input from resource: ${resource.path}`);
		}
		return input;
	}

	private _registerInstance(inputKey: string, input: TerminalEditorInput, instance: ITerminalInstance): void {
		this._editorInputs.set(inputKey, input);
		this._instanceDisposables.set(inputKey, [
			instance.onDidFocus(this._onDidFocusInstance.fire, this._onDidFocusInstance),
			instance.onDisposed(this._onDidDisposeInstance.fire, this._onDidDisposeInstance),
			instance.capabilities.onDidAddCapability(() => this._onDidChangeInstanceCapability.fire(instance)),
			instance.capabilities.onDidRemoveCapability(() => this._onDidChangeInstanceCapability.fire(instance)),
		]);
		this.instances.push(instance);
		this._onDidChangeInstances.fire();
	}

	private _removeInstance(instance: ITerminalInstance) {
		const inputKey = instance.resource.path;
		this._editorInputs.delete(inputKey);
		const instanceIndex = this.instances.findIndex(e => e === instance);
		if (instanceIndex !== -1) {
			this.instances.splice(instanceIndex, 1);
		}
		const disposables = this._instanceDisposables.get(inputKey);
		this._instanceDisposables.delete(inputKey);
		if (disposables) {
			dispose(disposables);
		}
		this._onDidChangeInstances.fire();
	}

	getInstanceFromResource(resource?: URI): ITerminalInstance | undefined {
		return getInstanceFromResource(this.instances, resource);
	}

	splitInstance(instanceToSplit: ITerminalInstance, shellLaunchConfig: IShellLaunchConfig = {}): ITerminalInstance {
		if (instanceToSplit.target === TerminalLocation.Editor) {
			// Make sure the instance to split's group is active
			const group = this._editorInputs.get(instanceToSplit.resource.path)?.group;
			if (group) {
				this._editorGroupsService.activateGroup(group);
			}
		}
		const instance = this._terminalInstanceService.createInstance(shellLaunchConfig, TerminalLocation.Editor);
		const resource = this.resolveResource(instance);
		if (resource) {
			this._editorService.openEditor({
				resource: URI.revive(resource),
				description: instance.description,
				options: {
					pinned: true,
					forceReload: true
				}
			}, SIDE_GROUP);
		}
		return instance;
	}

	reviveInput(deserializedInput: IDeserializedTerminalEditorInput): EditorInput {
		if ('pid' in deserializedInput) {
			const newDeserializedInput = { ...deserializedInput, findRevivedId: true };
			const instance = this._terminalInstanceService.createInstance({ attachPersistentProcess: newDeserializedInput }, TerminalLocation.Editor);
			const input = this._instantiationService.createInstance(TerminalEditorInput, instance.resource, instance);
			this._registerInstance(instance.resource.path, input, instance);
			return input;
		} else {
			throw new Error(`Could not revive terminal editor input, ${deserializedInput}`);
		}
	}

	detachInstance(instance: ITerminalInstance) {
		const inputKey = instance.resource.path;
		const editorInput = this._editorInputs.get(inputKey);
		editorInput?.detachInstance();
		this._removeInstance(instance);
		// Don't dispose the input when shutting down to avoid layouts in the editor area
		if (!this._isShuttingDown) {
			editorInput?.dispose();
		}
	}

	async revealActiveEditor(preserveFocus?: boolean): Promise<void> {
		const instance = this.activeInstance;
		if (!instance) {
			return;
		}

		// If there is an active openEditor call for this instance it will be revealed by that
		if (this._activeOpenEditorRequest?.instanceId === instance.instanceId) {
			return;
		}

		const editorInput = this._editorInputs.get(instance.resource.path)!;
		this._editorService.openEditor(
			editorInput,
			{
				pinned: true,
				forceReload: true,
				preserveFocus,
				activation: EditorActivation.PRESERVE
			}
		);
	}
}
