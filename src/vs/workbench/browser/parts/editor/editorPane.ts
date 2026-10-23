/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Composite } from '../../composite.js';
import { IEditorPane, GroupIdentifier, IEditorMemento, IEditorOpenContext, isEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { LRUCache, Touch } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { isEmptyObject } from '../../../../base/common/types.js';
import { DEFAULT_EDITOR_MIN_DIMENSIONS, DEFAULT_EDITOR_MAX_DIMENSIONS } from './editor.js';
import { joinPath, IExtUri, isEqual } from '../../../../base/common/resources.js';
import { indexOfPath } from '../../../../base/common/extpath.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { ITextResourceConfigurationChangeEvent, ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IBoundarySashes } from '../../../../base/browser/ui/sash/sash.js';
import { getWindowById } from '../../../../base/browser/dom.js';

/**
 * The base class of editors in the workbench. Editors register themselves for specific editor inputs.
 * Editors are layed out in the editor part of the workbench in editor groups. Multiple editors can be
 * open at the same time. Each editor has a minimized representation that is good enough to provide some
 * information about the state of the editor data.
 *
 * The workbench will keep an editor alive after it has been created and show/hide it based on
 * user interaction. The lifecycle of a editor goes in the order:
 *
 * - `createEditor()`
 * - `setEditorVisible()`
 * - `layout()`
 * - `setInput()`
 * - `focus()`
 * - `dispose()`: when the editor group the editor is in closes
 *
 * During use of the workbench, a editor will often receive a `clearInput()`, `setEditorVisible()`, `layout()` and
 * `focus()` calls, but only one `create()` and `dispose()` call.
 *
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class EditorPane<MementoType extends object = object> extends Composite<MementoType> implements IEditorPane {

	//#region Events

	readonly onDidChangeSizeConstraints = Event.None;

	protected readonly _onDidChangeControl = this._register(new Emitter<void>());
	readonly onDidChangeControl = this._onDidChangeControl.event;

	//#endregion

	private static readonly EDITOR_MEMENTOS = new Map<string, EditorMemento<unknown>>();

	get minimumWidth() { return DEFAULT_EDITOR_MIN_DIMENSIONS.width; }
	get maximumWidth() { return DEFAULT_EDITOR_MAX_DIMENSIONS.width; }
	get minimumHeight() { return DEFAULT_EDITOR_MIN_DIMENSIONS.height; }
	get maximumHeight() { return DEFAULT_EDITOR_MAX_DIMENSIONS.height; }

	protected _input: EditorInput | undefined;
	get input(): EditorInput | undefined { return this._input; }

	protected _options: IEditorOptions | undefined;
	get options(): IEditorOptions | undefined { return this._options; }

	get window() { return getWindowById(this.group.windowId, true).window; }

	/**
	 * Should be overridden by editors that have their own ScopedContextKeyService
	 */
	get scopedContextKeyService(): IContextKeyService | undefined { return undefined; }

	constructor(
		id: string,
		readonly group: IEditorGroup,
		telemetryService: ITelemetryService,
		themeService: IThemeService,
		storageService: IStorageService
	) {
		super(id, telemetryService, themeService, storageService);
	}

	override create(parent: HTMLElement): void {
		super.create(parent);

		// Create Editor
		this.createEditor(parent);
	}

	/**
	 * Called to create the editor in the parent HTMLElement. Subclasses implement
	 * this method to construct the editor widget.
	 */
	protected abstract createEditor(parent: HTMLElement): void;

	/**
	 * Note: Clients should not call this method, the workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Sets the given input with the options to the editor. The input is guaranteed
	 * to be different from the previous input that was set using the `input.matches()`
	 * method.
	 *
	 * The provided context gives more information around how the editor was opened.
	 *
	 * The provided cancellation token should be used to test if the operation
	 * was cancelled.
	 */
	async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this._input = input;
		this._options = options;
	}

	/**
	 * Called to indicate to the editor that the input should be cleared and
	 * resources associated with the input should be freed.
	 *
	 * This method can be called based on different contexts, e.g. when opening
	 * a different input or different editor control or when closing all editors
	 * in a group.
	 *
	 * To monitor the lifecycle of editor inputs, you should not rely on this
	 * method, rather refer to the listeners on `IEditorGroup` via `IEditorGroupsService`.
	 */
	clearInput(): void {
		this._input = undefined;
		this._options = undefined;
	}

	/**
	 * Note: Clients should not call this method, the workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Sets the given options to the editor. Clients should apply the options
	 * to the current input.
	 */
	setOptions(options: IEditorOptions | undefined): void {
		this._options = options;
	}

	override setVisible(visible: boolean): void {
		super.setVisible(visible);

		// Propagate to Editor
		this.setEditorVisible(visible);
	}

	/**
	 * Indicates that the editor control got visible or hidden.
	 *
	 * @param visible the state of visibility of this editor
	 */
	protected setEditorVisible(visible: boolean): void {
		// Subclasses can implement
	}

	setBoundarySashes(_sashes: IBoundarySashes) {
		// Subclasses can implement
	}

	protected getEditorMemento<T>(editorGroupService: IEditorGroupsService, configurationService: ITextResourceConfigurationService, key: string, limit: number = 10): IEditorMemento<T> {
		const mementoKey = `${this.getId()}${key}`;

		let editorMemento = EditorPane.EDITOR_MEMENTOS.get(mementoKey);
		if (!editorMemento) {
			editorMemento = this._register(new EditorMemento(this.getId(), key, this.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE), limit, editorGroupService, configurationService));
			EditorPane.EDITOR_MEMENTOS.set(mementoKey, editorMemento);
		}

		return editorMemento as IEditorMemento<T>;
	}

	getViewState(): object | undefined {

		// Subclasses to override
		return undefined;
	}

	protected override saveState(): void {

		// Save all editor memento for this editor type
		for (const [, editorMemento] of EditorPane.EDITOR_MEMENTOS) {
			if (editorMemento.id === this.getId()) {
				editorMemento.saveState();
			}
		}

		super.saveState();
	}

	override dispose(): void {
		this._input = undefined;
		this._options = undefined;

		super.dispose();
	}
}

interface MapGroupToMemento<T> {
	[group: GroupIdentifier]: T;
}

export class EditorMemento<T> extends Disposable implements IEditorMemento<T> {

	private static readonly SHARED_EDITOR_STATE = -1; // pick a number < 0 to be outside group id range

	private cache: LRUCache<string, MapGroupToMemento<T>> | undefined;
	private cleanedUp = false;
	private editorDisposables: Map<EditorInput, IDisposable> | undefined;
	private shareEditorState = false;

	constructor(
		readonly id: string,
		private readonly key: string,
		private readonly memento: T,
		private readonly limit: number,
		private readonly editorGroupService: IEditorGroupsService,
		private readonly configurationService: ITextResourceConfigurationService
	) {
		super();

		this.updateConfiguration(undefined);
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => this.updateConfiguration(e)));
	}

	private updateConfiguration(e: ITextResourceConfigurationChangeEvent | undefined): void {
		if (!e || e.affectsConfiguration(undefined, 'workbench.editor.sharedViewState')) {
			this.shareEditorState = this.configurationService.getValue(undefined, 'workbench.editor.sharedViewState') === true;
		}
	}

	saveEditorState(group: IEditorGroup, resource: URI, state: T): void;
	saveEditorState(group: IEditorGroup, editor: EditorInput, state: T): void;
	saveEditorState(group: IEditorGroup, resourceOrEditor: URI | EditorInput, state: T): void {
		const resource = this.doGetResource(resourceOrEditor);
		if (!resource || !group) {
			return; // we are not in a good state to save any state for a resource
		}

		const cache = this.doLoad();

		// Ensure mementos for resource map
		let mementosForResource = cache.get(resource.toString());
		if (!mementosForResource) {
			mementosForResource = Object.create(null) as MapGroupToMemento<T>;
			cache.set(resource.toString(), mementosForResource);
		}

		// Store state for group
		mementosForResource[group.id] = state;

		// Store state as most recent one based on settings
		if (this.shareEditorState) {
			mementosForResource[EditorMemento.SHARED_EDITOR_STATE] = state;
		}

		// Automatically clear when editor input gets disposed if any
		if (isEditorInput(resourceOrEditor)) {
			this.clearEditorStateOnDispose(resource, resourceOrEditor);
		}
	}

	loadEditorState(group: IEditorGroup, resource: URI): T | undefined;
	loadEditorState(group: IEditorGroup, editor: EditorInput): T | undefined;
	loadEditorState(group: IEditorGroup, resourceOrEditor: URI | EditorInput): T | undefined {
		const resource = this.doGetResource(resourceOrEditor);
		if (!resource || !group) {
			return; // we are not in a good state to load any state for a resource
		}

		const cache = this.doLoad();

		const mementosForResource = cache.get(resource.toString());
		if (mementosForResource) {
			const mementoForResourceAndGroup = mementosForResource[group.id];

			// Return state for group if present
			if (mementoForResourceAndGroup) {
				return mementoForResourceAndGroup;
			}

			// Return most recent state based on settings otherwise
			if (this.shareEditorState) {
				return mementosForResource[EditorMemento.SHARED_EDITOR_STATE];
			}
		}

		return undefined;
	}

	clearEditorState(resource: URI, group?: IEditorGroup): void;
	clearEditorState(editor: EditorInput, group?: IEditorGroup): void;
	clearEditorState(resourceOrEditor: URI | EditorInput, group?: IEditorGroup): void {
		if (isEditorInput(resourceOrEditor)) {
			this.editorDisposables?.delete(resourceOrEditor);
		}

		const resource = this.doGetResource(resourceOrEditor);
		if (resource) {
			const cache = this.doLoad();

			// Clear state for group
			if (group) {
				const mementosForResource = cache.get(resource.toString());
				if (mementosForResource) {
					delete mementosForResource[group.id];

					if (isEmptyObject(mementosForResource)) {
						cache.delete(resource.toString());
					}
				}
			}

			// Clear state across all groups for resource
			else {
				cache.delete(resource.toString());
			}
		}
	}

	clearEditorStateOnDispose(resource: URI, editor: EditorInput): void {
		if (!this.editorDisposables) {
			this.editorDisposables = new Map<EditorInput, IDisposable>();
		}

		if (!this.editorDisposables.has(editor)) {
			this.editorDisposables.set(editor, Event.once(editor.onWillDispose)(() => {
				this.clearEditorState(resource);
				this.editorDisposables?.delete(editor);
			}));
		}
	}

	moveEditorState(source: URI, target: URI, comparer: IExtUri): void {
		const cache = this.doLoad();

		// We need a copy of the keys to not iterate over
		// newly inserted elements.
		const cacheKeys = [...cache.keys()];
		for (const cacheKey of cacheKeys) {
			const resource = URI.parse(cacheKey);

			if (!comparer.isEqualOrParent(resource, source)) {
				continue; // not matching our resource
			}

			// Determine new resulting target resource
			let targetResource: URI;
			if (isEqual(source, resource)) {
				targetResource = target; // file got moved
			} else {
				const index = indexOfPath(resource.path, source.path);
				targetResource = joinPath(target, resource.path.substr(index + source.path.length + 1)); // parent folder got moved
			}

			// Don't modify LRU state
			const value = cache.get(cacheKey, Touch.None);
			if (value) {
				cache.delete(cacheKey);
				cache.set(targetResource.toString(), value);
			}
		}
	}

	private doGetResource(resourceOrEditor: URI | EditorInput): URI | undefined {
		if (isEditorInput(resourceOrEditor)) {
			return resourceOrEditor.resource;
		}

		return resourceOrEditor;
	}

	private doLoad(): LRUCache<string, MapGroupToMemento<T>> {
		if (!this.cache) {
			this.cache = new LRUCache<string, MapGroupToMemento<T>>(this.limit);

			// Restore from serialized map state
			const rawEditorMemento = this.memento[this.key as keyof T];
			if (Array.isArray(rawEditorMemento)) {
				this.cache.fromJSON(rawEditorMemento);
			}
		}

		return this.cache;
	}

	saveState(): void {
		const cache = this.doLoad();

		// Cleanup once during session
		if (!this.cleanedUp) {
			this.cleanUp();
			this.cleanedUp = true;
		}

		(this.memento as Record<string, unknown>)[this.key] = cache.toJSON();
	}

	private cleanUp(): void {
		const cache = this.doLoad();

		// Remove groups from states that no longer exist. Since we modify the
		// cache and its is a LRU cache make a copy to ensure iteration succeeds
		const entries = [...cache.entries()];
		for (const [resource, mapGroupToMementos] of entries) {
			for (const group of Object.keys(mapGroupToMementos)) {
				const groupId: GroupIdentifier = Number(group);
				if (groupId === EditorMemento.SHARED_EDITOR_STATE && this.shareEditorState) {
					continue; // skip over shared entries if sharing is enabled
				}

				if (!this.editorGroupService.getGroup(groupId)) {
					delete mapGroupToMementos[groupId];
					if (isEmptyObject(mapGroupToMementos)) {
						cache.delete(resource);
					}
				}
			}
		}
	}
}
