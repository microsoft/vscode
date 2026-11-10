/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { StorageValue } from '../../../../../base/parts/storage/common/storage.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IApplicationSharedStorageValueChangeEvent, IApplicationStorageValueChangeEvent, InMemoryStorageService, IProfileStorageValueChangeEvent, IStorageEntry, IStorageService, IStorageValueChangeEvent, IWorkspaceStorageValueChangeEvent, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AGENTS_WINDOW_PROFILE_ID, IUserDataProfile, IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileStorageService } from '../../../../../platform/userDataProfile/common/userDataProfileStorageService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { SessionsStorageService } from '../../../../services/sessions/browser/sessionsStorageService.js';
import { AgentsViewStateReadyContext } from './agentsView.js';

/** How long writes of the list wait to go to the Agents window's profile together. */
const WRITE_DELAY = 100;

/** How long changes of the Agents window's profile wait to be read together. */
const READ_DELAY = 50;

/**
 * The storage of the Sessions view of an editor window: the window's storage, except that the profile state of the
 * sessions list, such as its grouping, filters and groups, is that of the Agents window's profile, so that both show the
 * same list. That state loads once, as the service is created, and {@link AgentsViewStateReadyContext} tells when; until then, the profile state reads empty and writes to it are
 * dropped, so that nothing written before it loads replaces what the Agents window has.
 *
 * Where there is no Agents window, such as on the web, the profile state is the window's own.
 */
export class AgentsProfileSessionsStorageService extends SessionsStorageService implements IDisposable {

	private readonly disposables = new DisposableStore();
	private readonly profileState = this.disposables.add(new InMemoryStorageService());
	private profile: IUserDataProfile | undefined;
	private ready: Promise<void> | undefined;
	/** Until the state loads, its profile state is pending; then the Agents window's profile's, or the window's own. */
	private mode: 'pending' | 'profile' | 'window' = 'pending';

	private readonly pendingWrites = new Map<string, { readonly value: string | undefined; readonly target: StorageTarget }>();
	private readonly writeScheduler = this.disposables.add(new RunOnceScheduler(() => this.write(), WRITE_DELAY));
	private readonly readScheduler = this.disposables.add(new RunOnceScheduler(() => this.read(), READ_DELAY));

	constructor(
		@IStorageService storageService: IStorageService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileStorageService private readonly userDataProfileStorageService: IUserDataProfileStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(storageService);

		const readyContext = AgentsViewStateReadyContext.bindTo(contextKeyService);
		this.whenReady().finally(() => readyContext.set(true));

		this.disposables.add(this.profileState.onDidChangeValue(StorageScope.PROFILE, undefined, this.disposables)(e => {
			if (!e.external) {
				this.pendingWrites.set(e.key, { value: this.profileState.get(e.key, StorageScope.PROFILE), target: e.target ?? StorageTarget.USER });
				this.writeScheduler.schedule();
			}
		}));
		this.disposables.add(lifecycleService.onWillShutdown(e => {
			if (this.pendingWrites.size) {
				this.writeScheduler.cancel();
				e.join(this.write(), { id: 'join.agentsViewSessionsState', label: 'Saving the sessions list' });
			}
		}));
	}

	/** Loads the state the window shares, once, from when the service is created; resolves when the sessions list can read it. */
	whenReady(): Promise<void> {
		this.ready ??= this.load();
		return this.ready;
	}

	private async load(): Promise<void> {
		const profile = await this.resolveProfile();
		if (!profile) {
			this.mode = 'window';
			return;
		}
		this.profile = profile;
		try {
			await this.read();
		} catch (error) {
			this.logService.error('[AgentsView] Could not read the sessions list state of the Agents window', error);
			this.profile = undefined;
			this.mode = 'window';
			return;
		}
		this.disposables.add(this.userDataProfileStorageService.onDidChange(e => {
			if (e.valueChanges.some(change => change.profile.id === profile.id)) {
				this.readScheduler.schedule();
			}
		}));
		this.mode = 'profile';
	}

	private async resolveProfile(): Promise<IUserDataProfile | undefined> {
		if (isWeb) {
			return undefined;
		}
		const existing = this.userDataProfilesService.profiles.find(profile => profile.id === AGENTS_WINDOW_PROFILE_ID);
		if (existing) {
			return this.storageService.hasScope(existing) ? undefined : existing;
		}
		try {
			return await this.userDataProfilesService.createProfile(AGENTS_WINDOW_PROFILE_ID, 'Agents');
		} catch (error) {
			this.logService.error('[AgentsView] Could not create the profile of the Agents window', error);
			return undefined;
		}
	}

	private async read(): Promise<void> {
		const profile = this.profile;
		if (!profile) {
			return;
		}
		const data = await this.userDataProfileStorageService.readStorageData(profile);
		const entries: IStorageEntry[] = [];
		for (const [key, { value, target, scope }] of data) {
			if ((scope ?? StorageScope.PROFILE) === StorageScope.PROFILE && !this.pendingWrites.has(key) && this.profileState.get(key, StorageScope.PROFILE) !== value) {
				entries.push({ key, value, scope: StorageScope.PROFILE, target });
			}
		}
		for (const key of [...this.profileState.keys(StorageScope.PROFILE, StorageTarget.USER), ...this.profileState.keys(StorageScope.PROFILE, StorageTarget.MACHINE)]) {
			if (!data.has(key) && !this.pendingWrites.has(key)) {
				entries.push({ key, value: undefined, scope: StorageScope.PROFILE, target: StorageTarget.USER });
			}
		}
		if (entries.length) {
			// External, also on the first read: the values come from the Agents window and must not be written back to it
			this.profileState.storeAll(entries, true);
		}
	}

	private async write(): Promise<void> {
		const profile = this.profile;
		if (!profile || !this.pendingWrites.size) {
			return;
		}
		const byTarget = new Map<StorageTarget, Map<string, string | undefined>>();
		for (const [key, { value, target }] of this.pendingWrites) {
			let items = byTarget.get(target);
			if (!items) {
				items = new Map();
				byTarget.set(target, items);
			}
			items.set(key, value);
		}
		this.pendingWrites.clear();
		for (const [target, items] of byTarget) {
			try {
				await this.userDataProfileStorageService.updateStorageData(profile, items, target);
			} catch (error) {
				this.logService.error('[AgentsView] Could not save the sessions list state of the Agents window', error);
			}
		}
	}

	private isRedirected(scope: StorageScope): boolean {
		return scope === StorageScope.PROFILE && this.mode !== 'window';
	}

	override onDidChangeValue(scope: StorageScope.WORKSPACE, key: string | undefined, disposable: DisposableStore): Event<IWorkspaceStorageValueChangeEvent>;
	override onDidChangeValue(scope: StorageScope.PROFILE, key: string | undefined, disposable: DisposableStore): Event<IProfileStorageValueChangeEvent>;
	override onDidChangeValue(scope: StorageScope.APPLICATION, key: string | undefined, disposable: DisposableStore): Event<IApplicationStorageValueChangeEvent>;
	override onDidChangeValue(scope: StorageScope.APPLICATION_SHARED, key: string | undefined, disposable: DisposableStore): Event<IApplicationSharedStorageValueChangeEvent>;
	override onDidChangeValue(scope: StorageScope, key: string | undefined, disposable: DisposableStore): Event<IStorageValueChangeEvent>;
	override onDidChangeValue(scope: StorageScope, key: string | undefined, disposable: DisposableStore): Event<IStorageValueChangeEvent> {
		return this.isRedirected(scope) ? this.profileState.onDidChangeValue(StorageScope.PROFILE, key, disposable) : super.onDidChangeValue(scope, key, disposable);
	}

	override get(key: string, scope: StorageScope, fallbackValue: string): string;
	override get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined;
	override get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined {
		if (!this.isRedirected(scope)) {
			return super.get(key, scope, fallbackValue);
		}
		return fallbackValue === undefined ? this.profileState.get(key, scope) : this.profileState.get(key, scope, fallbackValue);
	}

	override getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	override getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined;
	override getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined {
		if (!this.isRedirected(scope)) {
			return super.getBoolean(key, scope, fallbackValue);
		}
		return fallbackValue === undefined ? this.profileState.getBoolean(key, scope) : this.profileState.getBoolean(key, scope, fallbackValue);
	}

	override getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
	override getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined;
	override getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined {
		if (!this.isRedirected(scope)) {
			return super.getNumber(key, scope, fallbackValue);
		}
		return fallbackValue === undefined ? this.profileState.getNumber(key, scope) : this.profileState.getNumber(key, scope, fallbackValue);
	}

	override getObject<T extends object>(key: string, scope: StorageScope, fallbackValue: T): T;
	override getObject<T extends object>(key: string, scope: StorageScope, fallbackValue?: T): T | undefined;
	override getObject<T extends object>(key: string, scope: StorageScope, fallbackValue?: T): T | undefined {
		if (!this.isRedirected(scope)) {
			return super.getObject(key, scope, fallbackValue);
		}
		const profileState: IStorageService = this.profileState;
		return profileState.getObject(key, scope, fallbackValue);
	}

	override store(key: string, value: StorageValue, scope: StorageScope, target: StorageTarget): void {
		if (!this.isRedirected(scope)) {
			return super.store(key, value, scope, target);
		}
		if (this.mode === 'pending') {
			this.logService.warn(`[AgentsView] Dropped a write of '${key}' before the sessions list state loaded`);
			return;
		}
		this.profileState.store(key, value, scope, target);
	}

	override storeAll(entries: IStorageEntry[], _external: boolean): void {
		for (const entry of entries) {
			this.store(entry.key, entry.value, entry.scope, entry.target);
		}
	}

	override remove(key: string, scope: StorageScope): void {
		if (!this.isRedirected(scope)) {
			return super.remove(key, scope);
		}
		if (this.mode === 'pending') {
			this.logService.warn(`[AgentsView] Dropped a removal of '${key}' before the sessions list state loaded`);
			return;
		}
		this.profileState.remove(key, scope);
	}

	override keys(scope: StorageScope, target: StorageTarget): string[] {
		return this.isRedirected(scope) ? this.profileState.keys(scope, target) : super.keys(scope, target);
	}

	dispose(): void {
		this.disposables.dispose();
	}
}
