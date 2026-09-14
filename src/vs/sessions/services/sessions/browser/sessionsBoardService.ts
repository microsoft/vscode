/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import type { SessionView } from '../../../browser/parts/sessionView.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { SessionStatus } from '../common/session.js';

export interface ISessionsBoardOptions {
	readonly grouping: 'project' | 'collection';
	readonly sort: 'created' | 'updated';
	readonly compact: boolean;
	readonly filter: string;
	readonly status: SessionStatus | undefined;
	readonly showChanges: boolean;
	readonly showArtifacts: boolean;
	readonly showPullRequest: boolean;
	readonly showReply: boolean;
	readonly showBranch: boolean;
}

export interface ISavedSessionsBoardView {
	readonly id: string;
	readonly name: string;
	readonly options: ISessionsBoardOptions;
}

export interface ISessionsBoardView {
	readonly sessions: readonly IActiveSession[];
	focusSession(sessionId: string | undefined): void;
	getSessionView(sessionId: string | undefined): SessionView | undefined;
	getFocusedSessionView(): SessionView | undefined;
	resizeCard(sessionId: string | undefined, widthChange: number, heightChange: number): void;
	resetLayout(): void;
	toggleMaximizeSession(sessionId: string | undefined): boolean | undefined;
}

export interface ISessionsBoardService {
	readonly _serviceBrand: undefined;
	readonly options: IObservable<ISessionsBoardOptions>;
	readonly savedViews: IObservable<readonly ISavedSessionsBoardView[]>;
	readonly activeView: IObservable<ISessionsBoardView | undefined>;
	updateOptions(options: Partial<ISessionsBoardOptions>): void;
	saveView(name: string): void;
	selectView(id: string): void;
	registerView(view: ISessionsBoardView): IDisposable;
}

export const ISessionsBoardService = createDecorator<ISessionsBoardService>('sessionsBoardService');

export const DEFAULT_SESSIONS_BOARD_OPTIONS: ISessionsBoardOptions = {
	grouping: 'project',
	sort: 'created',
	compact: true,
	filter: '',
	status: undefined,
	showChanges: true,
	showArtifacts: true,
	showPullRequest: true,
	showReply: true,
	showBranch: false,
};

function isBoardOptions(value: unknown): value is ISessionsBoardOptions {
	if (typeof value !== 'object' || !value) {
		return false;
	}
	const options = value as Partial<ISessionsBoardOptions>;
	return (options.grouping === 'project' || options.grouping === 'collection')
		&& (options.sort === 'created' || options.sort === 'updated')
		&& typeof options.filter === 'string'
		&& (options.status === undefined || [SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.Completed, SessionStatus.Error].includes(options.status))
		&& [options.compact, options.showChanges, options.showArtifacts, options.showPullRequest, options.showReply, options.showBranch].every(value => typeof value === 'boolean');
}

function isSavedView(value: unknown): value is ISavedSessionsBoardView {
	return typeof value === 'object' && value !== null
		&& 'id' in value && typeof value.id === 'string'
		&& 'name' in value && typeof value.name === 'string'
		&& 'options' in value && isBoardOptions(value.options);
}

function isStoredBoardState(value: unknown): value is { options: ISessionsBoardOptions; views: ISavedSessionsBoardView[] } {
	return typeof value === 'object' && value !== null
		&& 'options' in value && isBoardOptions(value.options)
		&& 'views' in value && Array.isArray(value.views) && value.views.every(isSavedView);
}

export class SessionsBoardService extends Disposable implements ISessionsBoardService {
	declare readonly _serviceBrand: undefined;
	private static readonly STORAGE_KEY = 'sessions.board.views';
	private readonly _options = observableValue<ISessionsBoardOptions>(this, DEFAULT_SESSIONS_BOARD_OPTIONS);
	readonly options: IObservable<ISessionsBoardOptions> = this._options;
	private readonly _savedViews = observableValue<readonly ISavedSessionsBoardView[]>(this, []);
	readonly savedViews: IObservable<readonly ISavedSessionsBoardView[]> = this._savedViews;
	private readonly _activeView = observableValue<ISessionsBoardView | undefined>(this, undefined);
	readonly activeView: IObservable<ISessionsBoardView | undefined> = this._activeView;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const raw = this.storageService.get(SessionsBoardService.STORAGE_KEY, StorageScope.PROFILE);
		if (raw) {
			try {
				const value: unknown = JSON.parse(raw);
				if (!isStoredBoardState(value)) {
					throw new Error('Invalid session board views');
				}
				this._options.set(value.options, undefined);
				this._savedViews.set(value.views, undefined);
			} catch (error) {
				this.logService.warn('[SessionsBoardService] Failed to restore board views', error);
			}
		}
	}

	updateOptions(options: Partial<ISessionsBoardOptions>): void {
		this._options.set({ ...this._options.get(), ...options }, undefined);
		this._save();
	}

	saveView(name: string): void {
		const label = name.trim();
		if (!label) {
			throw new Error(localize('sessionsBoard.emptyViewName', "Enter a name for the view."));
		}
		const views = this._savedViews.get();
		const existing = views.find(view => view.name === label);
		const view: ISavedSessionsBoardView = { id: existing?.id ?? generateUuid(), name: label, options: { ...this._options.get() } };
		this._savedViews.set(existing ? views.map(item => item.id === existing.id ? view : item) : [...views, view], undefined);
		this._save();
	}

	selectView(id: string): void {
		const view = this._savedViews.get().find(view => view.id === id);
		if (!view) {
			throw new Error(localize('sessionsBoard.missingView', "This session board view no longer exists."));
		}
		this._options.set({ ...view.options }, undefined);
		this._save();
	}

	registerView(view: ISessionsBoardView): IDisposable {
		this._activeView.set(view, undefined);
		return toDisposable(() => {
			if (this._activeView.get() === view) {
				this._activeView.set(undefined, undefined);
			}
		});
	}

	private _save(): void {
		this.storageService.store(SessionsBoardService.STORAGE_KEY, JSON.stringify({ options: this._options.get(), views: this._savedViews.get() }), StorageScope.PROFILE, StorageTarget.USER);
	}
}

registerSingleton(ISessionsBoardService, SessionsBoardService, InstantiationType.Delayed);
