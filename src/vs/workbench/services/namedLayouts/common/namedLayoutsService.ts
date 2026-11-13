/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals, mixin } from '../../../../base/common/objects.js';
import { isObject, isString } from '../../../../base/common/types.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getLayoutOverridableSettings, isLayoutOverridableSetting, IWorkbenchConfigurationService } from '../../configuration/common/configuration.js';
import { DEFAULT_NAMED_LAYOUT_ID, IContributedNamedLayout, INamedLayout, INamedLayoutDefinition, INamedLayoutParticipant, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING } from './namedLayouts.js';

interface IStoredNamedLayout {
	readonly id: string;
	readonly name: string;
	readonly settings: IStringDictionary<unknown>;
	readonly state: IStringDictionary<unknown>;

	/**
	 * Set for the saved changes of a layout contributed by an extension.
	 */
	readonly contribution?: IStoredNamedLayoutContribution;
}

interface IStoredNamedLayoutContribution {
	readonly extensionId: string;
	readonly id: string;
}

function isStoredNamedLayout(candidate: unknown): candidate is IStoredNamedLayout {
	if (!isObject(candidate)) {
		return false;
	}

	const { id, name, settings, state, contribution } = candidate as IStoredNamedLayout;
	return isString(id)
		&& isString(name)
		&& isObject(settings)
		&& isObject(state)
		&& (contribution === undefined || (isObject(contribution) && isString(contribution.extensionId) && isString(contribution.id)));
}

function getContributedLayoutId(extensionId: string, id: string): string {
	return `${ExtensionIdentifier.toKey(extensionId)}/${id}`;
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
 *
 * A layout contributed by an extension starts from its definition the first
 * time it becomes active. Its changes are then saved like the changes of other
 * named layouts, in a stored layout that refers to the contribution.
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
	private activeLayoutId: string;
	private isApplying = false;

	private contributedLayouts = new Map<string, IContributedNamedLayout>();

	/**
	 * Whether the layouts that extensions contribute are known. Until then a stored
	 * layout that refers to a contribution represents the contributed layout.
	 */
	private contributedLayoutsKnown = false;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchConfigurationService private readonly configurationService: IWorkbenchConfigurationService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.storedLayouts = this.loadLayouts();
		this.activeLayoutId = this.restoreActiveLayout();

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
			.filter(layout => !layout.contribution)
			.map(({ id, name }) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name));
		const contributedLayouts = [...this.contributedLayouts.keys()]
			.map(id => this.getLayout(id))
			.filter((layout): layout is INamedLayout => !!layout)
			.sort((a, b) => (a.contribution?.extensionName ?? '').localeCompare(b.contribution?.extensionName ?? '') || a.name.localeCompare(b.name));
		return [this.defaultLayout, ...namedLayouts, ...contributedLayouts];
	}

	get activeLayout(): INamedLayout {
		return this.getLayout(this.activeLayoutId) ?? this.defaultLayout;
	}

	registerParticipant(participant: INamedLayoutParticipant): IDisposable {
		if (this.participants.some(candidate => candidate.id === participant.id)) {
			throw new Error(`A named layout participant with the id '${participant.id}' is already registered.`);
		}

		this.participants.push(participant);

		// A participant that shares its state with the default layout may still use the
		// local copy of a named layout that no longer exists, or may not use a local copy
		// for a layout saved before the participant existed
		if (participant.applyDefault) {
			this.sequencer.queue(async () => {
				if (this.participants.includes(participant)) {
					await this.applyLayoutState(this.getStoredLayout(this.activeLayoutId), [participant]);
				}
			}).catch(error => this.logService.error(`[named layouts] Failed to restore the state of participant '${participant.id}'.`, error));
		}

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
			const layout: IStoredNamedLayout = { id: generateUuid(), name: layoutName, settings: this.captureSettings(), state: this.captureState() };
			this.storedLayouts = [...this.storedLayouts, layout];
			this.storeLayouts();

			this.configurationService.setLayoutConfiguration(layout.settings);
			this.setActiveLayout(layout.id);
			this._onDidChangeLayouts.fire();

			// Participants that share their state with the default layout switch to a local copy
			await this.applyLayoutState(layout, this.participants.filter(participant => participant.applyDefault));

			return this.activeLayout;
		});
	}

	switchLayout(layout: INamedLayout): Promise<void> {
		return this.sequencer.queue(() => this.doSwitchLayout(layout.id, true));
	}

	deleteLayout(layout: INamedLayout): Promise<void> {
		return this.sequencer.queue(async () => {
			if (layout.id === DEFAULT_NAMED_LAYOUT_ID) {
				throw new Error('The default layout cannot be deleted.');
			}
			if (this.contributedLayouts.has(layout.id) || this.getStoredLayout(layout.id)?.contribution) {
				throw new Error('A layout contributed by an extension cannot be deleted.');
			}

			// No need to save the layout that is about to be deleted
			if (this.activeLayoutId === layout.id) {
				await this.doSwitchLayout(DEFAULT_NAMED_LAYOUT_ID, false);
			}

			if (this.removeStoredLayout(layout.id)) {
				this._onDidChangeLayouts.fire();
			}
		});
	}

	resetLayout(layout: INamedLayout): Promise<void> {
		return this.sequencer.queue(async () => {
			const contributedLayout = this.contributedLayouts.get(layout.id);
			if (!contributedLayout) {
				throw new Error(`Unknown contributed layout '${layout.id}'.`);
			}

			this.removeStoredLayout(layout.id);
			if (this.activeLayoutId === layout.id) {
				await this.applyContributedLayout(layout.id, contributedLayout);
			} else {
				this._onDidChangeLayouts.fire();
			}
		});
	}

	setContributedLayouts(layouts: readonly IContributedNamedLayout[]): void {
		this.contributedLayouts = new Map(layouts.map(layout => [getContributedLayoutId(layout.extensionId, layout.id), layout]));
		this.contributedLayoutsKnown = true;
		this._onDidChangeLayouts.fire();

		// Switch to the default layout if the extension that contributes the active
		// layout is no longer installed or no longer contributes it. Its saved changes
		// are kept in case the extension contributes it again.
		if (this.getStoredLayout(this.activeLayoutId)?.contribution && !this.contributedLayouts.has(this.activeLayoutId)) {
			this.queueSwitchToDefaultLayout(true);
		}
	}

	captureDefinition(): INamedLayoutDefinition {
		const settings: IStringDictionary<unknown> = {};
		for (const key of getLayoutOverridableSettings()) {
			const value = this.configurationService.getValue(key);
			if (!equals(value, this.configurationService.inspect(key).defaultValue)) {
				settings[key] = value;
			}
		}

		const definition: INamedLayoutDefinition = Object.keys(settings).length ? { settings } : {};
		for (const participant of this.participants) {
			try {
				const participantDefinition = participant.captureDefinition?.();
				if (participantDefinition) {
					mixin(definition, participantDefinition, true);
				}
			} catch (error) {
				this.logService.error(`[named layouts] Failed to describe the state of participant '${participant.id}'.`, error);
			}
		}
		return definition;
	}

	/**
	 * Must only be called from a task of the sequencer.
	 */
	private async doSwitchLayout(layoutId: string, saveOutgoingLayout: boolean): Promise<void> {
		if (layoutId === this.activeLayoutId) {
			return;
		}

		const contributedLayout = this.contributedLayouts.get(layoutId);
		const storedLayout = layoutId === DEFAULT_NAMED_LAYOUT_ID ? undefined : this.getStoredLayout(layoutId);
		if (layoutId !== DEFAULT_NAMED_LAYOUT_ID && !contributedLayout && (!storedLayout || storedLayout.contribution)) {
			throw new Error(`Unknown named layout '${layoutId}'.`);
		}

		if (saveOutgoingLayout) {
			this.saveOutgoingLayout();
		}

		if (contributedLayout && !storedLayout) {
			await this.applyContributedLayout(layoutId, contributedLayout);
			return;
		}

		// Apply settings first because participants may depend on them
		this.configurationService.setLayoutConfiguration(storedLayout?.settings ?? {});
		this.setActiveLayout(storedLayout?.id ?? DEFAULT_NAMED_LAYOUT_ID);
		await this.applyLayoutState(storedLayout, [...this.participants]);
	}

	/**
	 * Applies the definition of a contributed layout that has no saved changes and
	 * saves the result as the changes of the layout. Must only be called from a task
	 * of the sequencer.
	 */
	private async applyContributedLayout(layoutId: string, contributedLayout: IContributedNamedLayout): Promise<void> {
		const { definition } = contributedLayout;

		// Settings the definition does not specify have the values of the default layout.
		// The layout defines all layout overridable settings so that changing any of them
		// while the layout is active updates the layout
		this.configurationService.setLayoutConfiguration({});
		const settings = this.captureSettings();
		for (const [key, value] of Object.entries(definition.settings ?? {})) {
			if (isLayoutOverridableSetting(key)) {
				settings[key] = value;
			}
		}
		this.configurationService.setLayoutConfiguration(settings);
		this.setActiveLayout(layoutId);

		const defaultState = this.loadDefaultLayoutState();
		this.isApplying = true;
		try {
			for (const participant of [...this.participants]) {
				try {
					if (participant.applyDefinition) {
						await participant.applyDefinition(definition, defaultState[participant.id]);
					} else if (participant.applyDefault) {
						await participant.applyDefault();
					} else if (defaultState[participant.id] !== undefined) {
						await participant.apply(defaultState[participant.id]);
					}
				} catch (error) {
					this.logService.error(`[named layouts] Failed to apply the definition of layout '${layoutId}' to participant '${participant.id}'.`, error);
				}
			}
		} finally {
			this.isApplying = false;
		}

		const layout: IStoredNamedLayout = {
			id: layoutId,
			name: contributedLayout.label,
			settings,
			state: this.captureState(),
			contribution: { extensionId: contributedLayout.extensionId, id: contributedLayout.id }
		};
		this.storedLayouts = [...this.storedLayouts, layout];
		this.storeLayouts();
		this._onDidChangeLayouts.fire();

		// Participants that share their state with the default layout switch to a local copy
		await this.applyLayoutState(layout, this.participants.filter(participant => participant.applyDefault && !participant.applyDefinition));
	}

	private queueSwitchToDefaultLayout(saveOutgoingLayout: boolean): void {
		this.sequencer.queue(() => this.doSwitchLayout(DEFAULT_NAMED_LAYOUT_ID, saveOutgoingLayout))
			.catch(error => this.logService.error('[named layouts] Failed to switch to the default layout.', error));
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(NAMED_LAYOUTS_ENABLED_SETTING) === true;
	}

	private getLayout(layoutId: string): INamedLayout | undefined {
		if (layoutId === DEFAULT_NAMED_LAYOUT_ID) {
			return this.defaultLayout;
		}

		const storedLayout = this.getStoredLayout(layoutId);
		const contributedLayout = this.contributedLayouts.get(layoutId);
		if (contributedLayout) {
			const { extensionId, extensionName, id, label } = contributedLayout;
			return { id: layoutId, name: label, contribution: { extensionId, extensionName, id, canReset: !!storedLayout } };
		}

		if (!storedLayout) {
			return undefined;
		}

		if (storedLayout.contribution) {
			// Until the contributed layouts are known, the saved changes represent the layout
			const { extensionId, id } = storedLayout.contribution;
			return this.contributedLayoutsKnown ? undefined : { id: layoutId, name: storedLayout.name, contribution: { extensionId, extensionName: extensionId, id, canReset: true } };
		}

		return { id: storedLayout.id, name: storedLayout.name };
	}

	private restoreActiveLayout(): string {
		const activeLayoutId = this.storageService.get(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
		const storedLayout = activeLayoutId && this.isEnabled() ? this.getStoredLayout(activeLayoutId) : undefined;
		if (!storedLayout) {
			this.storageService.remove(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
			return DEFAULT_NAMED_LAYOUT_ID;
		}

		// The workbench restores the state of the participants itself, participants
		// that share their state with the default layout are restored when they register.
		// Only the settings of the layout need to be restored here
		this.configurationService.setLayoutConfiguration(storedLayout.settings);

		return storedLayout.id;
	}

	private setActiveLayout(layoutId: string): void {
		if (layoutId === DEFAULT_NAMED_LAYOUT_ID) {
			this.storageService.remove(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			this.storageService.store(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, layoutId, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}

		if (this.activeLayoutId !== layoutId) {
			this.activeLayoutId = layoutId;
			this._onDidChangeActiveLayout.fire(this.activeLayout);
		}
	}

	private saveOutgoingLayout(): void {
		if (this.activeLayoutId === DEFAULT_NAMED_LAYOUT_ID) {
			// The state that the default layout shares with other windows is stored by its owners
			const state = { ...this.loadDefaultLayoutState(), ...this.captureState(participant => !participant.applyDefault) };
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
		const activeLayout = this.getStoredLayout(this.activeLayoutId);
		const contributedLayout = this.contributedLayouts.get(this.activeLayoutId);
		if (!activeLayout && !contributedLayout) {
			return;
		}

		// The saved changes of an active contributed layout are recreated if another window reset the layout
		const contribution = activeLayout?.contribution ?? (contributedLayout ? { extensionId: contributedLayout.extensionId, id: contributedLayout.id } : undefined);
		const updatedLayout: IStoredNamedLayout = {
			id: this.activeLayoutId,
			name: contributedLayout?.label ?? activeLayout?.name ?? this.activeLayoutId,
			settings: this.configurationService.getLayoutConfiguration(),
			state: { ...activeLayout?.state, ...this.captureState() },
			...(contribution ? { contribution } : {})
		};
		if (!activeLayout) {
			this.storedLayouts = [...this.storedLayouts, updatedLayout];
			this.storeLayouts();
			this._onDidChangeLayouts.fire();
		} else if (!equals(updatedLayout, activeLayout)) {
			this.storedLayouts = this.storedLayouts.map(candidate => candidate.id === updatedLayout.id ? updatedLayout : candidate);
			this.storeLayouts();
		}
	}

	private captureSettings(): IStringDictionary<unknown> {
		const settings: IStringDictionary<unknown> = {};
		for (const key of getLayoutOverridableSettings()) {
			settings[key] = this.configurationService.getValue(key);
		}
		return settings;
	}

	private captureState(filter: (participant: INamedLayoutParticipant) => boolean = () => true): IStringDictionary<unknown> {
		const state: IStringDictionary<unknown> = {};
		for (const participant of this.participants.filter(filter)) {
			try {
				state[participant.id] = participant.capture();
			} catch (error) {
				this.logService.error(`[named layouts] Failed to capture the state of participant '${participant.id}'.`, error);
			}
		}
		return state;
	}

	/**
	 * Applies the state of the given named layout, or of the default layout if no
	 * layout is given, to the given participants. Must only be called from a task
	 * of the sequencer.
	 */
	private async applyLayoutState(layout: IStoredNamedLayout | undefined, participants: readonly INamedLayoutParticipant[]): Promise<void> {
		const state = layout ? layout.state : this.loadDefaultLayoutState();
		this.isApplying = true;
		try {
			for (const participant of participants) {
				try {
					if (!layout && participant.applyDefault) {
						await participant.applyDefault();
						continue;
					}

					// A layout saved before a participant that shares its state with the
					// default layout existed starts with a copy of the current state
					const participantState = state[participant.id] ?? (participant.applyDefault ? participant.capture() : undefined);
					if (participantState !== undefined) {
						await participant.apply(participantState);
					}
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

		if (this.activeLayoutId === DEFAULT_NAMED_LAYOUT_ID || this.getStoredLayout(this.activeLayoutId)) {
			return;
		}

		// Another window reset the active contributed layout. This window keeps using it.
		if (this.contributedLayouts.has(this.activeLayoutId)) {
			this.saveActiveLayout();
			return;
		}

		// The active layout was deleted in another window or does not exist in the
		// profile this window switched to. Restore the default layout including the
		// state of its participants, so that the next switch does not save the state
		// of the deleted layout as the state of the default layout.
		this.queueSwitchToDefaultLayout(false);
	}

	private getStoredLayout(id: string): IStoredNamedLayout | undefined {
		return this.storedLayouts.find(layout => layout.id === id);
	}

	private removeStoredLayout(id: string): boolean {
		const storedLayouts = this.storedLayouts.filter(candidate => candidate.id !== id);
		if (storedLayouts.length === this.storedLayouts.length) {
			return false;
		}

		this.storedLayouts = storedLayouts;
		this.storeLayouts();
		return true;
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
