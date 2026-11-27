/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { InEditorZenModeContext } from '../../../common/contextkeys.js';
import { EditorGroupLayout, GroupLayoutArgument, GroupOrientation, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IPartsLayoutState, IWorkbenchLayoutService, Position } from '../../../services/layout/browser/layoutService.js';
import { DEFAULT_NAMED_LAYOUT_ID, INamedLayout, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING } from './namedLayouts.js';

/**
 * The prefix of the keys that store the named layouts of the profile, which are not synced. A layout stores its name and each
 * part of its state under its own key, `<prefix><id>.name` and for example `<prefix><id>.sideBar`.
 */
const LAYOUT_STORAGE_KEY_PREFIX = 'workbench.namedLayouts.layout.';
const LAYOUT_NAME_STORAGE_KEY_SUFFIX = '.name';

/** The named layout that is active in the window of a workspace. */
const ACTIVE_LAYOUT_STORAGE_KEY = 'workbench.namedLayouts.activeLayout';

/**
 * The state of the default layout of the window of a workspace while a named layout is active. While the default layout is active,
 * the editor grid that it could not apply, until its editor groups change.
 */
const DEFAULT_LAYOUT_STORAGE_KEY = 'workbench.namedLayouts.defaultLayout';

/**
 * What a layout arranges. Each part is stored, saved and applied on its own, so that a window writes only what it changed,
 * and windows that save the same layout at the same time keep each other's changes. A part that a layout does not have keeps
 * what it shows when the layout applies.
 */
interface INamedLayoutState {
	readonly sideBar?: IPartsLayoutState['sideBar'];
	readonly panel?: IPartsLayoutState['panel'];
	readonly auxiliaryBar?: IPartsLayoutState['auxiliaryBar'];

	/**
	 * The editor groups of the main window, with sizes as fractions of their row or column, so that resizing the window does not change them.
	 */
	readonly editorGroups?: EditorGroupLayout;
}

type NamedLayoutStateKey = keyof INamedLayoutState;

const NAMED_LAYOUT_STATE_KEYS: readonly NamedLayoutStateKey[] = ['sideBar', 'panel', 'auxiliaryBar', 'editorGroups'];

export class NamedLayoutsService extends Disposable implements INamedLayoutsService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeLayouts = this._register(new Emitter<void>());
	readonly onDidChangeLayouts = this._onDidChangeLayouts.event;

	private readonly _onDidChangeActiveLayout = this._register(new Emitter<INamedLayout>());
	readonly onDidChangeActiveLayout = this._onDidChangeActiveLayout.event;

	private readonly defaultLayout: INamedLayout = { id: DEFAULT_NAMED_LAYOUT_ID, name: localize('defaultLayout', "Default") };

	private storedLayouts: readonly INamedLayout[];
	private activeLayoutId: string;

	/**
	 * The state of the active layout as this window started with it, applied or saved it last. Saving writes only what differs from it,
	 * so that what another window saved into the same layout meanwhile is kept. Undefined until the window restored its layout.
	 */
	private baseline: INamedLayoutState | undefined;

	/** Switches and other changes of the layouts run one after another. */
	private readonly sequencer = new Sequencer();

	/** Resolves once the parts restored their view containers and the editor groups their editors, as the window starts, and the window applied its active layout. */
	private readonly whenRestored: Promise<void>;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
	) {
		super();

		this.storedLayouts = this.readStoredLayouts();
		const activeLayoutId = this.storageService.get(ACTIVE_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
		this.activeLayoutId = activeLayoutId && this.storedLayouts.some(layout => layout.id === activeLayoutId) ? activeLayoutId : DEFAULT_NAMED_LAYOUT_ID;
		if (activeLayoutId && this.activeLayoutId === DEFAULT_NAMED_LAYOUT_ID) {
			// The active layout was deleted in another window: the window keeps its arrangement as its default layout
			this.storeActiveLayoutId();
		}

		// The `Restored` phase can start before slow editors restored, while editors still open into groups that applying a layout could merge
		this.whenRestored = Promise.all([this.layoutService.whenRestored, extensionService.whenInstalledExtensionsRegistered()]).then(() => {
			// Part sizes are stored per profile, and other windows can have changed the active layout, so the window applies what differs from it
			if (this.isEnabled() && this.activeLayoutId !== DEFAULT_NAMED_LAYOUT_ID) {
				this.applyChanges(this.readLayoutState(this.activeLayoutId));
			}
			this.baseline = this.captureState();
		});

		this._register(this.layoutService.onDidChangeZenMode(active => {
			if (!active) {
				this.onDidEndZenMode();
			}
		}));

		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(e => {
			if (e.external && e.key.startsWith(LAYOUT_STORAGE_KEY_PREFIX)) {
				this.onDidChangeStoredLayouts();
			}
		}));

		this._register(this.storageService.onWillSaveState(e => {
			if (e.reason === WillSaveStateReason.SHUTDOWN && this.isEnabled()) {
				this.saveActiveLayout();
			}
		}));
	}

	get layouts(): readonly INamedLayout[] {
		return [this.defaultLayout, ...[...this.storedLayouts].sort((a, b) => a.name.localeCompare(b.name))];
	}

	get activeLayout(): INamedLayout {
		return this.storedLayouts.find(layout => layout.id === this.activeLayoutId) ?? this.defaultLayout;
	}

	createLayout(name: string): Promise<INamedLayout | undefined> {
		return this.sequencer.queue(async () => {
			await this.whenRestored;
			if (!this.isEnabled()) {
				return undefined;
			}
			this.endZenMode();

			// The default layout is the window's own layout, so it keeps what the window shows
			const state = this.captureState();
			if (this.activeLayoutId === DEFAULT_NAMED_LAYOUT_ID) {
				this.storeDefaultLayoutState(this.captureDefaultLayoutState());
			}

			const layout: INamedLayout = { id: generateUuid(), name: toLayoutName(name) };
			this.storeLayoutState(layout.id, state);
			// Other windows list a layout once it has a name, so the name is stored last
			this.storageService.store(layoutStorageKey(layout.id, 'name'), layout.name, StorageScope.PROFILE, StorageTarget.MACHINE);
			this.storedLayouts = this.readStoredLayouts();
			this.setActiveLayout(layout.id);
			this._onDidChangeLayouts.fire();

			return layout;
		});
	}

	switchLayout(layout: INamedLayout): Promise<boolean> {
		return this.sequencer.queue(async () => {
			await this.whenRestored;
			if (!this.isEnabled()) {
				return false;
			}
			if (layout.id === this.activeLayoutId) {
				return true;
			}
			if (layout.id !== DEFAULT_NAMED_LAYOUT_ID && !this.hasStoredLayout(layout.id)) {
				return false; // deleted in another window meanwhile
			}

			// Zen mode hides the parts, so the layout that is active is saved as it shows outside of Zen mode
			this.endZenMode();
			if (this.activeLayoutId === DEFAULT_NAMED_LAYOUT_ID) {
				this.storeDefaultLayoutState(this.captureDefaultLayoutState());
			} else {
				this.saveActiveLayout();
			}

			if (layout.id === DEFAULT_NAMED_LAYOUT_ID) {
				this.applyDefaultLayout();
			} else {
				this.applyState(this.readLayoutState(layout.id));
				this.setActiveLayout(layout.id);
			}

			return true;
		});
	}

	saveLayout(): Promise<boolean> {
		return this.sequencer.queue(async () => {
			await this.whenRestored;
			if (!this.isEnabled()) {
				return false;
			}
			this.saveActiveLayout();
			return true;
		});
	}

	renameLayout(layout: INamedLayout, name: string): Promise<boolean> {
		return this.sequencer.queue(async () => {
			if (!this.isEnabled() || !this.hasStoredLayout(layout.id)) {
				return false;
			}

			this.storageService.store(layoutStorageKey(layout.id, 'name'), toLayoutName(name), StorageScope.PROFILE, StorageTarget.MACHINE);
			this.storedLayouts = this.readStoredLayouts();
			this._onDidChangeLayouts.fire();

			return true;
		});
	}

	deleteLayout(layout: INamedLayout): Promise<boolean> {
		return this.sequencer.queue(async () => {
			if (layout.id === DEFAULT_NAMED_LAYOUT_ID) {
				throw new Error('The default layout cannot be deleted.');
			}
			await this.whenRestored;
			if (!this.isEnabled()) {
				return false;
			}

			if (layout.id === this.activeLayoutId) {
				this.endZenMode();
				this.applyDefaultLayout();
			}

			// Other windows stop listing a layout once it has no name, so the name is removed first
			for (const key of ['name', ...NAMED_LAYOUT_STATE_KEYS] as const) {
				this.storageService.remove(layoutStorageKey(layout.id, key), StorageScope.PROFILE);
			}
			this.storedLayouts = this.readStoredLayouts();
			this._onDidChangeLayouts.fire();

			return true;
		});
	}

	private onDidChangeStoredLayouts(): void {
		const layouts = this.layouts;
		this.storedLayouts = this.readStoredLayouts();
		if (!this.storedLayouts.some(layout => layout.id === this.activeLayoutId) && this.activeLayoutId !== DEFAULT_NAMED_LAYOUT_ID) {
			// The active layout was deleted in another window: the window keeps its arrangement as its default layout
			this.setActiveLayout(DEFAULT_NAMED_LAYOUT_ID);
		}
		if (!equals(layouts, this.layouts)) {
			this._onDidChangeLayouts.fire();
		}
	}

	/**
	 * Writes the parts of the active named layout that this window changed since {@link baseline}, each under its own key.
	 * The default layout is what the window shows, so it only drops an editor grid that it kept once the editor groups change.
	 */
	private saveActiveLayout(): void {
		if (!this.baseline) {
			return;
		}

		const baseline = this.baseline;
		if (this.activeLayoutId === DEFAULT_NAMED_LAYOUT_ID) {
			if (getChanges({ editorGroups: this.captureState().editorGroups }, baseline).editorGroups) {
				this.storageService.remove(DEFAULT_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
			}
			return;
		}
		if (!this.hasStoredLayout(this.activeLayoutId)) {
			return;
		}

		const changes = getChanges(this.captureState(), baseline);
		this.storeLayoutState(this.activeLayoutId, changes);
		this.baseline = { ...baseline, ...changes };
	}

	/**
	 * Applies the stored state of the default layout and makes it the active layout. While it is active, its state is what the
	 * window shows, except for an editor grid that does not apply, as an editor cannot move into fewer editor groups: the
	 * default layout keeps that grid until its editor groups change.
	 */
	private applyDefaultLayout(): void {
		const state = this.readDefaultLayoutState();
		const applied = state ? this.applyState(state) : true;
		this.setActiveLayout(DEFAULT_NAMED_LAYOUT_ID);
		if (!applied && state?.editorGroups) {
			this.storeDefaultLayoutState({ editorGroups: state.editorGroups });
		}
	}

	/**
	 * Returns the state of the default layout as the window shows it, with the editor grid that it kept when it could not
	 * apply it, unless the editor groups changed since.
	 */
	private captureDefaultLayoutState(): INamedLayoutState {
		const state = this.captureState();
		const keptEditorGroups = this.readDefaultLayoutState()?.editorGroups;
		if (keptEditorGroups && this.baseline && !getChanges({ editorGroups: state.editorGroups }, this.baseline).editorGroups) {
			return { ...state, editorGroups: keptEditorGroups };
		}
		return state;
	}

	private setActiveLayout(id: string): void {
		this.activeLayoutId = id;
		this.storeActiveLayoutId();
		this.baseline = this.captureState();
		this._onDidChangeActiveLayout.fire(this.activeLayout);
	}

	private captureState(): INamedLayoutState {
		// Zen mode hides the parts: what they show then is not the layout's
		const parts = this.isZenModeActive() ? undefined : this.layoutService.getPartsLayoutState();

		return {
			...(parts ? { sideBar: parts.sideBar, panel: parts.panel, auxiliaryBar: parts.auxiliaryBar } : {}),
			editorGroups: toFractions(this.editorGroupService.mainPart.getLayout())
		};
	}

	/**
	 * Applies what of a state differs from what the window shows, so that the rest, such as the editor grid, stays as it is.
	 */
	private applyChanges(state: INamedLayoutState): void {
		// Changing the editor groups can restore a maximized part, so the parts compare with what shows after that
		const { editorGroups } = getChanges({ editorGroups: state.editorGroups }, this.captureState());
		this.applyState({ editorGroups });

		const { sideBar, panel, auxiliaryBar } = state;
		this.applyState(getChanges({ sideBar, panel, auxiliaryBar }, this.captureState()));
	}

	/**
	 * @returns whether the editor groups of the state applied, which they do not when an editor cannot move into fewer groups.
	 */
	private applyState(state: INamedLayoutState): boolean {
		// Changing the editor groups can restore a maximized part, so the parts apply last
		const editorGroupsApplied = state.editorGroups ? this.editorGroupService.mainPart.applyLayout(state.editorGroups) : true;

		// Zen mode hides the parts: a window that starts in Zen mode applies them when it ends
		const parts = this.isZenModeActive() ? undefined : this.layoutService.getPartsLayoutState();
		if (parts && (state.sideBar || state.panel || state.auxiliaryBar)) {
			this.layoutService.applyPartsLayoutState({
				sideBar: state.sideBar ?? parts.sideBar,
				panel: state.panel ?? parts.panel,
				auxiliaryBar: state.auxiliaryBar ?? parts.auxiliaryBar
			});
		}

		return editorGroupsApplied;
	}

	/**
	 * A window that starts in Zen mode has no parts in its baseline, as Zen mode hides them. When Zen mode ends, it applies the parts
	 * of the active layout, which other windows can have changed meanwhile, and takes them into its baseline, so that saving writes
	 * only the parts that change after that.
	 */
	private onDidEndZenMode(): void {
		if (!this.baseline || this.baseline.sideBar || this.baseline.panel || this.baseline.auxiliaryBar) {
			return;
		}

		if (this.isEnabled() && this.activeLayoutId !== DEFAULT_NAMED_LAYOUT_ID) {
			const { sideBar, panel, auxiliaryBar } = this.readLayoutState(this.activeLayoutId);
			this.applyChanges({ sideBar, panel, auxiliaryBar });
		}

		const { sideBar, panel, auxiliaryBar } = this.captureState();
		this.baseline = { ...this.baseline, sideBar, panel, auxiliaryBar };
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue(NAMED_LAYOUTS_ENABLED_SETTING) === true;
	}

	private isZenModeActive(): boolean {
		return !!InEditorZenModeContext.getValue(this.contextKeyService);
	}

	private endZenMode(): void {
		if (this.isZenModeActive()) {
			this.layoutService.toggleZenMode();
		}
	}

	private readStoredLayouts(): INamedLayout[] {
		const layouts: INamedLayout[] = [];
		for (const key of this.storageService.keys(StorageScope.PROFILE)) {
			const id = key.startsWith(LAYOUT_STORAGE_KEY_PREFIX) && key.endsWith(LAYOUT_NAME_STORAGE_KEY_SUFFIX) ? key.slice(LAYOUT_STORAGE_KEY_PREFIX.length, -LAYOUT_NAME_STORAGE_KEY_SUFFIX.length) : undefined;
			const name = id && id !== DEFAULT_NAMED_LAYOUT_ID ? this.storageService.get(key, StorageScope.PROFILE)?.trim() : undefined;
			if (id && name) {
				layouts.push({ id, name });
			}
		}
		return layouts;
	}

	private hasStoredLayout(id: string): boolean {
		return id !== DEFAULT_NAMED_LAYOUT_ID && !!this.storageService.get(layoutStorageKey(id, 'name'), StorageScope.PROFILE)?.trim();
	}

	private readLayoutState(id: string): INamedLayoutState {
		return toNamedLayoutState(key => parse(this.storageService.get(layoutStorageKey(id, key), StorageScope.PROFILE)));
	}

	private storeLayoutState(id: string, state: INamedLayoutState): void {
		for (const key of NAMED_LAYOUT_STATE_KEYS) {
			const value = state[key];
			if (value) {
				this.storageService.store(layoutStorageKey(id, key), JSON.stringify(value), StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		}
	}

	private storeActiveLayoutId(): void {
		if (this.activeLayoutId === DEFAULT_NAMED_LAYOUT_ID) {
			// While the default layout is active, its state is what the window shows
			this.storageService.remove(ACTIVE_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
			this.storageService.remove(DEFAULT_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			this.storageService.store(ACTIVE_LAYOUT_STORAGE_KEY, this.activeLayoutId, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	private readDefaultLayoutState(): INamedLayoutState | undefined {
		const value = parse(this.storageService.get(DEFAULT_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE));
		return isRecord(value) ? toNamedLayoutState(key => value[key]) : undefined;
	}

	private storeDefaultLayoutState(state: INamedLayoutState): void {
		this.storageService.store(DEFAULT_LAYOUT_STORAGE_KEY, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

function layoutStorageKey(id: string, key: NamedLayoutStateKey | 'name'): string {
	return `${LAYOUT_STORAGE_KEY_PREFIX}${id}.${key}`;
}

function toLayoutName(name: string): string {
	const layoutName = name.trim();
	if (!layoutName) {
		throw new Error('A layout needs a name.');
	}
	return layoutName;
}

/**
 * Returns the layout of editor groups with the sizes of the groups in each row or column as fractions of their sum.
 * Applying a layout sizes the groups in proportion to their sizes. The fractions keep four decimals, so that they
 * still add up to one and applying them gives the same sizes, up to whole pixels.
 */
function toFractions(layout: EditorGroupLayout): EditorGroupLayout {
	const toGroups = (groups: readonly GroupLayoutArgument[]): GroupLayoutArgument[] => {
		const total = groups.reduce((sum, group) => sum + (group.size ?? 0), 0);
		return groups.map(group => ({
			...(total && group.size ? { size: Math.round(group.size / total * 10000) / 10000 } : {}),
			...(group.groups ? { groups: toGroups(group.groups) } : {})
		}));
	};

	return { orientation: layout.orientation, groups: toGroups(layout.groups) };
}

/**
 * Whether two layouts of editor groups have the same rows and columns, with sizes that differ by less than a hundredth,
 * as applying a layout sizes the groups in whole pixels.
 */
function isSameEditorGroupLayout(layout: EditorGroupLayout, other: EditorGroupLayout | undefined): boolean {
	const isSameGroups = (groups: readonly GroupLayoutArgument[], otherGroups: readonly GroupLayoutArgument[] | undefined): boolean => {
		if (!otherGroups || groups.length !== otherGroups.length) {
			return false;
		}
		return groups.every((group, index) => {
			const otherGroup = otherGroups[index];
			return Math.abs((group.size ?? 0) - (otherGroup.size ?? 0)) < 0.01 && (group.groups ? isSameGroups(group.groups, otherGroup.groups) : !otherGroup.groups);
		});
	};

	return !!other && layout.orientation === other.orientation && isSameGroups(layout.groups, other.groups);
}

/**
 * Returns the parts of a state that it has and that differ from another state.
 */
function getChanges(state: INamedLayoutState, other: INamedLayoutState): INamedLayoutState {
	const differs = (key: 'sideBar' | 'panel' | 'auxiliaryBar') => !!state[key] && !equals(state[key], other[key]);

	return {
		...(differs('sideBar') ? { sideBar: state.sideBar } : {}),
		...(differs('panel') ? { panel: state.panel } : {}),
		...(differs('auxiliaryBar') ? { auxiliaryBar: state.auxiliaryBar } : {}),
		...(state.editorGroups && !isSameEditorGroupLayout(state.editorGroups, other.editorGroups) ? { editorGroups: state.editorGroups } : {}),
	};
}

function parse(value: string | undefined): unknown {
	if (!value) {
		return undefined;
	}

	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns the parts of a state that are valid, so that a part that is not valid keeps what it shows when the state applies.
 */
function toNamedLayoutState(read: (key: NamedLayoutStateKey) => unknown): INamedLayoutState {
	const sideBar = read('sideBar');
	const panel = read('panel');
	const auxiliaryBar = read('auxiliaryBar');
	const editorGroups = read('editorGroups');

	return {
		...(isSideBarState(sideBar) ? { sideBar } : {}),
		...(isPanelState(panel) ? { panel } : {}),
		...(isAuxiliaryBarState(auxiliaryBar) ? { auxiliaryBar } : {}),
		...(isEditorGroupLayout(editorGroups) ? { editorGroups } : {}),
	};
}

/** Whether a value is a size that can apply. Stored JSON can have sizes such as `1e999`, which parse as infinite. */
function isSize(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Whether a value has what each part stores. */
function hasPartState(value: unknown): value is Record<string, unknown> {
	return isRecord(value) && typeof value.visible === 'boolean' && isSize(value.size) && (value.viewContainerId === undefined || typeof value.viewContainerId === 'string');
}

function isSideBarState(value: unknown): value is IPartsLayoutState['sideBar'] {
	return hasPartState(value);
}

function isPanelState(value: unknown): value is IPartsLayoutState['panel'] {
	return hasPartState(value) && typeof value.maximized === 'boolean' && [Position.LEFT, Position.RIGHT, Position.BOTTOM, Position.TOP].includes(value.position as Position);
}

function isAuxiliaryBarState(value: unknown): value is IPartsLayoutState['auxiliaryBar'] {
	return hasPartState(value) && typeof value.maximized === 'boolean';
}

function isGroupLayoutArgument(value: unknown): value is GroupLayoutArgument {
	// The grid turns a nested row or column with fewer than two groups into a single group, so the groups in it would not count
	return isRecord(value) && (value.size === undefined || isSize(value.size)) && (value.groups === undefined || isGroupLayoutArguments(value.groups, 2));
}

function isGroupLayoutArguments(value: unknown, minimumLength: number): value is GroupLayoutArgument[] {
	return Array.isArray(value) && value.length >= minimumLength && value.every(isGroupLayoutArgument);
}

function isEditorGroupLayout(value: unknown): value is EditorGroupLayout {
	return isRecord(value) && (value.orientation === GroupOrientation.HORIZONTAL || value.orientation === GroupOrientation.VERTICAL) && isGroupLayoutArguments(value.groups, 1);
}
