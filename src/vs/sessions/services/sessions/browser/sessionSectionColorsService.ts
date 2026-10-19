/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getNextSessionColor, SessionColor, SessionTextColorMode, toSessionColor, toSessionTextColorMode } from '../common/sessionColors.js';
import { ISessionGroup, ISessionGroupsService } from './sessionGroupsService.js';

/** The color of a sessions list header. */
export interface ISessionSectionColor {
	readonly color: SessionColor;
	readonly textColor: SessionTextColorMode;
}

/** Section identity of the built-in Pinned section. */
export const PINNED_SECTION_COLOR_ID = 'pinned';
/** Section identity of the built-in Chats (quick chats) section. */
export const QUICK_CHATS_SECTION_COLOR_ID = 'quickchats';

/** Built-in sections that can be colored. Their color is list-wide, not per collection. */
export const COLORABLE_BUILT_IN_SECTION_IDS: readonly string[] = [PINNED_SECTION_COLOR_ID, QUICK_CHATS_SECTION_COLOR_ID];

export function getGroupSectionId(groupId: string): string {
	return `group:${groupId}`;
}

/** Whether headers with this section identity can be colored. */
export function isColorableSectionId(sectionId: string): boolean {
	return sectionId.startsWith('group:') || sectionId.startsWith('workspace:') || COLORABLE_BUILT_IN_SECTION_IDS.includes(sectionId);
}

/**
 * Owns the colors of sessions list headers: user-created groups, workspace
 * sections and the built-in Pinned and Chats sections. Colors are keyed by the
 * list's section identity (`group:<id>`, `workspace:<label>`, `pinned`,
 * `quickchats`) and are profile-scoped local presentation state.
 *
 * Every group has a color: a new group receives the next unused palette color,
 * and groups created before colors existed are assigned one once, in creation
 * order. Workspace and built-in sections are uncolored until the user colors
 * them. Workspace colors survive the workspace disappearing from the provider
 * catalog; a group's color is removed with the group.
 */
export interface ISessionSectionColorsService {
	readonly _serviceBrand: undefined;

	/** All stored colors by section identity. */
	readonly colors: IObservable<ReadonlyMap<string, ISessionSectionColor>>;

	/** The color of a section, or `undefined` when it is uncolored. */
	getColor(sectionId: string): ISessionSectionColor | undefined;

	/**
	 * Set or (with `undefined`) remove the color of a section. A group always
	 * keeps a color, so removing a group's color is ignored.
	 */
	setColor(sectionId: string, color: ISessionSectionColor | undefined): void;

	/** The next palette color for a new group or workspace color. */
	getNextColor(): SessionColor;
}

export const ISessionSectionColorsService = createDecorator<ISessionSectionColorsService>('sessionSectionColorsService');

interface ISerializedState {
	readonly version: 1;
	readonly colors: Readonly<Record<string, { readonly color: string; readonly textColor?: string }>>;
}

export class SessionSectionColorsService extends Disposable implements ISessionSectionColorsService {

	declare readonly _serviceBrand: undefined;

	private static readonly STORAGE_KEY = 'sessionsListControl.sectionColors';

	private readonly _colors = observableValue<ReadonlyMap<string, ISessionSectionColor>>(this, new Map());
	readonly colors: IObservable<ReadonlyMap<string, ISessionSectionColor>> = this._colors;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ISessionGroupsService private readonly sessionGroupsService: ISessionGroupsService,
	) {
		super();
		this._colors.set(this.load(), undefined);
		this.syncGroups();
		this._register(this.sessionGroupsService.onDidChange(e => {
			if (e.groupsChanged) {
				this.syncGroups();
			}
		}));
	}

	getColor(sectionId: string): ISessionSectionColor | undefined {
		return this._colors.get().get(sectionId);
	}

	setColor(sectionId: string, color: ISessionSectionColor | undefined): void {
		if (!isColorableSectionId(sectionId)) {
			return;
		}
		const current = this._colors.get();
		const existing = current.get(sectionId);
		if (!color) {
			if (!existing || sectionId.startsWith('group:')) {
				return;
			}
			const next = new Map(current);
			next.delete(sectionId);
			this.update(next);
			return;
		}
		const normalized = toSessionColor(color.color);
		if (!normalized) {
			return;
		}
		const textColor = toSessionTextColorMode(color.textColor);
		if (existing?.color === normalized && existing.textColor === textColor) {
			return;
		}
		const next = new Map(current);
		next.set(sectionId, { color: normalized, textColor });
		this.update(next);
	}

	getNextColor(): SessionColor {
		return getNextSessionColor([...this._colors.get().values()].map(c => c.color));
	}

	/**
	 * Assigns colors to groups that have none (new groups, and groups created
	 * before colors existed, in creation order) and removes the colors of
	 * deleted groups.
	 */
	private syncGroups(): void {
		const groups = this.sessionGroupsService.getGroups();
		const liveIds = new Set(groups.map(group => getGroupSectionId(group.id)));
		const current = this._colors.get();
		let next: Map<string, ISessionSectionColor> | undefined;
		for (const sectionId of current.keys()) {
			if (sectionId.startsWith('group:') && !liveIds.has(sectionId)) {
				next ??= new Map(current);
				next.delete(sectionId);
			}
		}
		const uncolored = groups.filter(group => !current.has(getGroupSectionId(group.id)));
		if (uncolored.length > 0) {
			next ??= new Map(current);
			for (const group of sortByCreation(uncolored)) {
				const color = getNextSessionColor([...next.values()].map(c => c.color));
				next.set(getGroupSectionId(group.id), { color, textColor: SessionTextColorMode.Auto });
			}
		}
		if (next) {
			this.update(next);
		}
	}

	private update(next: ReadonlyMap<string, ISessionSectionColor>): void {
		this._colors.set(next, undefined);
		this.save(next);
	}

	// -- Storage --

	private load(): Map<string, ISessionSectionColor> {
		const result = new Map<string, ISessionSectionColor>();
		const raw = this.storageService.get(SessionSectionColorsService.STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return result;
		}
		try {
			const parsed = JSON.parse(raw) as Partial<ISerializedState>;
			if (parsed.colors && typeof parsed.colors === 'object') {
				for (const [sectionId, value] of Object.entries(parsed.colors)) {
					const color = value && typeof value === 'object' ? toSessionColor(value.color) : undefined;
					if (color && isColorableSectionId(sectionId)) {
						result.set(sectionId, { color, textColor: toSessionTextColorMode(value.textColor) });
					}
				}
			}
		} catch {
			// ignore corrupt data
		}
		return result;
	}

	private save(colors: ReadonlyMap<string, ISessionSectionColor>): void {
		if (colors.size === 0) {
			this.storageService.remove(SessionSectionColorsService.STORAGE_KEY, StorageScope.PROFILE);
			return;
		}
		const state: ISerializedState = { version: 1, colors: Object.fromEntries(colors) };
		this.storageService.store(SessionSectionColorsService.STORAGE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
	}
}

/** Oldest first; ties broken by id so the order is stable across reloads. */
function sortByCreation(groups: readonly ISessionGroup[]): ISessionGroup[] {
	return [...groups].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

registerSingleton(ISessionSectionColorsService, SessionSectionColorsService, InstantiationType.Delayed);
