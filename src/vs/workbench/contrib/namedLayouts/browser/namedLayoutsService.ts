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
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { DEFAULT_NAMED_LAYOUT_ID, INamedLayout, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING } from './namedLayouts.js';

/** The named layouts of the profile, with their states. Not synced. */
const LAYOUTS_STORAGE_KEY = 'workbench.namedLayouts.layouts';

/** The named layout that is active in the window of a workspace. */
const ACTIVE_LAYOUT_STORAGE_KEY = 'workbench.namedLayouts.activeLayout';

/** The state of the default layout of the window of a workspace while a named layout is active. */
const DEFAULT_LAYOUT_STORAGE_KEY = 'workbench.namedLayouts.defaultLayout';

/**
 * What a layout arranges. Each part is captured and applied on its own, so that saving writes only the parts that a window changed.
 */
interface INamedLayoutState {
	readonly parts?: IPartsLayoutState;

	/**
	 * The editor groups of the main window, with sizes as fractions of their row or column, so that resizing the window does not change them.
	 */
	readonly editorGroups?: EditorGroupLayout;
}

interface IStoredNamedLayout extends INamedLayout {
	readonly state: INamedLayoutState;
}

export class NamedLayoutsService extends Disposable implements INamedLayoutsService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeLayouts = this._register(new Emitter<void>());
	readonly onDidChangeLayouts = this._onDidChangeLayouts.event;

	private readonly _onDidChangeActiveLayout = this._register(new Emitter<INamedLayout>());
	readonly onDidChangeActiveLayout = this._onDidChangeActiveLayout.event;

	private readonly defaultLayout: INamedLayout = { id: DEFAULT_NAMED_LAYOUT_ID, name: localize('defaultLayout', "Default") };

	private storedLayouts: readonly IStoredNamedLayout[];
	private activeLayoutId: string;

	/**
	 * The state of the active layout as this window started with it, applied or saved it last. Saving writes only what differs from it,
	 * so that what another window saved into the same layout meanwhile is kept. Undefined until the window restored its layout.
	 */
	private baseline: INamedLayoutState | undefined;

	/** Switches and other changes of the layouts run one after another. */
	private readonly sequencer = new Sequencer();

	/** Resolves once the parts restored their view containers and the editor groups their editors, as the window starts. */
	private readonly whenRestored: Promise<void>;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILifecycleService lifecycleService: ILifecycleService,
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

		this.whenRestored = Promise.all([lifecycleService.when(LifecyclePhase.Restored), extensionService.whenInstalledExtensionsRegistered()]).then(() => {
			this.baseline = this.captureState();
		});

		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, LAYOUTS_STORAGE_KEY, this._store)(e => {
			if (e.external) {
				this.onDidChangeStoredLayouts();
			}
		}));

		this._register(this.storageService.onWillSaveState(e => {
			if (e.reason === WillSaveStateReason.SHUTDOWN && this.configurationService.getValue(NAMED_LAYOUTS_ENABLED_SETTING) === true) {
				this.saveActiveLayout();
			}
		}));
	}

	get layouts(): readonly INamedLayout[] {
		return [this.defaultLayout, ...this.storedLayouts.map(toNamedLayout).sort((a, b) => a.name.localeCompare(b.name))];
	}

	get activeLayout(): INamedLayout {
		const layout = this.storedLayouts.find(layout => layout.id === this.activeLayoutId);
		return layout ? toNamedLayout(layout) : this.defaultLayout;
	}

	createLayout(name: string): Promise<INamedLayout> {
		return this.sequencer.queue(async () => {
			await this.whenRestored;
			this.endZenMode();

			// The default layout is the window's own layout, so it keeps what the window shows
			const state = this.captureState();
			if (this.activeLayoutId === DEFAULT_NAMED_LAYOUT_ID) {
				this.storeDefaultLayoutState(state);
			}

			const layout: IStoredNamedLayout = { id: generateUuid(), name: toLayoutName(name), state };
			this.writeStoredLayouts([...this.readStoredLayouts(), layout]);
			this.setActiveLayout(layout.id);
			this._onDidChangeLayouts.fire();

			return toNamedLayout(layout);
		});
	}

	switchLayout(layout: INamedLayout): Promise<void> {
		return this.sequencer.queue(async () => {
			await this.whenRestored;
			if (layout.id === this.activeLayoutId) {
				return;
			}

			const state = layout.id === DEFAULT_NAMED_LAYOUT_ID ? this.readDefaultLayoutState() : this.readStoredLayouts().find(storedLayout => storedLayout.id === layout.id)?.state;
			if (!state && layout.id !== DEFAULT_NAMED_LAYOUT_ID) {
				return; // deleted in another window meanwhile
			}

			// Zen mode hides the parts, so the layout that is active is saved as it shows outside of Zen mode
			this.endZenMode();
			if (this.activeLayoutId === DEFAULT_NAMED_LAYOUT_ID) {
				this.storeDefaultLayoutState(this.captureState());
			} else {
				this.saveActiveLayout();
			}

			if (state) {
				this.applyState(state);
			}
			this.setActiveLayout(layout.id);
		});
	}

	saveLayout(): Promise<void> {
		return this.sequencer.queue(async () => {
			await this.whenRestored;
			this.saveActiveLayout();
		});
	}

	renameLayout(layout: INamedLayout, name: string): Promise<void> {
		return this.sequencer.queue(async () => {
			const layouts = this.readStoredLayouts();
			if (layouts.some(storedLayout => storedLayout.id === layout.id)) {
				this.writeStoredLayouts(layouts.map(storedLayout => storedLayout.id === layout.id ? { ...storedLayout, name: toLayoutName(name) } : storedLayout));
				this._onDidChangeLayouts.fire();
			}
		});
	}

	deleteLayout(layout: INamedLayout): Promise<void> {
		return this.sequencer.queue(async () => {
			if (layout.id === DEFAULT_NAMED_LAYOUT_ID) {
				throw new Error('The default layout cannot be deleted.');
			}

			if (layout.id === this.activeLayoutId) {
				await this.whenRestored;
				this.endZenMode();
				const state = this.readDefaultLayoutState();
				if (state) {
					this.applyState(state);
				}
				this.setActiveLayout(DEFAULT_NAMED_LAYOUT_ID);
			}

			this.writeStoredLayouts(this.readStoredLayouts().filter(storedLayout => storedLayout.id !== layout.id));
			this._onDidChangeLayouts.fire();
		});
	}

	private onDidChangeStoredLayouts(): void {
		this.storedLayouts = this.readStoredLayouts();
		if (!this.storedLayouts.some(layout => layout.id === this.activeLayoutId) && this.activeLayoutId !== DEFAULT_NAMED_LAYOUT_ID) {
			// The active layout was deleted in another window: the window keeps its arrangement as its default layout
			this.setActiveLayout(DEFAULT_NAMED_LAYOUT_ID);
		}
		this._onDidChangeLayouts.fire();
	}

	/**
	 * Writes what this window changed of the active named layout since {@link baseline} into the stored layout.
	 */
	private saveActiveLayout(): void {
		if (this.activeLayoutId === DEFAULT_NAMED_LAYOUT_ID || !this.baseline) {
			return;
		}

		const layouts = this.readStoredLayouts();
		const layout = layouts.find(layout => layout.id === this.activeLayoutId);
		if (!layout) {
			return;
		}

		const state = this.captureState();
		const changes: { parts?: IPartsLayoutState; editorGroups?: EditorGroupLayout } = {};
		if (state.parts && !equals(state.parts, this.baseline.parts)) {
			changes.parts = state.parts;
		}
		if (state.editorGroups && !equals(state.editorGroups, this.baseline.editorGroups)) {
			changes.editorGroups = state.editorGroups;
		}
		if (!changes.parts && !changes.editorGroups) {
			return;
		}

		this.writeStoredLayouts(layouts.map(storedLayout => storedLayout === layout ? { ...layout, state: { ...layout.state, ...changes } } : storedLayout));
		this.baseline = { ...this.baseline, ...changes };
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
			...(parts ? { parts } : {}),
			editorGroups: toFractions(this.editorGroupService.mainPart.getLayout())
		};
	}

	private applyState(state: INamedLayoutState): void {
		// Changing the editor groups can restore a maximized part, so the parts apply last
		if (state.editorGroups) {
			this.editorGroupService.mainPart.applyLayout(state.editorGroups);
		}
		if (state.parts) {
			this.layoutService.applyPartsLayoutState(state.parts);
		}
	}

	private isZenModeActive(): boolean {
		return !!InEditorZenModeContext.getValue(this.contextKeyService);
	}

	private endZenMode(): void {
		if (this.isZenModeActive()) {
			this.layoutService.toggleZenMode();
		}
	}

	private readStoredLayouts(): IStoredNamedLayout[] {
		const value = parse(this.storageService.get(LAYOUTS_STORAGE_KEY, StorageScope.PROFILE));
		return Array.isArray(value) ? value.filter(isStoredNamedLayout) : [];
	}

	private writeStoredLayouts(layouts: readonly IStoredNamedLayout[]): void {
		this.storedLayouts = layouts;
		if (layouts.length) {
			this.storageService.store(LAYOUTS_STORAGE_KEY, JSON.stringify(layouts), StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(LAYOUTS_STORAGE_KEY, StorageScope.PROFILE);
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
		return isNamedLayoutState(value) ? value : undefined;
	}

	private storeDefaultLayoutState(state: INamedLayoutState): void {
		this.storageService.store(DEFAULT_LAYOUT_STORAGE_KEY, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

function toNamedLayout(layout: IStoredNamedLayout): INamedLayout {
	return { id: layout.id, name: layout.name };
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
 * Applying a layout sizes the groups in proportion to their sizes.
 */
function toFractions(layout: EditorGroupLayout): EditorGroupLayout {
	const toGroups = (groups: readonly GroupLayoutArgument[]): GroupLayoutArgument[] => {
		const total = groups.reduce((sum, group) => sum + (group.size ?? 0), 0);
		return groups.map(group => ({
			...(total && group.size ? { size: Math.round(group.size / total * 100) / 100 } : {}),
			...(group.groups ? { groups: toGroups(group.groups) } : {})
		}));
	};

	return { orientation: layout.orientation, groups: toGroups(layout.groups) };
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

function isPartState(value: unknown): value is Record<string, unknown> {
	return isRecord(value) && typeof value.visible === 'boolean' && typeof value.size === 'number' && (value.viewContainerId === undefined || typeof value.viewContainerId === 'string');
}

function isPartsLayoutState(value: unknown): value is IPartsLayoutState {
	return isRecord(value)
		&& isPartState(value.sideBar)
		&& isPartState(value.panel) && typeof value.panel.maximized === 'boolean' && [Position.LEFT, Position.RIGHT, Position.BOTTOM, Position.TOP].includes(value.panel.position as Position)
		&& isPartState(value.auxiliaryBar) && typeof value.auxiliaryBar.maximized === 'boolean';
}

function isGroupLayoutArgument(value: unknown): value is GroupLayoutArgument {
	return isRecord(value) && (value.size === undefined || typeof value.size === 'number') && (value.groups === undefined || (Array.isArray(value.groups) && value.groups.every(isGroupLayoutArgument)));
}

function isEditorGroupLayout(value: unknown): value is EditorGroupLayout {
	return isRecord(value) && (value.orientation === GroupOrientation.HORIZONTAL || value.orientation === GroupOrientation.VERTICAL) && Array.isArray(value.groups) && value.groups.length > 0 && value.groups.every(isGroupLayoutArgument);
}

function isNamedLayoutState(value: unknown): value is INamedLayoutState {
	return isRecord(value) && (value.parts === undefined || isPartsLayoutState(value.parts)) && (value.editorGroups === undefined || isEditorGroupLayout(value.editorGroups));
}

function isStoredNamedLayout(value: unknown): value is IStoredNamedLayout {
	return isRecord(value) && typeof value.id === 'string' && value.id !== DEFAULT_NAMED_LAYOUT_ID && typeof value.name === 'string' && !!value.name.trim() && isNamedLayoutState(value.state);
}
