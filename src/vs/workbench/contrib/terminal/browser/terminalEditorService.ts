/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { FindReplaceState } from 'vs/editor/contrib/find/browser/findState';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorActivation } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IShellLaunchConfig, TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IDeserializedTerminalEditorInput, ITerminalEditorService, ITerminalInstance, ITerminalInstanceService, TerminalEditorLocation } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditor } from 'vs/workbench/contrib/terminal/browser/terminalEditor';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';
import { getInstanceFromResource, parseTerminalUri } from 'vs/workbench/contrib/terminal/browser/terminalUri';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, ACTIVE_GROUP, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class TerminalEditorService extends Disposable implements ITerminalEditorService {
	declare _serviceBrand: undefined;

	instances: ITerminalInstance[] = [];
	private _activeInstanceIndex: number = -1;
	private _isShuttingDown = false;

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
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
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
				this._setActiveInstance(instance);
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
		this._register(this._editorService.onDidActiveEditorChange(() => {
			const instance = this._editorService.activeEditor instanceof TerminalEditorInput ? this._editorService.activeEditor : undefined;
			if (!instance) {
				for (const instance of this.instances) {
					instance.resetFocusContextKey();
				}
			}
		}));
	}

	private _getActiveTerminalEditors(): EditorInput[] {
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

	async openEditor(instance: ITerminalInstance, editorOptions?: TerminalEditorLocation): Promise<void> {
		const resource = this.resolveResource(instance);
		if (resource) {
			await this._editorService.openEditor({
				resource,
				description: instance.description || instance.shellLaunchConfig.type,
				options:
				{
					pinned: true,
					forceReload: true,
					preserveFocus: editorOptions?.preserveFocus
				}
			}, editorOptions?.viewColumn || ACTIVE_GROUP);
		}
	}

	resolveResource(instanceOrUri: ITerminalInstance | URI, isFutureSplit: boolean = false): URI {
		const resource: URI = URI.isUri(instanceOrUri) ? instanceOrUri : instanceOrUri.resource;
		const inputKey = resource.path;
		const cachedEditor = this._editorInputs.get(inputKey);

		if (cachedEditor) {
			return cachedEditor.resource;
		}

		// Terminal from a different window
		if (URI.isUri(instanceOrUri)) {
			const terminalIdentifier = parseTerminalUri(instanceOrUri);
			if (terminalIdentifier.instanceId) {
				this._terminalInstanceService.getBackend(this._environmentService.remoteAuthority).then(primaryBackend => {
					primaryBackend?.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId!).then(attachPersistentProcess => {
						const instance = this._terminalInstanceService.createInstance({ attachPersistentProcess }, TerminalLocation.Editor, resource);
						input = this._instantiationService.createInstance(TerminalEditorInput, resource, instance);
						this._editorService.openEditor(input, {
							pinned: true,
							forceReload: true
						},
							input.group
						);
						this._registerInstance(inputKey, input, instance);
						return instanceOrUri;
					});
				});
			}
		}

		let input: TerminalEditorInput;
		if ('instanceId' in instanceOrUri) {
			instanceOrUri.target = TerminalLocation.Editor;
			input = this._instantiationService.createInstance(TerminalEditorInput, resource, instanceOrUri);
			this._registerInstance(inputKey, input, instanceOrUri);
			return input.resource;
		} else {
			return instanceOrUri;
		}
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
				options:
				{
					pinned: true,
					forceReload: true
				}
			},
				SIDE_GROUP);
		}
		return instance;
	}

	reviveInput(deserializedInput: IDeserializedTerminalEditorInput): EditorInput {
		const resource: URI = URI.isUri(deserializedInput) ? deserializedInput : deserializedInput.resource;
		const inputKey = resource.path;

		if ('pid' in deserializedInput) {
			const newDeserializedInput = { ...deserializedInput, findRevivedId: true };
			const instance = this._terminalInstanceService.createInstance({ attachPersistentProcess: newDeserializedInput }, TerminalLocation.Editor);
			instance.target = TerminalLocation.Editor;
			const input = this._instantiationService.createInstance(TerminalEditorInput, resource, instance);
			this._registerInstance(inputKey, input, instance);
			return input;
		} else {
			throw new Error(`Could not revive terminal editor input, ${deserializedInput}`);
		}
	}

	detachActiveEditorInstance(): ITerminalInstance {
		const activeEditor = this._editorService.activeEditor;
		if (!(activeEditor instanceof TerminalEditorInput)) {
			// should never happen now with the terminalEditorActive context key
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
		const inputKey = instance.resource.path;
		const editorInput = this._editorInputs.get(inputKey);
		editorInput?.detachInstance();
		this._editorInputs.delete(inputKey);
		const instanceIndex = this.instances.findIndex(e => e === instance);
		if (instanceIndex !== -1) {
			this.instances.splice(instanceIndex, 1);
		}
		// Don't dispose the input when shutting down to avoid layouts in the editor area
		if (!this._isShuttingDown) {
			editorInput?.dispose();
		}
		const disposables = this._instanceDisposables.get(inputKey);
		this._instanceDisposables.delete(inputKey);
		if (disposables) {
			dispose(disposables);
		}
		this._onDidChangeInstances.fire();
	}

	revealActiveEditor(preserveFocus?: boolean): void {
		const instance = this.activeInstance;
		if (!instance) {
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
			},
			editorInput.group
		);
	}
}
