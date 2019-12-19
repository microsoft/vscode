/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorInput, IEditorInputFactoryRegistry, IEditorIdentifier, GroupIdentifier, Extensions } from 'vs/workbench/common/editor';
import { dispose, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Registry } from 'vs/platform/registry/common/platform';
import { Event, Emitter } from 'vs/base/common/event';
import { IEditorGroupsService, IEditorGroup, EditorsOrder, GroupChangeKind, GroupsOrder } from 'vs/workbench/services/editor/common/editorGroupsService';
import { coalesce } from 'vs/base/common/arrays';
import { LinkedMap, Touch } from 'vs/base/common/map';

interface ISerializedEditorsList {
	entries: ISerializedEditorIdentifier[];
}

interface ISerializedEditorIdentifier {
	groupId: GroupIdentifier;
	index: number;
}

/**
 * A observer of opened editors across all editor groups by most recently used.
 * Rules:
 * - the last editor in the list is the one most recently activated
 * - the first editor in the list is the one that was activated the longest time ago
 * - an editor that opens inactive will be placed behind the currently active editor
 */
export class EditorsObserver extends Disposable {

	private static readonly STORAGE_KEY = 'editorsObserver.state';

	private readonly keyMap = new Map<GroupIdentifier, Map<IEditorInput, IEditorIdentifier>>();
	private readonly mostRecentEditorsMap = new LinkedMap<IEditorIdentifier, IEditorIdentifier>();

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	get editors(): IEditorIdentifier[] {
		return this.mostRecentEditorsMap.values();
	}

	constructor(
		@IEditorGroupsService private editorGroupsService: IEditorGroupsService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.storageService.onWillSaveState(() => this.saveState()));
		this._register(this.editorGroupsService.onDidAddGroup(group => this.onGroupAdded(group)));

		this.editorGroupsService.whenRestored.then(() => this.loadState());
	}

	private onGroupAdded(group: IEditorGroup): void {

		// Make sure to add any already existing editor
		// of the new group into our list in LRU order
		const groupEditorsMru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
		for (let i = groupEditorsMru.length - 1; i >= 0; i--) {
			this.addMostRecentEditor(group, groupEditorsMru[i], false /* is not active */);
		}

		// Make sure that active editor is put as first if group is active
		if (this.editorGroupsService.activeGroup === group && group.activeEditor) {
			this.addMostRecentEditor(group, group.activeEditor, true /* is active */);
		}

		// Group Listeners
		this.registerGroupListeners(group);
	}

	private registerGroupListeners(group: IEditorGroup): void {
		const groupDisposables = new DisposableStore();
		groupDisposables.add(group.onDidGroupChange(e => {
			switch (e.kind) {

				// Group gets active: put active editor as most recent
				case GroupChangeKind.GROUP_ACTIVE: {
					if (this.editorGroupsService.activeGroup === group && group.activeEditor) {
						this.addMostRecentEditor(group, group.activeEditor, true /* is active */);
					}

					break;
				}

				// Editor gets active: put active editor as most recent
				// if group is active, otherwise second most recent
				case GroupChangeKind.EDITOR_ACTIVE: {
					if (e.editor) {
						this.addMostRecentEditor(group, e.editor, this.editorGroupsService.activeGroup === group);
					}

					break;
				}

				// Editor opens: put it as second most recent
				case GroupChangeKind.EDITOR_OPEN: {
					if (e.editor) {
						this.addMostRecentEditor(group, e.editor, false /* is not active */);
					}

					break;
				}

				// Editor closes: remove from recently opened
				case GroupChangeKind.EDITOR_CLOSE: {
					if (e.editor) {
						this.removeMostRecentEditor(group, e.editor);
					}

					break;
				}
			}
		}));

		// Make sure to cleanup on dispose
		Event.once(group.onWillDispose)(() => dispose(groupDisposables));
	}

	private addMostRecentEditor(group: IEditorGroup, editor: IEditorInput, isActive: boolean): void {
		const key = this.ensureKey(group, editor);
		const mostRecentEditor = this.mostRecentEditorsMap.first;

		// Active or first entry: add to end of map
		if (isActive || !mostRecentEditor) {
			this.mostRecentEditorsMap.set(key, key, mostRecentEditor ? Touch.AsOld /* make first */ : undefined);
		}

		// Otherwise: insert before most recent
		else {
			// we have most recent editors. as such we
			// put this newly opened editor right before
			// the current most recent one because it cannot
			// be the most recently active one unless
			// it becomes active. but it is still more
			// active then any other editor in the list.
			this.mostRecentEditorsMap.set(key, key, Touch.AsOld /* make first */);
			this.mostRecentEditorsMap.set(mostRecentEditor, mostRecentEditor, Touch.AsOld /* make first */);
		}

		// Event
		this._onDidChange.fire();
	}

	private removeMostRecentEditor(group: IEditorGroup, editor: IEditorInput): void {
		const key = this.findKey(group, editor);
		if (key) {

			// Remove from most recent editors
			this.mostRecentEditorsMap.delete(key);

			// Remove from key map
			const map = this.keyMap.get(group.id);
			if (map && map.delete(key.editor) && map.size === 0) {
				this.keyMap.delete(group.id);
			}

			// Event
			this._onDidChange.fire();
		}
	}

	private findKey(group: IEditorGroup, editor: IEditorInput): IEditorIdentifier | undefined {
		const groupMap = this.keyMap.get(group.id);
		if (!groupMap) {
			return undefined;
		}

		return groupMap.get(editor);
	}

	private ensureKey(group: IEditorGroup, editor: IEditorInput): IEditorIdentifier {
		let groupMap = this.keyMap.get(group.id);
		if (!groupMap) {
			groupMap = new Map();

			this.keyMap.set(group.id, groupMap);
		}

		let key = groupMap.get(editor);
		if (!key) {
			key = { groupId: group.id, editor };
			groupMap.set(editor, key);
		}

		return key;
	}

	private saveState(): void {
		if (this.mostRecentEditorsMap.isEmpty()) {
			this.storageService.remove(EditorsObserver.STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			this.storageService.store(EditorsObserver.STORAGE_KEY, JSON.stringify(this.serialize()), StorageScope.WORKSPACE);
		}
	}

	private serialize(): ISerializedEditorsList {
		const registry = Registry.as<IEditorInputFactoryRegistry>(Extensions.EditorInputFactories);

		const entries = this.mostRecentEditorsMap.values();
		const mapGroupToSerializableEditorsOfGroup = new Map<IEditorGroup, IEditorInput[]>();

		return {
			entries: coalesce(entries.map(({ editor, groupId }) => {

				// Find group for entry
				const group = this.editorGroupsService.getGroup(groupId);
				if (!group) {
					return undefined;
				}

				// Find serializable editors of group
				let serializableEditorsOfGroup = mapGroupToSerializableEditorsOfGroup.get(group);
				if (!serializableEditorsOfGroup) {
					serializableEditorsOfGroup = group.getEditors(EditorsOrder.SEQUENTIAL).filter(editor => {
						const factory = registry.getEditorInputFactory(editor.getTypeId());

						return factory?.canSerialize(editor);
					});
					mapGroupToSerializableEditorsOfGroup.set(group, serializableEditorsOfGroup);
				}

				// Only store the index of the editor of that group
				// which can be undefined if the editor is not serializable
				const index = serializableEditorsOfGroup.indexOf(editor);
				if (index === -1) {
					return undefined;
				}

				return { groupId, index };
			}))
		};
	}

	private loadState(): void {
		const serialized = this.storageService.get(EditorsObserver.STORAGE_KEY, StorageScope.WORKSPACE);

		// Previous state:
		if (serialized) {

			// Load editors map from persisted state
			this.deserialize(JSON.parse(serialized));
		}

		// No previous state: best we can do is add each editor
		// from oldest to most recently used editor group
		else {
			const groups = this.editorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
			for (let i = groups.length - 1; i >= 0; i--) {
				const group = groups[i];
				const groupEditorsMru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
				for (let i = groupEditorsMru.length - 1; i >= 0; i--) {
					this.addMostRecentEditor(group, groupEditorsMru[i], true /* enforce as active to preserve order */);
				}
			}
		}

		// Ensure we listen on group changes for those that exist on startup
		for (const group of this.editorGroupsService.groups) {
			this.registerGroupListeners(group);
		}
	}

	private deserialize(serialized: ISerializedEditorsList): void {
		const mapValues: [IEditorIdentifier, IEditorIdentifier][] = [];

		for (const { groupId, index } of serialized.entries) {

			// Find group for entry
			const group = this.editorGroupsService.getGroup(groupId);
			if (!group) {
				continue;
			}

			// Find editor for entry
			const editor = group.getEditorByIndex(index);
			if (!editor) {
				continue;
			}

			// Make sure key is registered as well
			const editorIdentifier = this.ensureKey(group, editor);
			mapValues.push([editorIdentifier, editorIdentifier]);
		}

		// Fill map with deserialized values
		this.mostRecentEditorsMap.fromJSON(mapValues);
	}
}
