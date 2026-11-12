/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { isObject, isString } from '../../../../base/common/types.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getLayoutOverridableSettings, IWorkbenchConfigurationService } from '../../configuration/common/configuration.js';
import { DEFAULT_NAMED_LAYOUT_ID, INamedLayout, INamedLayoutParticipant, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING } from './namedLayouts.js';

interface IStoredNamedLayout {
	readonly id: string;
	readonly name: string;
	readonly settings: IStringDictionary<unknown>;
	readonly state: IStringDictionary<unknown>;
}

function isStoredNamedLayout(candidate: unknown): candidate is IStoredNamedLayout {
	return isObject(candidate)
		&& isString((candidate as IStoredNamedLayout).id)
		&& isString((candidate as IStoredNamedLayout).name)
		&& isObject((candidate as IStoredNamedLayout).settings)
		&& isObject((candidate as IStoredNamedLayout).state);
}

/**
 * Named layouts are stored in the profile so that they are available in every
 * workspace. The active layout and the state of the default layout are stored
 * per workspace.
 *
 * Changes made while a named layout is active are saved into that layout: its
 * settings are owned by the layout configuration of this window and the state
 * of the participants is captured whenever the storage is saved and before
 * another layout is applied. If two windows use the same named layout, the
 * window that saves last wins.
 */
export class NamedLayoutsService extends Disposable implements INamedLayoutsService {

	declare readonly _serviceBrand: undefined;

	private static readonly LAYOUTS_STORAGE_KEY = 'workbench.namedLayouts';
	private static readonly ACTIVE_LAYOUT_STORAGE_KEY = 'workbench.namedLayouts.active';
	private static readonly DEFAULT_LAYOUT_STATE_STORAGE_KEY = 'workbench.namedLayouts.defaultState';

	private readonly _onDidChangeLayouts = this._register(new Emitter<void>());
	readonly onDidChangeLayouts = this._onDidChangeLayouts.event;

	private readonly _onDidChangeActiveLayout = this._register(new Emitter<INamedLayout>());
	readonly onDidChangeActiveLayout = this._onDidChangeActiveLayout.event;

	private readonly defaultLayout: INamedLayout = { id: DEFAULT_NAMED_LAYOUT_ID, name: localize('defaultLayout', "Default") };
	private readonly participants: INamedLayoutParticipant[] = [];
	private readonly sequencer = new Sequencer();

	private storedLayouts: IStoredNamedLayout[];
	private _activeLayout: INamedLayout;
	private isApplying = false;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchConfigurationService private readonly configurationService: IWorkbenchConfigurationService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.storedLayouts = this.loadLayouts();
		this._activeLayout = this.restoreActiveLayout();

		this._register(this.storageService.onWillSaveState(() => this.saveActiveLayout()));
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, NamedLayoutsService.LAYOUTS_STORAGE_KEY, this._store)(() => this.onDidChangeStoredLayouts()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NAMED_LAYOUTS_ENABLED_SETTING) && !this.isEnabled()) {
				this.queueSwitchToDefaultLayout(true);
			}
		}));
	}

	get layouts(): readonly INamedLayout[] {
		const namedLayouts = this.storedLayouts
			.map(({ id, name }) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name));
		return [this.defaultLayout, ...namedLayouts];
	}

	get activeLayout(): INamedLayout {
		return this._activeLayout;
	}

	registerParticipant(participant: INamedLayoutParticipant): IDisposable {
		if (this.participants.some(candidate => candidate.id === participant.id)) {
			throw new Error(`A named layout participant with the id '${participant.id}' is already registered.`);
		}

		this.participants.push(participant);

		return toDisposable(() => {
			const index = this.participants.indexOf(participant);
			if (index !== -1) {
				this.participants.splice(index, 1);
			}
		});
	}

	createLayout(name: string): Promise<INamedLayout> {
		return this.sequencer.queue(async () => {
			const layoutName = name.trim();
			if (!layoutName) {
				throw new Error('The name of a named layout must not be empty.');
			}
			if (this.layouts.some(layout => layout.name.toLowerCase() === layoutName.toLowerCase())) {
				throw new Error(`A layout with the name '${layoutName}' already exists.`);
			}

			this.saveOutgoingLayout();

			// A new layout defines all layout overridable settings so that
			// changing any of them while the layout is active updates the layout
			const settings: IStringDictionary<unknown> = {};
			for (const key of getLayoutOverridableSettings()) {
				settings[key] = this.configurationService.getValue(key);
			}

			const layout: IStoredNamedLayout = { id: generateUuid(), name: layoutName, settings, state: this.captureState() };
			this.storedLayouts = [...this.storedLayouts, layout];
			this.storeLayouts();

			this.configurationService.setLayoutConfiguration(layout.settings);
			this.setActiveLayout(layout);
			this._onDidChangeLayouts.fire();

			return this._activeLayout;
		});
	}

	switchLayout(layout: INamedLayout): Promise<void> {
		return this.sequencer.queue(() => this.doSwitchLayout(layout, true));
	}

	deleteLayout(layout: INamedLayout): Promise<void> {
		return this.sequencer.queue(async () => {
			if (layout.id === DEFAULT_NAMED_LAYOUT_ID) {
				throw new Error('The default layout cannot be deleted.');
			}

			// No need to save the layout that is about to be deleted
			if (this._activeLayout.id === layout.id) {
				await this.doSwitchLayout(this.defaultLayout, false);
			}

			const storedLayouts = this.storedLayouts.filter(candidate => candidate.id !== layout.id);
			if (storedLayouts.length !== this.storedLayouts.length) {
				this.storedLayouts = storedLayouts;
				this.storeLayouts();
				this._onDidChangeLayouts.fire();
			}
		});
	}

	/**
	 * Must only be called from a task of the sequencer.
	 */
	private async doSwitchLayout(layout: INamedLayout, saveOutgoingLayout: boolean): Promise<void> {
		if (layout.id === this._activeLayout.id) {
			return;
		}

		const storedLayout = layout.id === DEFAULT_NAMED_LAYOUT_ID ? undefined : this.getStoredLayout(layout.id);
		if (layout.id !== DEFAULT_NAMED_LAYOUT_ID && !storedLayout) {
			throw new Error(`Unknown named layout '${layout.id}'.`);
		}

		if (saveOutgoingLayout) {
			this.saveOutgoingLayout();
		}

		// Apply settings first because participants may depend on them
		this.configurationService.setLayoutConfiguration(storedLayout?.settings ?? {});
		this.setActiveLayout(storedLayout ?? this.defaultLayout);
		await this.applyState(storedLayout ? storedLayout.state : this.loadDefaultLayoutState());
	}

	private queueSwitchToDefaultLayout(saveOutgoingLayout: boolean): void {
		this.sequencer.queue(() => this.doSwitchLayout(this.defaultLayout, saveOutgoingLayout))
			.catch(error => this.logService.error('[named layouts] Failed to switch to the default layout.', error));
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(NAMED_LAYOUTS_ENABLED_SETTING) === true;
	}

	private restoreActiveLayout(): INamedLayout {
		const activeLayoutId = this.storageService.get(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
		const storedLayout = activeLayoutId && this.isEnabled() ? this.getStoredLayout(activeLayoutId) : undefined;
		if (!storedLayout) {
			this.storageService.remove(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
			return this.defaultLayout;
		}

		// The workbench restores the state of the participants itself,
		// only the settings of the layout need to be restored
		this.configurationService.setLayoutConfiguration(storedLayout.settings);

		return { id: storedLayout.id, name: storedLayout.name };
	}

	private setActiveLayout(layout: INamedLayout): void {
		if (layout.id === DEFAULT_NAMED_LAYOUT_ID) {
			this._activeLayout = this.defaultLayout;
			this.storageService.remove(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			this._activeLayout = { id: layout.id, name: layout.name };
			this.storageService.store(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, layout.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}

		this._onDidChangeActiveLayout.fire(this._activeLayout);
	}

	private saveOutgoingLayout(): void {
		if (this._activeLayout.id === DEFAULT_NAMED_LAYOUT_ID) {
			const state = { ...this.loadDefaultLayoutState(), ...this.captureState() };
			this.storageService.store(NamedLayoutsService.DEFAULT_LAYOUT_STATE_STORAGE_KEY, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.saveActiveLayout();
		}
	}

	private saveActiveLayout(): void {
		if (this.isApplying) {
			return; // do not save a partially applied layout
		}

		// The workbench persists the state of the default layout itself
		const activeLayout = this.getStoredLayout(this._activeLayout.id);
		if (!activeLayout) {
			return;
		}

		const updatedLayout: IStoredNamedLayout = {
			...activeLayout,
			settings: this.configurationService.getLayoutConfiguration(),
			state: { ...activeLayout.state, ...this.captureState() }
		};
		if (!equals(updatedLayout, activeLayout)) {
			this.storedLayouts = this.storedLayouts.map(candidate => candidate.id === updatedLayout.id ? updatedLayout : candidate);
			this.storeLayouts();
		}
	}

	private captureState(): IStringDictionary<unknown> {
		const state: IStringDictionary<unknown> = {};
		for (const participant of this.participants) {
			try {
				state[participant.id] = participant.capture();
			} catch (error) {
				this.logService.error(`[named layouts] Failed to capture the state of participant '${participant.id}'.`, error);
			}
		}
		return state;
	}

	private async applyState(state: IStringDictionary<unknown>): Promise<void> {
		this.isApplying = true;
		try {
			for (const participant of [...this.participants]) {
				const participantState = state[participant.id];
				if (participantState === undefined) {
					continue;
				}
				try {
					await participant.apply(participantState);
				} catch (error) {
					this.logService.error(`[named layouts] Failed to apply the state of participant '${participant.id}'.`, error);
				}
			}
		} finally {
			this.isApplying = false;
		}
	}

	private onDidChangeStoredLayouts(): void {
		const storedLayouts = this.loadLayouts();
		if (equals(storedLayouts, this.storedLayouts)) {
			return; // changed by this window
		}

		this.storedLayouts = storedLayouts;
		this._onDidChangeLayouts.fire();

		// The active layout was deleted in another window or does not exist in the
		// profile this window switched to. Restore the default layout including the
		// state of its participants, so that the next switch does not save the state
		// of the deleted layout as the state of the default layout.
		if (this._activeLayout.id !== DEFAULT_NAMED_LAYOUT_ID && !this.getStoredLayout(this._activeLayout.id)) {
			this.queueSwitchToDefaultLayout(false);
		}
	}

	private getStoredLayout(id: string): IStoredNamedLayout | undefined {
		return this.storedLayouts.find(layout => layout.id === id);
	}

	private loadLayouts(): IStoredNamedLayout[] {
		const value = this.storageService.get(NamedLayoutsService.LAYOUTS_STORAGE_KEY, StorageScope.PROFILE);
		if (!value) {
			return [];
		}

		try {
			const layouts: unknown = JSON.parse(value);
			return Array.isArray(layouts) ? layouts.filter(isStoredNamedLayout) : [];
		} catch (error) {
			this.logService.error('[named layouts] Failed to parse the stored named layouts.', error);
			return [];
		}
	}

	private storeLayouts(): void {
		if (this.storedLayouts.length) {
			this.storageService.store(NamedLayoutsService.LAYOUTS_STORAGE_KEY, JSON.stringify(this.storedLayouts), StorageScope.PROFILE, StorageTarget.USER);
		} else {
			this.storageService.remove(NamedLayoutsService.LAYOUTS_STORAGE_KEY, StorageScope.PROFILE);
		}
	}

	private loadDefaultLayoutState(): IStringDictionary<unknown> {
		const value = this.storageService.get(NamedLayoutsService.DEFAULT_LAYOUT_STATE_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!value) {
			return {};
		}

		try {
			const state: unknown = JSON.parse(value);
			return isObject(state) ? state as IStringDictionary<unknown> : {};
		} catch (error) {
			this.logService.error('[named layouts] Failed to parse the stored state of the default layout.', error);
			return {};
		}
	}
}

// Eager because the workbench layout requests the service before it initializes
// its state, so that the settings of the active named layout are restored first
registerSingleton(INamedLayoutsService, NamedLayoutsService, InstantiationType.Eager);
