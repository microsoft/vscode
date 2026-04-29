/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, getWindow, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { createInstantHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { SessionsCharacterActiveContext, SessionsCharacterCustomizingContext } from '../../../common/contextkeys.js';
import { DEFAULT_CHARACTER_CUSTOMIZATION, ICharacterCustomization, parseCustomization } from '../common/characterCustomization.js';
import { CharacterAvatar } from './characterAvatar.js';
import { CharacterBehavior } from './characterBehavior.js';
import { CharacterCustomizationPanel } from './characterCustomizationPanel.js';

/** Storage key for whether the character is enabled. */
const CHARACTER_ENABLED_STORAGE_KEY = 'workbench.sessions.character.enabled';
/** Storage key for the serialized customization JSON. */
const CHARACTER_CUSTOMIZATION_STORAGE_KEY = 'workbench.sessions.character.customization';

/** Class added to the auxiliary bar part container while the stage is mounted. */
const STAGE_HOSTED_CLASS = 'agents-character-stage-hosted';

interface IActiveStage extends IDisposable {
	readonly avatar: CharacterAvatar;
	openCustomization(): void;
	closeCustomization(): void;
}

/**
 * Lifecycle owner for the Agents window character easter egg. Mounts a small
 * fixed-height stage at the bottom of the auxiliary bar, owns the toggle and
 * customization buttons, and manages activation/deactivation persistence.
 *
 * Mirrors the shape of the existing aquarium overlay so the patterns are
 * consistent: a {@link MutableDisposable} for the active stage, an optional
 * customization panel, and storage-backed toggle state.
 */
export class CharacterStage extends Disposable {

	private readonly mainContainer: HTMLElement;
	private readonly activeRef = this._register(new MutableDisposable<IActiveStage>());
	private readonly activeContextKey: IContextKey<boolean>;
	private readonly customizingContextKey: IContextKey<boolean>;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.mainContainer = layoutService.mainContainer;
		this.activeContextKey = SessionsCharacterActiveContext.bindTo(contextKeyService);
		this.customizingContextKey = SessionsCharacterCustomizingContext.bindTo(contextKeyService);

		// Restore previous on/off state once the auxiliary bar exists.
		this.tryActivateInitial(0);
	}

	/** Whether the character is currently mounted. */
	get isActive(): boolean {
		return !!this.activeRef.value;
	}

	/** Toggle character visibility and persist the choice. */
	toggle(): void {
		if (this.activeRef.value) {
			this.deactivate(/* persist */ true);
		} else {
			this.activate(/* persist */ true);
		}
	}

	/** Open the customization panel (no-op if the stage isn't active). */
	openCustomization(): void {
		this.activeRef.value?.openCustomization();
	}

	private isStoredEnabled(): boolean {
		return this.storageService.getBoolean(CHARACTER_ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false);
	}

	private setStoredEnabled(enabled: boolean): void {
		this.storageService.store(CHARACTER_ENABLED_STORAGE_KEY, enabled, StorageScope.APPLICATION, StorageTarget.USER);
	}

	private loadCustomization(): ICharacterCustomization {
		const raw = this.storageService.get(CHARACTER_CUSTOMIZATION_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return DEFAULT_CHARACTER_CUSTOMIZATION;
		}
		try {
			return parseCustomization(JSON.parse(raw));
		} catch {
			return DEFAULT_CHARACTER_CUSTOMIZATION;
		}
	}

	private saveCustomization(customization: ICharacterCustomization): void {
		this.storageService.store(CHARACTER_CUSTOMIZATION_STORAGE_KEY, JSON.stringify(customization), StorageScope.APPLICATION, StorageTarget.USER);
	}

	/**
	 * Wait for the auxiliary bar to be available, then restore the saved
	 * on-state. Mirrors the retry pattern used by the aquarium toggle button.
	 */
	private tryActivateInitial(attempt: number): void {
		const window = getWindow(this.mainContainer);
		const auxBar = this.layoutService.getContainer(window, Parts.AUXILIARYBAR_PART);
		if (auxBar && auxBar.isConnected) {
			if (this.isStoredEnabled() && !this.activeRef.value) {
				this.activate(/* persist */ false);
			}
			return;
		}
		if (attempt >= 60) {
			return;
		}
		const sched = scheduleAtNextAnimationFrame(window, () => this.tryActivateInitial(attempt + 1));
		this._register(sched);
	}

	private activate(persist: boolean): void {
		if (this.activeRef.value) {
			return;
		}
		const targetWindow = getWindow(this.mainContainer);
		const auxBar = this.layoutService.getContainer(targetWindow, Parts.AUXILIARYBAR_PART);
		if (!auxBar) {
			// Defer until the part exists.
			return;
		}
		const stage = this.createActiveStage(auxBar, targetWindow);
		this.activeRef.value = stage;
		this.activeContextKey.set(true);
		if (persist) {
			this.setStoredEnabled(true);
		}
	}

	private deactivate(persist: boolean): void {
		this.activeContextKey.set(false);
		this.customizingContextKey.set(false);
		this.activeRef.clear();
		if (persist) {
			this.setStoredEnabled(false);
		}
	}

	private createActiveStage(auxBar: HTMLElement, targetWindow: Window): IActiveStage {
		const store = new DisposableStore();
		const doc = targetWindow.document;

		// --- Stage container ---
		const stage = doc.createElement('div');
		stage.className = 'agents-character-stage';
		stage.setAttribute('aria-label', localize('character.stage', "Character stage"));
		auxBar.classList.add(STAGE_HOSTED_CLASS);
		auxBar.appendChild(stage);
		store.add(toDisposable(() => {
			stage.remove();
			auxBar.classList.remove(STAGE_HOSTED_CLASS);
		}));

		// --- Floor strip + decorative backdrop ---
		const backdrop = doc.createElement('div');
		backdrop.className = 'agents-character-backdrop';
		stage.appendChild(backdrop);

		// --- Live character ---
		const customization = this.loadCustomization();
		const avatar = store.add(new CharacterAvatar(doc, customization, /* showName */ true));
		stage.appendChild(avatar.element);

		// --- Toggle + customize buttons (top-right of the stage) ---
		const buttonRow = doc.createElement('div');
		buttonRow.className = 'agents-character-buttons';
		stage.appendChild(buttonRow);

		const customizeButton = this.createIconButton(doc, Codicon.settingsGear, localize('character.customize', "Customize Character"));
		buttonRow.appendChild(customizeButton);

		const closeButton = this.createIconButton(doc, Codicon.close, localize('character.hide', "Hide Character"));
		buttonRow.appendChild(closeButton);

		const hoverDelegate = store.add(createInstantHoverDelegate());
		store.add(this.hoverService.setupManagedHover(hoverDelegate, customizeButton, () => localize('character.customize', "Customize Character")));
		store.add(this.hoverService.setupManagedHover(hoverDelegate, closeButton, () => localize('character.hide', "Hide Character")));

		// --- Behavior loop ---
		const behavior = store.add(this.instantiationService.createInstance(CharacterBehavior, stage, avatar));

		// --- Customization panel (created on demand) ---
		const panelRef = store.add(new MutableDisposable<DisposableStore>());

		const openCustomization = () => {
			if (panelRef.value) {
				return;
			}
			const disposables = new DisposableStore();
			const panel = disposables.add(new CharacterCustomizationPanel(doc, this.loadCustomization()));
			disposables.add(panel.onDidChange(next => {
				avatar.applyCustomization(next);
				this.saveCustomization(next);
			}));
			disposables.add(panel.onDidRequestClose(() => closeCustomization()));
			stage.classList.add('customizing');
			stage.appendChild(panel.element);
			panelRef.value = disposables;
			this.customizingContextKey.set(true);
		};

		const closeCustomization = () => {
			if (!panelRef.value) {
				return;
			}
			stage.classList.remove('customizing');
			panelRef.clear();
			this.customizingContextKey.set(false);
		};

		store.add(toDisposable(() => closeCustomization()));

		store.add(addDisposableListener(customizeButton, EventType.CLICK, () => {
			if (panelRef.value) {
				closeCustomization();
			} else {
				openCustomization();
			}
		}));
		store.add(addDisposableListener(closeButton, EventType.CLICK, () => this.deactivate(/* persist */ true)));

		// Anchor the avatar after first paint so we have valid bounds.
		const settle = scheduleAtNextAnimationFrame(targetWindow, () => behavior.resetPosition());
		store.add(settle);

		return {
			avatar,
			openCustomization,
			closeCustomization,
			dispose: () => store.dispose(),
		};
	}

	private createIconButton(doc: Document, icon: ThemeIcon, ariaLabel: string): HTMLButtonElement {
		const button = doc.createElement('button');
		button.type = 'button';
		button.className = 'agents-character-button';
		button.setAttribute('aria-label', ariaLabel);
		const span = doc.createElement('span');
		const classes = ThemeIcon.asClassName(icon).split(/\s+/).filter(Boolean);
		for (const c of classes) {
			span.classList.add(c);
		}
		button.appendChild(span);
		return button;
	}
}
