/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatWidgetService } from '../chat.js';
import { ChatPetWidget, IChatPetWidgetHost } from './chatPetWidget.js';

export const IChatPetWidgetService = createDecorator<IChatPetWidgetService>('chatPetWidgetService');

export interface IChatPetWidgetHostRegistration extends IDisposable {
	readonly active: IObservable<boolean>;
}

export interface IChatPetWidgetService {
	readonly _serviceBrand: undefined;
	register(owner: object, host: IChatPetWidgetHost, preferred?: IObservable<boolean>, onDidFocus?: Event<void>): IChatPetWidgetHostRegistration;
}

interface IChatPetWidgetInstance extends IDisposable {
	setHost(host: IChatPetWidgetHost): void;
}

interface IChatPetHostEntry {
	readonly owner: object;
	readonly host: IChatPetWidgetHost;
	readonly windowId: number;
	readonly preferred: IObservable<boolean> | undefined;
	readonly active: ISettableObservable<boolean>;
	readonly store: DisposableStore;
}

interface IChatPetWindowEntry {
	readonly pet: IChatPetWidgetInstance;
	readonly dormantHost: IChatPetWidgetHost;
	activeHost: IChatPetHostEntry | undefined;
}

export class ChatPetWidgetCoordinator extends Disposable {

	private readonly hosts = new Map<object, IChatPetHostEntry>();
	private readonly windows = new Map<number, IChatPetWindowEntry>();

	constructor(
		private readonly createPet: (host: IChatPetWidgetHost) => IChatPetWidgetInstance,
		private readonly chatWidgetService: IChatWidgetService,
		onWillUnregisterWindow: Event<number> = Event.None,
	) {
		super();
		this._register(this.chatWidgetService.onDidChangeFocusedWidget(widget => {
			const host = widget ? this.hosts.get(widget) : undefined;
			if (host) {
				this.activate(host);
			}
		}));
		this._register(onWillUnregisterWindow(windowId => this.disposeWindow(windowId)));
	}

	register(owner: object, host: IChatPetWidgetHost, preferred?: IObservable<boolean>, onDidFocus?: Event<void>): IChatPetWidgetHostRegistration {
		if (this.hosts.has(owner)) {
			throw new Error('Cannot register the same chat pet host multiple times');
		}

		const windowId = dom.getWindowId(dom.getWindow(host.parent));
		const entry: IChatPetHostEntry = {
			owner,
			host,
			windowId,
			preferred,
			active: observableValue(this, false),
			store: new DisposableStore(),
		};
		this.hosts.set(owner, entry);

		if (onDidFocus) {
			entry.store.add(onDidFocus(() => this.activate(entry)));
		}

		if (preferred) {
			entry.store.add(autorun(reader => {
				if (preferred.read(reader)) {
					this.activate(entry);
				} else if (entry.active.read(reader)) {
					const replacement = this.findPreferredHost(windowId);
					if (replacement) {
						this.activate(replacement);
					}
				}
			}));
		}

		if (this.chatWidgetService.lastFocusedWidget === owner || (!preferred && !this.windows.has(windowId))) {
			this.activate(entry);
		}

		return {
			active: entry.active,
			dispose: () => this.unregister(entry),
		};
	}

	private activate(entry: IChatPetHostEntry): void {
		const current = this.windows.get(entry.windowId);
		if (current?.activeHost === entry) {
			return;
		}

		if (current) {
			current.pet.setHost(entry.host);
			transaction(tx => {
				current.activeHost?.active.set(false, tx);
				entry.active.set(true, tx);
			});
			current.activeHost = entry;
			return;
		}

		const pet = this.createPet(entry.host);
		entry.active.set(true, undefined);
		this.windows.set(entry.windowId, {
			pet,
			dormantHost: this.createDormantHost(),
			activeHost: entry,
		});
	}

	private unregister(entry: IChatPetHostEntry): void {
		if (this.hosts.get(entry.owner) !== entry) {
			return;
		}

		entry.store.dispose();
		this.hosts.delete(entry.owner);
		const windowEntry = this.windows.get(entry.windowId);
		if (windowEntry?.activeHost !== entry) {
			return;
		}

		entry.active.set(false, undefined);
		const replacement = this.findReplacementHost(entry.windowId);
		if (replacement) {
			this.activate(replacement);
		} else {
			windowEntry.pet.setHost(windowEntry.dormantHost);
			windowEntry.activeHost = undefined;
		}
	}

	private createDormantHost(): IChatPetWidgetHost {
		// Auxiliary windows forbid `createElement` on their own document, so the
		// parked host is created in the main window realm.
		const parent = dom.$('div');
		return {
			parent,
			dragBounds: parent,
			movementBounds: parent,
			model: constObservable(undefined),
			hasInput: constObservable(false),
			inputChanged: Event.None,
			getPlatformTop: () => undefined,
			onDidChangePlatform: Event.None,
		};
	}

	private disposeWindow(windowId: number): void {
		const windowEntry = this.windows.get(windowId);
		if (!windowEntry) {
			return;
		}
		windowEntry.activeHost?.active.set(false, undefined);
		windowEntry.pet.dispose();
		this.windows.delete(windowId);
	}

	private findPreferredHost(windowId: number): IChatPetHostEntry | undefined {
		return this.getWindowHosts(windowId).find(entry => entry.preferred?.get());
	}

	private findReplacementHost(windowId: number): IChatPetHostEntry | undefined {
		const hosts = this.getWindowHosts(windowId);
		const preferred = hosts.find(entry => entry.preferred?.get());
		if (preferred) {
			return preferred;
		}
		const focused = this.chatWidgetService.lastFocusedWidget;
		return hosts.find(entry => entry.owner === focused) ?? hosts[0];
	}

	private getWindowHosts(windowId: number): IChatPetHostEntry[] {
		return Array.from(this.hosts.values()).filter(entry => entry.windowId === windowId);
	}

	override dispose(): void {
		for (const entry of this.hosts.values()) {
			entry.store.dispose();
		}
		this.hosts.clear();
		for (const entry of this.windows.values()) {
			entry.pet.dispose();
		}
		this.windows.clear();
		super.dispose();
	}
}

export class ChatPetWidgetService extends Disposable implements IChatPetWidgetService {

	declare readonly _serviceBrand: undefined;

	private readonly coordinator: ChatPetWidgetCoordinator;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
	) {
		super();
		this.coordinator = this._register(new ChatPetWidgetCoordinator(
			host => instantiationService.createInstance(ChatPetWidget, host, undefined),
			chatWidgetService,
			Event.map(dom.onWillUnregisterWindow, window => dom.getWindowId(window)),
		));
	}

	register(owner: object, host: IChatPetWidgetHost, preferred?: IObservable<boolean>, onDidFocus?: Event<void>): IChatPetWidgetHostRegistration {
		return this.coordinator.register(owner, host, preferred, onDidFocus);
	}
}
