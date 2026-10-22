/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { equals } from '../../../../base/common/objects.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

/** Experiment-controlled setting that selects the Get Started checklist variant. */
export const GET_STARTED_CHECKLIST_SETTING = 'sessions.getStarted.checklist';

/** Where the checklist appears in the sessions view, or `none` for the control arm. */
export const enum GetStartedChecklistMode {
	None = 'none',
	/** Above the sessions list. */
	AboveSessions = 'aboveSessions',
	/** Below the sessions list, above Customizations. */
	BelowSessions = 'belowSessions',
}

export function toGetStartedChecklistMode(value: unknown): GetStartedChecklistMode {
	return value === GetStartedChecklistMode.AboveSessions || value === GetStartedChecklistMode.BelowSessions ? value : GetStartedChecklistMode.None;
}

export const enum GetStartedItemId {
	StartSession = 'startSession',
	RunInParallel = 'runInParallel',
	SecondProject = 'secondProject',
	KeepChanges = 'keepChanges',
	Automation = 'automation',
}

export const GET_STARTED_ITEM_IDS: readonly GetStartedItemId[] = [
	GetStartedItemId.StartSession,
	GetStartedItemId.RunInParallel,
	GetStartedItemId.SecondProject,
	GetStartedItemId.KeepChanges,
	GetStartedItemId.Automation,
];

/** Id for `onboarding.developerMode`, which previews the checklist regardless of eligibility. */
export const GET_STARTED_DEVELOPER_MODE_ID = 'sessions.getStarted.checklist';

/** Users who have created fewer sessions than this when they first see the checklist are eligible. */
const GET_STARTED_MAX_SESSIONS_FOR_ELIGIBILITY = 2;

/** Machine-local storage key, like the Agents window usage counts. */
export const GET_STARTED_STATE_STORAGE_KEY = 'agentSessions.getStarted.state';

/** A snapshot of the product state that completes checklist items. */
export interface IGetStartedSignals {
	/** Sessions ever created in the Agents window on this machine. */
	readonly createdSessionCount: number;
	/** Sessions whose agent is working or waiting for input right now. */
	readonly runningSessionCount: number;
	/** Distinct projects that have sessions, as the sessions list groups them. */
	readonly projectCount: number;
	/** Whether an operation that keeps a session's changes (merge, commit, pull request, ...) is running. */
	readonly keepingChanges: boolean;
	/** Defined automations. */
	readonly automationCount: number;
}

/** Returns the items that the given product state completes. */
export function getCompletedGetStartedItems(signals: IGetStartedSignals): GetStartedItemId[] {
	const completed: GetStartedItemId[] = [];
	if (signals.createdSessionCount >= 1) {
		completed.push(GetStartedItemId.StartSession);
	}
	if (signals.runningSessionCount >= 2) {
		completed.push(GetStartedItemId.RunInParallel);
	}
	if (signals.projectCount >= 2) {
		completed.push(GetStartedItemId.SecondProject);
	}
	if (signals.keepingChanges) {
		completed.push(GetStartedItemId.KeepChanges);
	}
	if (signals.automationCount >= 1) {
		completed.push(GetStartedItemId.Automation);
	}
	return completed;
}

export interface IGetStartedPersistedState {
	/** Decided once, the first time an AI-enabled user sees the place where the checklist appears. */
	readonly eligible?: boolean;
	readonly completed: readonly GetStartedItemId[];
	/** Collapsed to its heading by the user. */
	readonly collapsed?: boolean;
	/** "Don't Show Again". */
	readonly dismissed?: boolean;
}

export function readGetStartedState(storageService: IStorageService): IGetStartedPersistedState {
	const raw = storageService.get(GET_STARTED_STATE_STORAGE_KEY, StorageScope.APPLICATION);
	if (!raw) {
		return normalizeGetStartedState(undefined);
	}
	try {
		return normalizeGetStartedState(JSON.parse(raw));
	} catch {
		return normalizeGetStartedState(undefined);
	}
}

function normalizeGetStartedState(parsed: unknown): IGetStartedPersistedState {
	const value = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
	const completed = Array.isArray(value.completed) ? value.completed : [];
	return {
		eligible: typeof value.eligible === 'boolean' ? value.eligible : undefined,
		completed: GET_STARTED_ITEM_IDS.filter(id => completed.includes(id)),
		collapsed: typeof value.collapsed === 'boolean' ? value.collapsed : undefined,
		dismissed: value.dismissed === true ? true : undefined,
	};
}

export interface IGetStartedItemState {
	readonly id: GetStartedItemId;
	readonly done: boolean;
}

/**
 * Tracks checklist eligibility and progress in every experiment arm, so that the
 * experiment trigger and completion state never depend on the assigned variant.
 */
export class GetStartedChecklistModel extends Disposable {

	private readonly _state = observableValue<IGetStartedPersistedState>(this, { completed: [] });
	readonly state: IObservable<IGetStartedPersistedState> = this._state;

	/** Items offered to the user, in order, with their completion state. */
	readonly items: IObservable<readonly IGetStartedItemState[]>;
	readonly allDone: IObservable<boolean>;

	private readonly _onDidCompleteItems = this._register(new Emitter<readonly GetStartedItemId[]>());
	/** Fires with the items that this window's signals complete, after they are stored. */
	readonly onDidCompleteItems: Event<readonly GetStartedItemId[]> = this._onDidCompleteItems.event;

	constructor(
		private readonly _signals: IObservable<IGetStartedSignals>,
		automationsAvailable: IObservable<boolean>,
		private readonly _storageService: IStorageService,
		/** Developer-mode previews track progress even for users who are not eligible. */
		forceEligible: IObservable<boolean> = constObservable(false),
	) {
		super();
		this._state.set(readGetStartedState(_storageService), undefined);

		// Keep windows in sync.
		const storageListener = this._register(new DisposableStore());
		this._register(_storageService.onDidChangeValue(StorageScope.APPLICATION, GET_STARTED_STATE_STORAGE_KEY, storageListener)(() => {
			const stored = readGetStartedState(_storageService);
			if (!equals(stored, this._state.get())) {
				this._state.set(stored, undefined);
			}
		}));

		this.items = derived(this, reader => {
			const completed = this._state.read(reader).completed;
			const showAutomation = automationsAvailable.read(reader) || completed.includes(GetStartedItemId.Automation);
			return GET_STARTED_ITEM_IDS
				.filter(id => id !== GetStartedItemId.Automation || showAutomation)
				.map(id => ({ id, done: completed.includes(id) }));
		});
		this.allDone = derived(this, reader => this.items.read(reader).every(item => item.done));

		// Tracks eligible users only, so nothing is stored for others. Completed items stay
		// completed, even when the signal that completed them goes away.
		this._register(autorun(reader => {
			const state = this._state.read(reader);
			if (state.eligible !== true && !forceEligible.read(reader)) {
				return;
			}
			const newlyCompleted = getCompletedGetStartedItems(_signals.read(reader)).filter(id => !state.completed.includes(id));
			if (newlyCompleted.length > 0) {
				this._update({ completed: GET_STARTED_ITEM_IDS.filter(id => state.completed.includes(id) || newlyCompleted.includes(id)) });
				this._onDidCompleteItems.fire(newlyCompleted);
			}
		}));
	}

	/**
	 * Decides eligibility the first time the user can see the checklist's place, and keeps it.
	 * What an eligible user already did counts as done, without being reported as completed,
	 * because they did it before seeing the checklist.
	 * @returns whether the user is eligible.
	 */
	decideEligibility(createdSessionCount: number): boolean {
		const state = this._state.get();
		if (state.eligible !== undefined) {
			return state.eligible;
		}
		const eligible = createdSessionCount < GET_STARTED_MAX_SESSIONS_FOR_ELIGIBILITY;
		if (eligible) {
			const alreadyDone = getCompletedGetStartedItems(this._signals.get());
			this._update({ eligible, completed: GET_STARTED_ITEM_IDS.filter(id => state.completed.includes(id) || alreadyDone.includes(id)) });
		} else {
			this._update({ eligible });
		}
		return eligible;
	}

	setCollapsed(collapsed: boolean): void {
		this._update({ collapsed });
	}

	dismiss(): void {
		this._update({ dismissed: true });
	}

	/** Brings the checklist back after "Don't Show Again", expanded. */
	restore(): void {
		this._update({ dismissed: undefined, collapsed: false });
	}

	private _update(patch: Partial<IGetStartedPersistedState>): void {
		const next = normalizeGetStartedState({ ...this._state.get(), ...patch });
		this._storageService.store(GET_STARTED_STATE_STORAGE_KEY, JSON.stringify(next), StorageScope.APPLICATION, StorageTarget.MACHINE);
		if (!equals(next, this._state.get())) {
			this._state.set(next, undefined);
		}
	}
}
