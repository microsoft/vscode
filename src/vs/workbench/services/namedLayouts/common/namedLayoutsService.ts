/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, RunOnceScheduler, Sequencer } from '../../../../base/common/async.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Emitter } from '../../../../base/common/event.js';
import { hash } from '../../../../base/common/hash.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { equals, mixin } from '../../../../base/common/objects.js';
import { isEqual } from '../../../../base/common/resources.js';
import * as semver from '../../../../base/common/semver/semver.js';
import { isNumber, isObject, isString } from '../../../../base/common/types.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode, IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getLayoutOverridableSettings, ILayoutSettings, isLayoutOverridableSetting, IWorkbenchConfigurationService } from '../../configuration/common/configuration.js';
import { parseLayoutSettings } from '../../configuration/common/configurationModels.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
import { ILifecycleService, LifecyclePhase } from '../../lifecycle/common/lifecycle.js';
import { getLayoutSettingsResource, LAYOUT_SETTINGS_SCHEME, LayoutSettingsFileSystemProvider } from './layoutSettingsFileSystemProvider.js';
import { DEFAULT_NAMED_LAYOUT_ID, IContributedNamedLayout, INamedLayout, INamedLayoutDefinition, INamedLayoutParticipant, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING } from './namedLayouts.js';

/**
 * A named layout as this window knows it.
 */
interface IStoredNamedLayout {
	readonly id: string;
	readonly name: string;

	/**
	 * The content of the settings file of the layout, JSON with comments.
	 */
	readonly settings: string;

	/**
	 * The state of the participants on this machine, `undefined` if the layout was not active on
	 * this machine since its changes were saved, for example on another machine.
	 */
	readonly state: IStringDictionary<unknown> | undefined;

	/**
	 * Set for the saved changes of a layout contributed by an extension.
	 */
	readonly contribution?: IStoredNamedLayoutContribution;
}

/**
 * The part of a named layout that Settings Sync synchronizes, stored under its own key.
 */
interface ISyncedNamedLayout {
	readonly name: string;
	readonly settings: string;
	readonly contribution?: IStoredNamedLayoutContribution;
}

interface IStoredNamedLayoutContribution {
	readonly extensionId: string;
	readonly id: string;

	/**
	 * Whether the extension locked the layout. Known before the contributions are.
	 */
	readonly locked?: boolean;

	/**
	 * The hash of the definition and the version of the extension the saved changes are based on.
	 */
	readonly definitionHash?: number;
	readonly extensionVersion?: string;
}

function isStoredContribution(candidate: unknown): candidate is IStoredNamedLayoutContribution {
	if (!isObject(candidate)) {
		return false;
	}

	const { extensionId, id, locked, definitionHash, extensionVersion } = candidate as IStoredNamedLayoutContribution;
	return isString(extensionId)
		&& isString(id)
		&& (locked === undefined || typeof locked === 'boolean')
		&& (definitionHash === undefined || isNumber(definitionHash))
		&& (extensionVersion === undefined || isString(extensionVersion));
}

function toStoredNamedLayout(id: string, candidate: unknown, state: IStringDictionary<unknown> | undefined): IStoredNamedLayout | undefined {
	if (!isObject(candidate)) {
		return undefined;
	}

	const { name, contribution } = candidate as ISyncedNamedLayout;
	const settings: unknown = (candidate as ISyncedNamedLayout).settings;
	if (!isString(name) || !(isString(settings) || isObject(settings)) || (contribution !== undefined && !isStoredContribution(contribution))) {
		return undefined;
	}

	// Layouts stored before the content of their settings file was stored have the settings themselves
	return { id, name, settings: isString(settings) ? settings : toSettingsContent(settings), state, ...(contribution ? { contribution } : {}) };
}

function toSettingsContent(settings: object): string {
	return JSON.stringify(settings, null, '\t');
}

function getContributedLayoutId(extensionId: string, id: string): string {
	return `${ExtensionIdentifier.toKey(extensionId)}/${id}`;
}

/**
 * Identifies a definition of a layout. It does not depend on the order of the keys of the definition.
 */
function getDefinitionHash({ definition }: IContributedNamedLayout): number {
	return hash(definition);
}

/**
 * The settings and the state of the participants of a layout at some point in time.
 */
interface ILayoutSnapshot {
	readonly settings: IStringDictionary<unknown>;
	readonly state: IStringDictionary<unknown>;
}

/**
 * Named layouts are stored in the profile so that they are available in every
 * workspace. Each layout and each lock of a layout is stored under its own key,
 * so that Settings Sync merges the changes made to different layouts on
 * different machines. The state of the participants of a named layout is
 * stored per machine and is not synchronized: a layout synchronized from
 * another machine keeps the arrangement of the window, or starts from its
 * definition if an extension contributes it, the first time it becomes active
 * on a machine. The active layout and the state of the default layout are
 * stored per workspace.
 *
 * The settings of a named layout are stored with the layout. A file system
 * provider shows them as the settings file of the layout, which the
 * configuration service reads and watches for the active layout, and which
 * editors show. So changes made in any window apply to all windows that use the
 * layout. Changes to the state of the participants made while a named layout
 * is active are saved into that layout whenever the storage is saved and before
 * another layout is applied. If two windows use the same named layout, the
 * window that saves last wins.
 *
 * A layout contributed by an extension follows its definition until it is
 * changed: whenever it becomes active, its definition is applied. Once it is
 * changed, its changes are saved like the changes of other named layouts, in a
 * stored layout that refers to the contribution and to the definition the
 * changes are based on. If the extension changes the definition later, the
 * layout reports the update, which can be applied or ignored. While the
 * active layout of an extension is not changed, its settings and the
 * contribution it refers to are stored with the active layout, so that the
 * layout can be restored before the contributions of extensions are known.
 *
 * The settings of a locked layout cannot be changed. Other changes made to a
 * locked layout are not saved. They are discarded when another layout becomes
 * active, and the saved state of a locked layout is applied again after the
 * window reloads. A layout that its extension locked always starts from its
 * definition when it becomes active. Changes made to the active locked layout,
 * and to the active layout of an extension that was not changed, are detected
 * against its state once the window settled after it was applied, locked or
 * reverted.
 *
 * If the layout that was active when the window closed no longer exists when it
 * reopens, the saved state of the default layout is applied.
 */
export class NamedLayoutsService extends Disposable implements INamedLayoutsService {

	declare readonly _serviceBrand: undefined;

	/**
	 * Stored named layouts, each under this prefix followed by its identifier. Synchronized.
	 */
	private static readonly LAYOUT_STORAGE_KEY_PREFIX = 'workbench.namedLayouts.layout.';

	/**
	 * The state of the participants of named layouts on this machine, each under this prefix
	 * followed by the identifier of its layout. Not synchronized.
	 */
	private static readonly LAYOUT_STATE_STORAGE_KEY_PREFIX = 'workbench.namedLayouts.state.';

	/**
	 * Layouts that users locked, each under this prefix followed by its identifier. Synchronized.
	 */
	private static readonly LOCKED_LAYOUT_STORAGE_KEY_PREFIX = 'workbench.namedLayouts.locked.';

	/**
	 * Where all named layouts and all locked layouts were stored before each was stored under its own key.
	 */
	private static readonly LEGACY_LAYOUTS_STORAGE_KEY = 'workbench.namedLayouts';
	private static readonly LEGACY_LOCKED_LAYOUTS_STORAGE_KEY = 'workbench.namedLayouts.locked';

	private static readonly ACTIVE_LAYOUT_STORAGE_KEY = 'workbench.namedLayouts.active';

	/**
	 * The active layout of an extension while it was not changed, stored per workspace.
	 */
	private static readonly ACTIVE_CONTRIBUTED_LAYOUT_STORAGE_KEY = 'workbench.namedLayouts.activeContributedLayout';
	private static readonly DEFAULT_LAYOUT_STATE_STORAGE_KEY = 'workbench.namedLayouts.defaultState';
	private static readonly EMPTY_SETTINGS = '{}';

	/**
	 * How long the window must not change before its state is taken as the state of
	 * an applied locked layout, and before changes to that state are detected.
	 */
	private static readonly CHANGE_DETECTION_DELAY = 200;

	private readonly _onDidChangeLayouts = this._register(new Emitter<void>());
	readonly onDidChangeLayouts = this._onDidChangeLayouts.event;

	private readonly _onDidChangeActiveLayout = this._register(new Emitter<INamedLayout>());
	readonly onDidChangeActiveLayout = this._onDidChangeActiveLayout.event;

	private readonly _onDidChangeActiveLayoutModified = this._register(new Emitter<void>());
	readonly onDidChangeActiveLayoutModified = this._onDidChangeActiveLayoutModified.event;

	private readonly defaultLayout: INamedLayout = { id: DEFAULT_NAMED_LAYOUT_ID, name: localize('defaultLayout', "Default") };
	private readonly participants: INamedLayoutParticipant[] = [];
	private readonly sequencer = new Sequencer();

	private storedLayouts: IStoredNamedLayout[];

	/**
	 * Layouts that users locked. Layouts that extensions lock are not part of it.
	 */
	private lockedLayoutIds: Set<string>;
	private activeLayoutId: string;

	/**
	 * Counts the changes of the active layout, to detect that another layout became active meanwhile.
	 */
	private activeLayoutChanges = 0;
	private isApplying = false;

	private contributedLayouts = new Map<string, IContributedNamedLayout>();

	/**
	 * Whether the layouts that extensions contribute are known. Until then a stored
	 * layout that refers to a contribution represents the contributed layout.
	 */
	private contributedLayoutsKnown = false;
	private readonly whenContributedLayoutsKnown = new DeferredPromise<void>();

	/**
	 * The active layout of an extension that was not changed, as it was stored when the
	 * window closed. It represents the layout until the contributed layouts are known.
	 */
	private restoredContributedLayout: IStoredNamedLayout | undefined;

	/**
	 * The snapshot that changes to the active layout are detected against while it is locked,
	 * or while it is the layout of an extension that was not changed. It is taken once the
	 * window settled after the layout was applied, locked or reverted, and is `pending` until
	 * then. `undefined` while changes are not detected.
	 */
	private changeBaseline: ILayoutSnapshot | 'pending' | undefined;
	private activeLayoutModified = false;
	private readonly changeDetector = this._register(new RunOnceScheduler(() => this.detectChanges(), NamedLayoutsService.CHANGE_DETECTION_DELAY));

	/**
	 * The settings files that editors show read-only because their layouts are locked, with the names of the layouts.
	 */
	private readonlySettingsFiles = new ResourceMap<string>();

	private readonly settingsFileSystemProvider = this._register(new LayoutSettingsFileSystemProvider({
		getSettings: layoutId => this.getSettingsContent(layoutId),
		setSettings: (layoutId, content) => this.setSettingsContent(layoutId, content)
	}));

	/**
	 * Whether this service changes the storage, whose changes it then does not need to read.
	 */
	private isWritingStorage = false;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchConfigurationService private readonly configurationService: IWorkbenchConfigurationService,
		@IFileService fileService: IFileService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.migrateLegacyStorage();
		this.storedLayouts = this.loadLayouts();
		this.lockedLayoutIds = this.loadLockedLayoutIds();

		// The configuration service reads the settings of the active layout from the provider
		this._register(fileService.registerProvider(LAYOUT_SETTINGS_SCHEME, this.settingsFileSystemProvider));

		const storedActiveLayoutId = this.storageService.get(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
		this.activeLayoutId = this.restoreActiveLayout();

		// The workbench restores the arrangement it saved itself. For a locked layout that
		// arrangement can contain changes that must not be kept, so the saved state of the
		// layout is applied once the workbench is restored
		const restoredLayoutId = this.activeLayoutId;
		if (this.isLocked(restoredLayoutId)) {
			lifecycleService.when(LifecyclePhase.Restored).then(() => this.sequencer.queue(async () => {
				const storedLayout = this.getStoredLayout(restoredLayoutId);
				if (storedLayout && this.activeLayoutId === restoredLayoutId && this.isLocked(restoredLayoutId)) {
					await this.applyLayoutState(storedLayout, [...this.participants]);
				}
			})).catch(error => this.logService.error('[named layouts] Failed to restore the locked layout.', error));
		}

		// If the layout that was active when the window closed was deleted meanwhile, or named layouts
		// were disabled, the workbench restores the arrangement of that layout. The saved arrangement of
		// the default layout is applied instead, so that it is not overwritten by the next switch
		if (storedActiveLayoutId && restoredLayoutId === DEFAULT_NAMED_LAYOUT_ID) {
			const activeLayoutChanges = this.activeLayoutChanges;
			lifecycleService.when(LifecyclePhase.Restored).then(() => this.sequencer.queue(async () => {
				if (this.activeLayoutChanges === activeLayoutChanges) {
					await this.applyLayoutState(undefined, [...this.participants]);
				}
			})).catch(error => this.logService.error('[named layouts] Failed to restore the default layout.', error));
		}

		// The workbench restores the arrangement of the active layout of an extension that was not
		// changed. A locked layout starts from its definition again, and the extension may have
		// changed the definition meanwhile, which the layout follows. Otherwise its changes are
		// detected from now on.
		const restoredContributedLayout = this.restoredContributedLayout;
		if (restoredContributedLayout) {
			Promise.all([lifecycleService.when(LifecyclePhase.Restored), this.whenContributedLayoutsKnown.p]).then(() => this.sequencer.queue(async () => {
				const contributedLayout = this.contributedLayouts.get(restoredContributedLayout.id);
				if (!contributedLayout || this.activeLayoutId !== restoredContributedLayout.id || this.getStoredLayout(restoredContributedLayout.id)) {
					return;
				}
				if (this.isLocked(restoredContributedLayout.id) || restoredContributedLayout.contribution?.definitionHash !== getDefinitionHash(contributedLayout)) {
					await this.applyContributedLayout(restoredContributedLayout.id, contributedLayout);
				} else {
					this.resetChangeTracking();
				}
			})).catch(error => this.logService.error('[named layouts] Failed to restore the layout of an extension.', error));
		}

		this._register(this.storageService.onWillSaveState(() => this.saveActiveLayout()));
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(e => this.onDidChangeProfileStorage(e.key)));
		this._register(this.onDidChangeLayouts(() => {
			this.updateLayoutSettings();
			this.updateReadonlySettingsFiles();
		}));
		this.updateReadonlySettingsFiles();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(NAMED_LAYOUTS_ENABLED_SETTING) && !this.isEnabled()) {
				this.queueSwitchToDefaultLayout(true);
			}
			if (getLayoutOverridableSettings().some(key => e.affectsConfiguration(key))) {
				this.scheduleChangeDetection();
			}
		}));
	}

	get layouts(): readonly INamedLayout[] {
		const namedLayouts = this.storedLayouts
			.filter(layout => !layout.contribution)
			.map(({ id }) => this.getLayout(id));
		const contributedLayouts = [...this.contributedLayouts.keys()].map(id => this.getLayout(id));
		const layouts = [...namedLayouts, ...contributedLayouts]
			.filter((layout): layout is INamedLayout => !!layout)
			.sort((a, b) => a.name.localeCompare(b.name)
				|| Number(!!a.contribution) - Number(!!b.contribution)
				|| (a.contribution?.extensionName ?? '').localeCompare(b.contribution?.extensionName ?? '')
				// Layouts with the same name, for example created on different machines, are in the same order everywhere
				|| a.id.localeCompare(b.id));
		return [this.defaultLayout, ...layouts];
	}

	get activeLayout(): INamedLayout {
		return this.getLayout(this.activeLayoutId) ?? this.defaultLayout;
	}

	get isActiveLayoutModified(): boolean {
		return this.activeLayoutModified;
	}

	registerParticipant(participant: INamedLayoutParticipant): IDisposable {
		if (this.participants.some(candidate => candidate.id === participant.id)) {
			throw new Error(`A named layout participant with the id '${participant.id}' is already registered.`);
		}

		this.participants.push(participant);
		const changeListener = participant.onDidChange?.(() => this.scheduleChangeDetection());

		// A participant that shares its state with the default layout may still use the
		// local copy of a named layout that no longer exists, or may not use a local copy
		// for a layout saved before the participant existed. The layout of an extension that
		// was not changed has no saved state, the participant restored its local copy itself.
		if (participant.applyDefault) {
			this.sequencer.queue(async () => {
				const storedLayout = this.getStoredLayout(this.activeLayoutId);
				if (this.participants.includes(participant) && (storedLayout || this.activeLayoutId === DEFAULT_NAMED_LAYOUT_ID)) {
					await this.applyLayoutState(storedLayout, [participant]);
				}
			}).catch(error => this.logService.error(`[named layouts] Failed to restore the state of participant '${participant.id}'.`, error));
		}

		return toDisposable(() => {
			changeListener?.dispose();
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

			// A new layout starts as a copy of the active layout, also of its settings
			const settings = this.getSettingsContent(this.activeLayoutId) ?? NamedLayoutsService.EMPTY_SETTINGS;
			const layout: IStoredNamedLayout = { id: generateUuid(), name: layoutName, settings, state: this.captureState() };
			this.storeLayout(layout);

			this.applyLayoutSettings(layout);
			this.setActiveLayout(layout.id);
			this._onDidChangeLayouts.fire();

			// Participants that share their state with the default layout switch to a local copy
			await this.applyLayoutState(layout, this.participants.filter(participant => participant.applyDefault));

			return this.activeLayout;
		});
	}

	switchLayout(layout: INamedLayout): Promise<INamedLayout>;
	switchLayout(layout: INamedLayout, options: { readonly ifActiveLayoutId: string }): Promise<INamedLayout | undefined>;
	switchLayout(layout: INamedLayout, options?: { readonly ifActiveLayoutId: string }): Promise<INamedLayout | undefined> {
		return this.sequencer.queue(async () => {
			if (options && options.ifActiveLayoutId !== this.activeLayoutId) {
				return undefined;
			}

			const previousLayout = this.activeLayout;
			await this.doSwitchLayout(layout.id, true);
			return previousLayout;
		});
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
				this.storeLocked(layout.id, false);
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

			// Other windows that use the layout apply the settings of its definition
			this.removeStoredLayout(layout.id);
			if (this.activeLayoutId === layout.id) {
				await this.applyContributedLayout(layout.id, contributedLayout);
			} else {
				this._onDidChangeLayouts.fire();
			}
		});
	}

	ignoreLayoutUpdate(layout: INamedLayout): Promise<void> {
		return this.sequencer.queue(async () => {
			const storedLayout = this.getStoredLayout(layout.id);
			const contributedLayout = this.contributedLayouts.get(layout.id);
			if (!storedLayout?.contribution || !contributedLayout) {
				throw new Error(`Unknown changed contributed layout '${layout.id}'.`);
			}

			// The saved changes are based on the current definition from now on
			this.storeLayout({ ...storedLayout, contribution: this.toStoredContribution(contributedLayout) });
			this._onDidChangeLayouts.fire();
		});
	}

	setLayoutLocked(layout: INamedLayout, locked: boolean): Promise<void> {
		return this.sequencer.queue(async () => {
			if (layout.id === DEFAULT_NAMED_LAYOUT_ID) {
				throw new Error('The default layout cannot be locked.');
			}
			if (!this.getLayout(layout.id)) {
				throw new Error(`Unknown named layout '${layout.id}'.`);
			}
			if (this.isLockedByContribution(layout.id)) {
				throw new Error('A layout locked by its extension cannot be locked or unlocked.');
			}
			if (this.lockedLayoutIds.has(layout.id) === locked) {
				return;
			}

			if (locked) {
				// A locked layout keeps the arrangement it had when it was locked
				if (this.activeLayoutId === layout.id) {
					this.saveActiveLayout();
				}
				this.storeLocked(layout.id, true);
			} else {
				this.storeLocked(layout.id, false);
				// The changes made while the layout was locked are kept
				if (this.activeLayoutId === layout.id) {
					this.saveActiveLayout();
				}
			}

			this._onDidChangeLayouts.fire();

			// A layout that is locked now keeps its current state, its changes are detected against it
			if (this.activeLayoutId === layout.id) {
				this.resetChangeTracking();
			}
		});
	}

	revertLayout(): Promise<void> {
		return this.sequencer.queue(async () => {
			if (!this.isLocked(this.activeLayoutId)) {
				throw new Error('Only the changes of a locked layout can be reverted.');
			}

			// The settings of a locked layout cannot be changed, so there is nothing to revert
			const storedLayout = this.getStoredLayout(this.activeLayoutId);
			if (storedLayout) {
				await this.applyLayoutState(storedLayout, [...this.participants]);
				return;
			}

			// The layout of an extension that was not changed follows its definition
			const contributedLayout = this.contributedLayouts.get(this.activeLayoutId);
			if (contributedLayout) {
				await this.applyContributedLayout(this.activeLayoutId, contributedLayout);
			}
		});
	}

	setContributedLayouts(layouts: readonly IContributedNamedLayout[]): void {
		const previousContributedLayouts = this.contributedLayouts;
		const restoredContributedLayout = this.restoredContributedLayout;
		this.contributedLayouts = new Map(layouts.map(layout => [getContributedLayoutId(layout.extensionId, layout.id), layout]));
		this.contributedLayoutsKnown = true;
		this.restoredContributedLayout = undefined;
		this.whenContributedLayoutsKnown.complete();
		this.settingsFileSystemProvider.refresh();
		this._onDidChangeLayouts.fire();

		// Switch to the default layout if the extension that contributes the active
		// layout is no longer installed or no longer contributes it. Its saved changes
		// are kept in case the extension contributes it again.
		const activeLayoutId = this.activeLayoutId;
		const contributedLayout = this.contributedLayouts.get(activeLayoutId);
		if (!contributedLayout && (this.getStoredLayout(activeLayoutId)?.contribution || restoredContributedLayout?.id === activeLayoutId)) {
			this.queueSwitchToDefaultLayout(true);
			return;
		}

		// The active layout of an extension that was not changed follows the changes of its definition
		const previousContributedLayout = previousContributedLayouts.get(activeLayoutId);
		if (contributedLayout && previousContributedLayout && !this.getStoredLayout(activeLayoutId) && getDefinitionHash(contributedLayout) !== getDefinitionHash(previousContributedLayout)) {
			this.sequencer.queue(async () => {
				if (this.activeLayoutId === activeLayoutId && !this.getStoredLayout(activeLayoutId) && this.contributedLayouts.get(activeLayoutId) === contributedLayout) {
					await this.applyContributedLayout(activeLayoutId, contributedLayout);
				}
			}).catch(error => this.logService.error(`[named layouts] Failed to apply the changed definition of layout '${activeLayoutId}'.`, error));
		}
		this.storeActiveContributedLayout();
	}

	captureDefinition(): INamedLayoutDefinition {
		// Settings that have their default value are not described: a contributed
		// layout takes the settings it does not specify from the settings of the user
		const settings: IStringDictionary<unknown> = {};
		for (const key of getLayoutOverridableSettings()) {
			const { value, defaultValue } = this.configurationService.inspect(key);
			if (!equals(value, defaultValue)) {
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

		// A layout that its extension locked always starts from its definition, and so does the layout
		// of an extension that was not changed. The state of a contributed layout is not synchronized,
		// so on a machine where its changes were not applied yet it starts from its definition with
		// the settings synchronized from another machine
		if (contributedLayout && (!storedLayout?.state || contributedLayout.locked)) {
			await this.applyContributedLayout(layoutId, contributedLayout, contributedLayout.locked ? undefined : storedLayout?.settings);
			return;
		}

		// Apply settings first because participants may depend on them
		this.applyLayoutSettings(storedLayout);
		this.setActiveLayout(storedLayout?.id ?? DEFAULT_NAMED_LAYOUT_ID);
		await this.applyLayoutState(storedLayout, [...this.participants]);

		// A layout synchronized from another machine keeps the arrangement of the window, which
		// is saved right away so that a locked layout has an arrangement to revert to
		if (storedLayout && !storedLayout.state) {
			this.storeLayout({ ...storedLayout, state: this.captureState() });
		}
	}

	/**
	 * Applies the definition of a contributed layout. Must only be called from a task of the sequencer.
	 *
	 * @param settings The content of the settings file of the layout, the settings of the definition if not given.
	 */
	private async applyContributedLayout(layoutId: string, contributedLayout: IContributedNamedLayout, settings = toSettingsContent(this.getDefinitionSettings(contributedLayout))): Promise<void> {
		const { definition } = contributedLayout;

		this.configurationService.setLayoutSettings(this.getLayoutSettings(layoutId), this.parseSettings(layoutId, settings));
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

		const storedLayout = this.getStoredLayout(layoutId);
		const layout: IStoredNamedLayout = storedLayout && !contributedLayout.locked
			? { ...storedLayout, settings, state: this.captureState() }
			: { id: layoutId, name: contributedLayout.label, settings, state: this.captureState(), contribution: this.toStoredContribution(contributedLayout) };

		// The saved changes of a changed layout that was not active on this machine yet get the state of
		// this machine. A layout that was not changed is not saved, it follows its definition.
		if (storedLayout && !contributedLayout.locked) {
			this.storeLayout(layout);
		}
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

		const locked = this.isLocked(layoutId) ? { locked: true } : {};
		const storedLayout = this.getStoredLayout(layoutId);
		const contributedLayout = this.contributedLayouts.get(layoutId);
		if (contributedLayout) {
			const { extensionId, extensionName, id, label } = contributedLayout;
			const lockedByContribution = !!contributedLayout.locked;
			// The saved state of a layout locked by its extension is replaced whenever it becomes active
			return { id: layoutId, name: label, contribution: { extensionId, extensionName, id, canReset: !!storedLayout && !lockedByContribution, locked: lockedByContribution, hasUpdate: this.hasUpdate(layoutId) }, ...locked };
		}

		// Until the contributed layouts are known, the saved changes represent the layout, or
		// the active layout of an extension that was not changed as it was when the window closed
		const representedLayout = storedLayout ?? (this.restoredContributedLayout?.id === layoutId ? this.restoredContributedLayout : undefined);
		if (!representedLayout) {
			return undefined;
		}

		if (representedLayout.contribution) {
			const { extensionId, id } = representedLayout.contribution;
			const lockedByContribution = !!representedLayout.contribution.locked;
			return this.contributedLayoutsKnown ? undefined : { id: layoutId, name: representedLayout.name, contribution: { extensionId, extensionName: extensionId, id, canReset: !!storedLayout && !lockedByContribution, locked: lockedByContribution, hasUpdate: false }, ...locked };
		}

		return { id: representedLayout.id, name: representedLayout.name, ...locked };
	}

	/**
	 * Whether the extension changed the definition of the given layout since the saved changes
	 * of the layout were made. Changes based on a definition of a newer version of the extension,
	 * for example synchronized from another machine, are not considered outdated.
	 */
	private hasUpdate(layoutId: string): boolean {
		const contribution = this.getStoredLayout(layoutId)?.contribution;
		const contributedLayout = this.contributedLayouts.get(layoutId);
		if (!contribution || !contributedLayout || contributedLayout.locked || contribution.definitionHash === undefined || contribution.definitionHash === getDefinitionHash(contributedLayout)) {
			return false;
		}

		const { extensionVersion } = contribution;
		return !extensionVersion || !semver.valid(extensionVersion) || !semver.valid(contributedLayout.extensionVersion) || !semver.lt(contributedLayout.extensionVersion, extensionVersion);
	}

	private isLocked(layoutId: string): boolean {
		return layoutId !== DEFAULT_NAMED_LAYOUT_ID && (this.lockedLayoutIds.has(layoutId) || this.isLockedByContribution(layoutId));
	}

	private isLockedByContribution(layoutId: string): boolean {
		const contributedLayout = this.contributedLayouts.get(layoutId);
		if (contributedLayout) {
			return !!contributedLayout.locked;
		}
		const representedLayout = this.getStoredLayout(layoutId) ?? (this.restoredContributedLayout?.id === layoutId ? this.restoredContributedLayout : undefined);
		return !this.contributedLayoutsKnown && !!representedLayout?.contribution?.locked;
	}

	private toStoredContribution(contributedLayout: IContributedNamedLayout): IStoredNamedLayoutContribution {
		const { extensionId, id, locked, extensionVersion } = contributedLayout;
		return { extensionId, id, ...(locked ? { locked } : {}), definitionHash: getDefinitionHash(contributedLayout), extensionVersion };
	}

	/**
	 * Returns the settings that the definition of a contributed layout specifies. Settings
	 * it does not specify have the values of the user and workspace settings.
	 */
	private getDefinitionSettings({ definition }: IContributedNamedLayout): IStringDictionary<unknown> {
		const settings: IStringDictionary<unknown> = {};
		for (const [key, value] of Object.entries(definition.settings ?? {})) {
			if (value !== undefined && isLayoutOverridableSetting(key)) {
				settings[key] = value;
			}
		}
		return settings;
	}

	private restoreActiveLayout(): string {
		const activeLayoutId = this.storageService.get(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
		const storedLayout = activeLayoutId && this.isEnabled() ? this.getStoredLayout(activeLayoutId) ?? this.loadActiveContributedLayout(activeLayoutId) : undefined;
		if (!storedLayout) {
			this.storageService.remove(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
			this.storageService.remove(NamedLayoutsService.ACTIVE_CONTRIBUTED_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
			return DEFAULT_NAMED_LAYOUT_ID;
		}
		if (!this.getStoredLayout(storedLayout.id)) {
			this.restoredContributedLayout = storedLayout;
		}

		// The workbench restores the state of the participants itself, participants
		// that share their state with the default layout are restored when they register.
		// Only the settings of the layout need to be restored here
		this.applyLayoutSettings(storedLayout);

		return storedLayout.id;
	}

	private loadActiveContributedLayout(layoutId: string): IStoredNamedLayout | undefined {
		const layout = this.loadStoredValue(NamedLayoutsService.ACTIVE_CONTRIBUTED_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
		const storedLayout = layout === undefined ? undefined : toStoredNamedLayout(layoutId, layout, undefined);
		return storedLayout?.contribution && getContributedLayoutId(storedLayout.contribution.extensionId, storedLayout.contribution.id) === layoutId ? storedLayout : undefined;
	}

	/**
	 * Stores the active layout with the active layout identifier while it is the layout of an extension
	 * that was not changed, so that it can be restored before the contributed layouts are known.
	 */
	private storeActiveContributedLayout(): void {
		const contributedLayout = this.contributedLayouts.get(this.activeLayoutId);
		if (contributedLayout && !this.getStoredLayout(this.activeLayoutId)) {
			const layout: ISyncedNamedLayout = {
				name: contributedLayout.label,
				settings: toSettingsContent(this.getDefinitionSettings(contributedLayout)),
				contribution: this.toStoredContribution(contributedLayout)
			};
			this.storageService.store(NamedLayoutsService.ACTIVE_CONTRIBUTED_LAYOUT_STORAGE_KEY, JSON.stringify(layout), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else if (this.restoredContributedLayout?.id !== this.activeLayoutId) {
			this.storageService.remove(NamedLayoutsService.ACTIVE_CONTRIBUTED_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	private setActiveLayout(layoutId: string): void {
		if (layoutId === DEFAULT_NAMED_LAYOUT_ID) {
			this.storageService.remove(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			this.storageService.store(NamedLayoutsService.ACTIVE_LAYOUT_STORAGE_KEY, layoutId, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}

		if (this.activeLayoutId !== layoutId) {
			this.activeLayoutId = layoutId;
			this.activeLayoutChanges++;
			this.storeActiveContributedLayout();
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
		if (this.isLocked(this.activeLayoutId)) {
			return; // changes to a locked layout are not saved
		}

		// The workbench persists the state of the default layout itself
		const activeLayout = this.getStoredLayout(this.activeLayoutId);
		const contributedLayout = this.contributedLayouts.get(this.activeLayoutId);
		if (!activeLayout && !contributedLayout) {
			return;
		}

		// The layout of an extension is saved once it was changed, until then it follows its definition
		if (!activeLayout && !this.hasChangedSinceBaseline()) {
			return;
		}

		const contribution = activeLayout?.contribution ?? (contributedLayout ? this.toStoredContribution(contributedLayout) : undefined);
		const updatedLayout: IStoredNamedLayout = {
			id: this.activeLayoutId,
			name: contributedLayout?.label ?? activeLayout?.name ?? this.activeLayoutId,
			settings: this.getSettingsContent(this.activeLayoutId) ?? NamedLayoutsService.EMPTY_SETTINGS,
			state: { ...activeLayout?.state, ...this.captureState() },
			...(contribution ? { contribution } : {})
		};
		if (!activeLayout) {
			this.storeLayout(updatedLayout);
			this._onDidChangeLayouts.fire();
			this.resetChangeTracking(); // its changes are saved from now on
		} else if (!equals(updatedLayout, activeLayout)) {
			// Only the keys of the values that changed are written
			this.storeLayout(updatedLayout);
		}
	}

	private getLayoutSettings(layoutId: string): ILayoutSettings {
		return { name: this.getLayout(layoutId)?.name ?? layoutId, resource: getLayoutSettingsResource(layoutId), locked: this.isLocked(layoutId) };
	}

	/**
	 * Applies the settings of the given named layout, or none for the default layout.
	 */
	private applyLayoutSettings(layout: IStoredNamedLayout | undefined): void {
		if (layout) {
			this.configurationService.setLayoutSettings(this.getLayoutSettings(layout.id), this.parseSettings(layout.id, layout.settings));
		} else {
			this.configurationService.setLayoutSettings(undefined);
		}
	}

	private parseSettings(layoutId: string, content: string): IStringDictionary<unknown> {
		return parseLayoutSettings(content, getLayoutSettingsResource(layoutId).toString(), this.logService);
	}

	/**
	 * Returns the content of the settings file of the given layout, `undefined` if there is no such layout.
	 */
	private getSettingsContent(layoutId: string): string | undefined {
		const storedLayout = this.getStoredLayout(layoutId);
		if (storedLayout) {
			return storedLayout.settings;
		}

		// The layout of an extension that was not changed has the settings of its definition
		const contributedLayout = this.contributedLayouts.get(layoutId);
		if (contributedLayout) {
			return toSettingsContent(this.getDefinitionSettings(contributedLayout));
		}
		return this.restoredContributedLayout?.id === layoutId ? this.restoredContributedLayout.settings : undefined;
	}

	/**
	 * Changes the content of the settings file of the given layout, which the configuration service and
	 * editors write. Changing the settings of the layout of an extension that was not changed saves it.
	 */
	private setSettingsContent(layoutId: string, content: string): void {
		const storedLayout = this.getStoredLayout(layoutId);
		const contributedLayout = this.contributedLayouts.get(layoutId);
		if (!storedLayout && !contributedLayout) {
			throw createFileSystemProviderError(localize('unknownLayoutSettings', "The layout does not exist."), FileSystemProviderErrorCode.FileNotFound);
		}
		if (this.isLocked(layoutId)) {
			throw createFileSystemProviderError(localize('lockedLayoutSettings', "The layout '{0}' is locked. Unlock the layout to change its settings.", this.getLayout(layoutId)?.name ?? layoutId), FileSystemProviderErrorCode.NoPermissions);
		}
		if (content === this.getSettingsContent(layoutId)) {
			return;
		}

		if (storedLayout) {
			this.storeLayout({ ...storedLayout, settings: content });
		} else if (contributedLayout) {
			const isActive = this.activeLayoutId === layoutId;
			this.storeLayout({ id: layoutId, name: contributedLayout.label, settings: content, state: isActive ? this.captureState() : undefined, contribution: this.toStoredContribution(contributedLayout) });
			this._onDidChangeLayouts.fire();
			if (isActive) {
				this.resetChangeTracking(); // its changes are saved from now on
			}
		}
	}

	/**
	 * Brings the name and the locked state of the active layout up to date in the configuration service.
	 */
	private updateLayoutSettings(): void {
		const layoutSettings = this.configurationService.layoutSettings;
		if (!layoutSettings || this.activeLayoutId === DEFAULT_NAMED_LAYOUT_ID) {
			return;
		}

		// While another layout is applied, the configuration service already has its settings
		const activeLayoutSettings = this.getLayoutSettings(this.activeLayoutId);
		if (isEqual(layoutSettings.resource, activeLayoutSettings.resource)) {
			this.configurationService.setLayoutSettings(activeLayoutSettings);
		}
	}

	/**
	 * Makes editors show the settings files of locked layouts read-only, so that their settings cannot be changed.
	 */
	private updateReadonlySettingsFiles(): void {
		const readonlySettingsFiles = new ResourceMap<string>();
		for (const layout of this.layouts) {
			if (layout.locked) {
				readonlySettingsFiles.set(getLayoutSettingsResource(layout.id), layout.name);
			}
		}

		const writableSettingsFiles = [...this.readonlySettingsFiles.keys()].filter(resource => !readonlySettingsFiles.has(resource));
		const changedSettingsFiles = [...readonlySettingsFiles].filter(([resource, name]) => this.readonlySettingsFiles.get(resource) !== name);
		this.readonlySettingsFiles = readonlySettingsFiles;

		const onError = (error: unknown) => this.logService.error('[named layouts] Failed to update the read-only state of the settings files of locked layouts.', error);
		if (writableSettingsFiles.length) {
			this.filesConfigurationService.updateReadonly(writableSettingsFiles, 'reset').catch(onError);
		}
		for (const [resource, name] of changedSettingsFiles) {
			this.filesConfigurationService.updateReadonly(resource, new MarkdownString(localize('lockedLayoutSettingsReadonly', "The layout '{0}' is locked. Unlock the layout to change its settings.", name))).catch(onError);
		}
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
		const state = layout ? layout.state ?? {} : this.loadDefaultLayoutState();
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

		this.resetChangeTracking();
	}

	private scheduleChangeDetection(): void {
		if (this.changeBaseline) {
			this.changeDetector.schedule();
		}
	}

	/**
	 * Starts to detect the changes made to the active layout from its current state if it
	 * is locked, otherwise stops detecting changes.
	 */
	private resetChangeTracking(): void {
		this.setActiveLayoutModified(false);
		if (this.isLocked(this.activeLayoutId) || this.isUnchangedContributedLayout(this.activeLayoutId)) {
			this.changeBaseline = 'pending';
			this.changeDetector.schedule();
		} else {
			this.changeBaseline = undefined;
			this.changeDetector.cancel();
		}
	}

	/**
	 * Whether the given layout is the layout of an extension that was not changed, which follows its definition.
	 */
	private isUnchangedContributedLayout(layoutId: string): boolean {
		return this.contributedLayouts.has(layoutId) && !this.getStoredLayout(layoutId);
	}

	private detectChanges(): void {
		if (!this.changeBaseline || this.isApplying) {
			return; // change tracking starts again once the layout is applied
		}

		if (this.changeBaseline === 'pending') {
			this.changeBaseline = { settings: this.configurationService.getLayoutConfiguration(), state: this.captureState() };
			return;
		}

		if (this.isLocked(this.activeLayoutId)) {
			this.setActiveLayoutModified(this.hasChangedSinceBaseline());
		} else if (this.hasChangedSinceBaseline()) {
			this.saveActiveLayout(); // the layout of an extension is saved once it was changed
		}
	}

	/**
	 * Whether the active layout changed since the baseline was taken, `false` while it is pending.
	 */
	private hasChangedSinceBaseline(): boolean {
		const baseline = this.changeBaseline;
		if (!baseline || baseline === 'pending') {
			return false;
		}

		// Changing the settings of the layout of an extension that was not changed saves it right away,
		// its settings change without being changed when the extension changes its definition
		if (this.isLocked(this.activeLayoutId) && !equals(this.configurationService.getLayoutConfiguration(), baseline.settings)) {
			return true;
		}

		return this.participants.some(participant => {
			const state = baseline.state[participant.id];
			if (state === undefined) {
				return false; // registered after the baseline was taken
			}

			try {
				return participant.hasChangedSince ? participant.hasChangedSince(state) : !equals(participant.capture(), state);
			} catch (error) {
				this.logService.error(`[named layouts] Failed to detect the changes of participant '${participant.id}'.`, error);
				return false;
			}
		});
	}

	private setActiveLayoutModified(modified: boolean): void {
		if (this.activeLayoutModified !== modified) {
			this.activeLayoutModified = modified;
			this._onDidChangeActiveLayoutModified.fire();
		}
	}

	private onDidChangeProfileStorage(key: string): void {
		if (this.isWritingStorage) {
			return; // changed by this window
		}

		if (key.startsWith(NamedLayoutsService.LOCKED_LAYOUT_STORAGE_KEY_PREFIX)) {
			this.onDidChangeLockedLayouts();
		} else if (key.startsWith(NamedLayoutsService.LAYOUT_STORAGE_KEY_PREFIX)) {
			this.onDidChangeStoredLayout(key.substring(NamedLayoutsService.LAYOUT_STORAGE_KEY_PREFIX.length));
		} else if (key.startsWith(NamedLayoutsService.LAYOUT_STATE_STORAGE_KEY_PREFIX)) {
			this.onDidChangeStoredLayout(key.substring(NamedLayoutsService.LAYOUT_STATE_STORAGE_KEY_PREFIX.length));
		}
	}

	/**
	 * Another window, Settings Sync or a switch of the profile changed the given layout.
	 */
	private onDidChangeStoredLayout(id: string): void {
		const storedLayout = this.loadLayout(id);
		if (equals(storedLayout, this.getStoredLayout(id))) {
			return;
		}

		const wasUnchangedContributedLayout = this.isUnchangedContributedLayout(id);
		const storedLayouts = this.storedLayouts.filter(candidate => candidate.id !== id);
		this.storedLayouts = storedLayout ? [...storedLayouts, storedLayout] : storedLayouts;
		this.settingsFileSystemProvider.refresh();
		this._onDidChangeLayouts.fire();

		if (id !== this.activeLayoutId) {
			return;
		}

		// Another window saved the changes of the active layout of an extension, or reset them. This window keeps
		// its arrangement, and follows the definition of the layout until the layout is changed again.
		this.storeActiveContributedLayout();
		if (this.contributedLayouts.has(id)) {
			if (this.isUnchangedContributedLayout(id) !== wasUnchangedContributedLayout) {
				this.resetChangeTracking();
			}
			return;
		}
		if (storedLayout) {
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

	/**
	 * Stores the given layout, replacing the stored layout with the same identifier.
	 */
	private storeLayout(layout: IStoredNamedLayout): void {
		this.storedLayouts = this.getStoredLayout(layout.id)
			? this.storedLayouts.map(candidate => candidate.id === layout.id ? layout : candidate)
			: [...this.storedLayouts, layout];
		this.writeStorage(() => this.writeLayout(layout));
		this.settingsFileSystemProvider.refresh();
		this.storeActiveContributedLayout();
	}

	private removeStoredLayout(id: string): boolean {
		if (!this.getStoredLayout(id)) {
			return false;
		}

		this.storedLayouts = this.storedLayouts.filter(candidate => candidate.id !== id);
		this.writeStorage(() => {
			this.storageService.remove(NamedLayoutsService.LAYOUT_STATE_STORAGE_KEY_PREFIX + id, StorageScope.PROFILE);
			this.storageService.remove(NamedLayoutsService.LAYOUT_STORAGE_KEY_PREFIX + id, StorageScope.PROFILE);
		});
		this.settingsFileSystemProvider.refresh();
		this.storeActiveContributedLayout();
		return true;
	}

	/**
	 * Writes the given layout to the storage. The storage ignores values that do not change,
	 * so a change of the state of the participants does not change the synchronized layout.
	 */
	private writeLayout({ id, name, settings, state, contribution }: IStoredNamedLayout): void {
		// The state is written first, so that other windows read it together with the layout
		if (state) {
			this.storageService.store(NamedLayoutsService.LAYOUT_STATE_STORAGE_KEY_PREFIX + id, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(NamedLayoutsService.LAYOUT_STATE_STORAGE_KEY_PREFIX + id, StorageScope.PROFILE);
		}

		const syncedLayout: ISyncedNamedLayout = { name, settings, ...(contribution ? { contribution } : {}) };
		this.storageService.store(NamedLayoutsService.LAYOUT_STORAGE_KEY_PREFIX + id, JSON.stringify(syncedLayout), StorageScope.PROFILE, StorageTarget.USER);
	}

	private writeStorage(write: () => void): void {
		const wasWritingStorage = this.isWritingStorage;
		this.isWritingStorage = true;
		try {
			write();
		} finally {
			this.isWritingStorage = wasWritingStorage;
		}
	}

	private loadLayouts(): IStoredNamedLayout[] {
		const prefix = NamedLayoutsService.LAYOUT_STORAGE_KEY_PREFIX;
		return coalesce(this.storageService.keys(StorageScope.PROFILE)
			.filter(key => key.startsWith(prefix))
			.map(key => this.loadLayout(key.substring(prefix.length))));
	}

	private loadLayout(id: string): IStoredNamedLayout | undefined {
		const layout = this.loadStoredValue(NamedLayoutsService.LAYOUT_STORAGE_KEY_PREFIX + id);
		if (layout === undefined) {
			return undefined;
		}

		const state = this.loadStoredValue(NamedLayoutsService.LAYOUT_STATE_STORAGE_KEY_PREFIX + id);
		const storedLayout = toStoredNamedLayout(id, layout, isObject(state) ? state as IStringDictionary<unknown> : undefined);
		if (!storedLayout) {
			this.logService.error(`[named layouts] The stored named layout '${id}' is invalid.`);
		}
		return storedLayout;
	}

	private loadStoredValue(key: string, scope: StorageScope.PROFILE | StorageScope.WORKSPACE = StorageScope.PROFILE): unknown {
		const value = this.storageService.get(key, scope);
		if (value === undefined) {
			return undefined;
		}

		try {
			return JSON.parse(value);
		} catch (error) {
			this.logService.error(`[named layouts] Failed to parse the stored value of '${key}'.`, error);
			return undefined;
		}
	}

	/**
	 * Stores the named layouts and the locked layouts, which were stored under a single key
	 * each, under their own keys. Layouts that another machine stored under their own key
	 * meanwhile are kept.
	 */
	private migrateLegacyStorage(): void {
		const { LEGACY_LAYOUTS_STORAGE_KEY, LEGACY_LOCKED_LAYOUTS_STORAGE_KEY } = NamedLayoutsService;
		if (this.storageService.get(LEGACY_LAYOUTS_STORAGE_KEY, StorageScope.PROFILE) === undefined && this.storageService.get(LEGACY_LOCKED_LAYOUTS_STORAGE_KEY, StorageScope.PROFILE) === undefined) {
			return;
		}

		const layouts = this.loadStoredValue(LEGACY_LAYOUTS_STORAGE_KEY);
		const lockedLayoutIds = this.loadStoredValue(LEGACY_LOCKED_LAYOUTS_STORAGE_KEY);
		this.writeStorage(() => {
			for (const candidate of Array.isArray(layouts) ? layouts : []) {
				const { id, state } = isObject(candidate) ? candidate as { id?: unknown; state?: unknown } : {};
				const layout = isString(id) ? toStoredNamedLayout(id, candidate, isObject(state) ? state as IStringDictionary<unknown> : undefined) : undefined;
				if (layout && this.storageService.get(NamedLayoutsService.LAYOUT_STORAGE_KEY_PREFIX + layout.id, StorageScope.PROFILE) === undefined) {
					this.writeLayout(layout);
				}
			}
			for (const id of Array.isArray(lockedLayoutIds) ? lockedLayoutIds.filter(isString) : []) {
				this.storageService.store(NamedLayoutsService.LOCKED_LAYOUT_STORAGE_KEY_PREFIX + id, true, StorageScope.PROFILE, StorageTarget.USER);
			}
			this.storageService.remove(LEGACY_LAYOUTS_STORAGE_KEY, StorageScope.PROFILE);
			this.storageService.remove(LEGACY_LOCKED_LAYOUTS_STORAGE_KEY, StorageScope.PROFILE);
		});
	}

	private onDidChangeLockedLayouts(): void {
		const lockedLayoutIds = this.loadLockedLayoutIds();
		if (equals([...lockedLayoutIds].sort(), [...this.lockedLayoutIds].sort())) {
			return;
		}

		// Changes made to the active layout while another window locked it are not saved
		const activeLayoutWasLocked = this.isLocked(this.activeLayoutId);
		this.lockedLayoutIds = lockedLayoutIds;
		this._onDidChangeLayouts.fire();
		if (this.isLocked(this.activeLayoutId) !== activeLayoutWasLocked) {
			this.resetChangeTracking();
		}
	}

	private loadLockedLayoutIds(): Set<string> {
		const prefix = NamedLayoutsService.LOCKED_LAYOUT_STORAGE_KEY_PREFIX;
		return new Set(this.storageService.keys(StorageScope.PROFILE)
			.filter(key => key.startsWith(prefix))
			.map(key => key.substring(prefix.length)));
	}

	private storeLocked(id: string, locked: boolean): void {
		const key = NamedLayoutsService.LOCKED_LAYOUT_STORAGE_KEY_PREFIX + id;
		if (locked) {
			this.lockedLayoutIds.add(id);
			this.writeStorage(() => this.storageService.store(key, true, StorageScope.PROFILE, StorageTarget.USER));
		} else if (this.lockedLayoutIds.delete(id)) {
			this.writeStorage(() => this.storageService.remove(key, StorageScope.PROFILE));
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
