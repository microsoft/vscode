/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/buddy.css';
import { addDisposableListener, EventType, getWindow } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { BuddyWidget } from './buddyWidget.js';
import { SESSIONS_BUDDY_ENABLED_SETTING, SESSIONS_BUDDY_TIPS_SETTING } from './buddySettings.js';

export { SESSIONS_BUDDY_ENABLED_SETTING, SESSIONS_BUDDY_TIPS_SETTING };

const DOCK_HEIGHT_STORAGE_KEY = 'sessions.buddy.dockHeight';
const DOCK_HEIGHT_DEFAULT = 200;
const DOCK_HEIGHT_MIN = 120;
const DOCK_HEIGHT_MAX = 480;
const DOCK_TOP_GAP = 6;

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[SESSIONS_BUDDY_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			description: localize('sessions.developerJoy.buddyEnabled', "Docks a chat-reactive buddy below the auxiliary bar during an existing session."),
			tags: ['experimental'],
		},
		[SESSIONS_BUDDY_TIPS_SETTING]: {
			type: 'boolean',
			default: true,
			description: localize('sessions.developerJoy.buddyTips', "When the buddy is enabled, occasionally show random tips."),
			tags: ['experimental'],
		},
	},
});

class BuddyContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.buddy';

	private readonly mount = this._register(new MutableDisposable<DisposableStore>());
	private readonly isNewSessionKeySet = new Set([IsNewChatSessionContext.key]);

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SESSIONS_BUDDY_ENABLED_SETTING)) {
				this.reconcile();
			}
		}));
		this._register(this.layoutService.onDidChangePartVisibility(() => this.reconcile()));
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(this.isNewSessionKeySet)) {
				this.reconcile();
			}
		}));

		this.reconcile();
	}

	private reconcile(): void {
		const enabled = this.configurationService.getValue<boolean>(SESSIONS_BUDDY_ENABLED_SETTING) === true;
		const isNewSession = this.contextKeyService.getContextKeyValue<boolean>(IsNewChatSessionContext.key) !== false;
		if (!enabled || isNewSession) {
			this.mount.clear();
			return;
		}

		const targetWindow = getWindow(this.layoutService.mainContainer);
		const auxBar = this.layoutService.getContainer(targetWindow, Parts.AUXILIARYBAR_PART);
		if (!auxBar || !this.layoutService.isVisible(Parts.AUXILIARYBAR_PART, targetWindow)) {
			this.mount.clear();
			return;
		}

		if (this.mount.value) {
			return;
		}
		this.mount.value = this.createMount(auxBar);
	}

	private createMount(auxBar: HTMLElement): DisposableStore {
		const store = new DisposableStore();
		const doc = auxBar.ownerDocument;
		const targetWindow = getWindow(auxBar);

		const container = doc.createElement('div');
		container.className = 'agents-buddy-dock';
		container.setAttribute('aria-hidden', 'true');

		const sash = doc.createElement('div');
		sash.className = 'agents-buddy-dock-sash';
		sash.setAttribute('role', 'separator');
		sash.setAttribute('aria-orientation', 'horizontal');
		container.appendChild(sash);

		const body = doc.createElement('div');
		body.className = 'agents-buddy-dock-body';
		container.appendChild(body);

		auxBar.classList.add('has-agents-buddy');
		auxBar.appendChild(container);

		const storedHeight = this.storageService.getNumber(DOCK_HEIGHT_STORAGE_KEY, StorageScope.PROFILE, DOCK_HEIGHT_DEFAULT);
		const applyHeight = (next: number): number => {
			const clamped = Math.min(DOCK_HEIGHT_MAX, Math.max(DOCK_HEIGHT_MIN, Math.round(next)));
			container.style.height = `${clamped}px`;
			auxBar.style.setProperty('--agents-buddy-dock-height', `${clamped}px`);
			// Reserve dock height + the visible top gap so the active composite
			// ends above the dock card.
			auxBar.setAttribute('data-reserved-bottom', String(clamped + DOCK_TOP_GAP));
			this.layoutService.layout();
			return clamped;
		};
		applyHeight(storedHeight);

		// Drag-to-resize. Tracks pointer movement and updates the dock height,
		// re-running the workbench layout each frame so the active composite
		// shrinks/grows in lockstep.
		store.add(addDisposableListener(sash, EventType.POINTER_DOWN, (e: PointerEvent) => {
			if (e.button !== 0) {
				return;
			}
			e.preventDefault();
			sash.setPointerCapture?.(e.pointerId);
			const startY = e.clientY;
			const startHeight = container.getBoundingClientRect().height;
			doc.body.classList.add('agents-buddy-resizing');

			const moveListener = addDisposableListener(targetWindow, EventType.POINTER_MOVE, (ev: PointerEvent) => {
				applyHeight(startHeight + (startY - ev.clientY));
			});
			const finish = () => {
				moveListener.dispose();
				upListener.dispose();
				cancelListener.dispose();
				doc.body.classList.remove('agents-buddy-resizing');
				sash.releasePointerCapture?.(e.pointerId);
				const finalHeight = container.getBoundingClientRect().height;
				this.storageService.store(DOCK_HEIGHT_STORAGE_KEY, Math.round(finalHeight), StorageScope.PROFILE, StorageTarget.USER);
			};
			const upListener = addDisposableListener(targetWindow, EventType.POINTER_UP, finish);
			const cancelListener = addDisposableListener(targetWindow, EventType.POINTER_CANCEL, finish);
		}));

		const widget = this.instantiationService.createInstance(BuddyWidget, body);
		store.add(widget);
		store.add({
			dispose: () => {
				container.remove();
				auxBar.classList.remove('has-agents-buddy');
				auxBar.removeAttribute('data-reserved-bottom');
				auxBar.style.removeProperty('--agents-buddy-dock-height');
				this.layoutService.layout();
			}
		});

		return store;
	}
}

registerWorkbenchContribution2(BuddyContribution.ID, BuddyContribution, WorkbenchPhase.AfterRestored);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.buddy.toggle',
			title: localize2('buddy.toggle', "Toggle Pet"),
			category: localize2('buddy.category', "Agents Buddy"),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const enabled = configurationService.getValue<boolean>(SESSIONS_BUDDY_ENABLED_SETTING) === true;
		await configurationService.updateValue(SESSIONS_BUDDY_ENABLED_SETTING, !enabled);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.buddy.summon',
			title: localize2('buddy.summon', "Summon Pet"),
			category: localize2('buddy.category', "Agents Buddy"),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IConfigurationService).updateValue(SESSIONS_BUDDY_ENABLED_SETTING, true);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.buddy.dismiss',
			title: localize2('buddy.dismiss', "Dismiss Pet"),
			category: localize2('buddy.category', "Agents Buddy"),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IConfigurationService).updateValue(SESSIONS_BUDDY_ENABLED_SETTING, false);
	}
});
