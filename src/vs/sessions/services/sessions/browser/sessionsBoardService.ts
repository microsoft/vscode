/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { deepFreeze, equals } from '../../../../base/common/objects.js';
import { IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import type { SessionView } from '../../../browser/parts/sessionView.js';
import { ISession, SessionStatus } from '../common/session.js';
import { ISessionCardBoardSize, ISessionCardBoardState, SESSION_CARD_MAX_HEIGHT } from '../common/sessionCardLayout.js';
import { isPromotableSessionWorkView, PromotableSessionWorkView, SESSION_WORK_VIEWS, SessionWorkView } from '../common/sessionWorkQuery.js';

export interface ISessionsBoardOptions {
	readonly view?: SessionWorkView;
	readonly collection?: string;
	readonly inactivityDays?: number;
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
	readonly sessions: readonly ISession[];
	getAccessibleContent?(): string;
	getAccessibilityHelp?(): string;
	focusSearch?(): void;
	startNewWork?(): Promise<void>;
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
	readonly promotedViews: IObservable<readonly PromotableSessionWorkView[]>;
	readonly cardLayouts: IObservable<ReadonlyMap<string, ISessionCardBoardState>>;
	readonly collapsedSections: IObservable<ReadonlyMap<string, boolean>>;
	readonly activeView: IObservable<ISessionsBoardView | undefined>;
	updateOptions(options: Partial<ISessionsBoardOptions>): void;
	setViewPromoted(view: PromotableSessionWorkView, promoted: boolean): void;
	getCardLayout(scope: string): ISessionCardBoardState | undefined;
	/** Merges filtered edits without discarding hidden or unavailable sessions. The unfiltered canonical order seeds newly discovered cards. */
	setCardLayout(scope: string, layout: ISessionCardBoardState, canonicalOrder: readonly string[]): void;
	resetCardLayout(scope: string): void;
	setSectionCollapsed(scope: string, collapsed: boolean): void;
	/** Keeps the source position and prefers its explicit size over any replacement size. */
	rebindCardSession(previousId: string, sessionId: string): void;
	removeCardSession(sessionId: string): void;
	saveView(name: string): void;
	selectView(id: string): void;
	deleteView(id: string): void;
	registerView(view: ISessionsBoardView): IDisposable;
}

export const ISessionsBoardService = createDecorator<ISessionsBoardService>('sessionsBoardService');

export const DEFAULT_SESSIONS_BOARD_OPTIONS: ISessionsBoardOptions = {
	view: 'overview',
	inactivityDays: 30,
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
	return (options.view === undefined || SESSION_WORK_VIEWS.includes(options.view))
		&& (options.collection === undefined || typeof options.collection === 'string')
		&& (options.inactivityDays === undefined || Number.isInteger(options.inactivityDays) && options.inactivityDays >= 1 && options.inactivityDays <= 3650)
		&& (options.grouping === 'project' || options.grouping === 'collection')
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

interface IStoredBoardState {
	readonly options: ISessionsBoardOptions;
	readonly views: readonly ISavedSessionsBoardView[];
	readonly promotedViews?: readonly PromotableSessionWorkView[];
}

function isStoredBoardState(value: unknown): value is IStoredBoardState {
	return typeof value === 'object' && value !== null
		&& 'options' in value && isBoardOptions(value.options)
		&& 'views' in value && Array.isArray(value.views) && value.views.every(isSavedView)
		&& (!('promotedViews' in value) || Array.isArray(value.promotedViews) && value.promotedViews.every(isPromotableSessionWorkView));
}

function normalizeBoardOptions(options: ISessionsBoardOptions): ISessionsBoardOptions {
	return { ...options, view: options.view === 'cards' ? 'overview' : options.view ?? 'overview', status: options.status };
}

interface IStoredCardLayoutState {
	readonly version: 1;
	readonly cardLayouts: readonly (ISessionCardBoardState & { readonly scope: string })[];
	readonly collapsedSections: readonly { readonly scope: string; readonly collapsed: boolean }[];
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function isCardOrder(value: unknown): value is readonly string[] {
	if (!Array.isArray(value)) {
		return false;
	}
	const ids = new Set<string>();
	for (const id of value) {
		if (!isNonEmptyString(id) || ids.has(id)) {
			return false;
		}
		ids.add(id);
	}
	return true;
}

function isCardSize(value: unknown): value is ISessionCardBoardSize {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		&& 'id' in value && isNonEmptyString(value.id)
		&& 'columnSpan' in value && typeof value.columnSpan === 'number' && Number.isInteger(value.columnSpan) && value.columnSpan >= 1 && value.columnSpan <= 3
		&& (!('height' in value) || value.height === undefined
			|| typeof value.height === 'number' && Number.isFinite(value.height) && value.height >= 100 && value.height <= SESSION_CARD_MAX_HEIGHT);
}

function isCardLayout(value: unknown): value is ISessionCardBoardState {
	if (typeof value !== 'object' || value === null || Array.isArray(value)
		|| !('order' in value) || !isCardOrder(value.order)
		|| !('sizes' in value) || !Array.isArray(value.sizes)) {
		return false;
	}
	const order = new Set(value.order);
	const sizes = new Set<string>();
	for (const size of value.sizes) {
		if (!isCardSize(size) || !order.has(size.id) || sizes.has(size.id)) {
			return false;
		}
		sizes.add(size.id);
	}
	return true;
}

function isStoredCardLayoutState(value: unknown): value is IStoredCardLayoutState {
	if (typeof value !== 'object' || value === null || Array.isArray(value)
		|| !('version' in value) || value.version !== 1
		|| !('cardLayouts' in value) || !Array.isArray(value.cardLayouts)
		|| !('collapsedSections' in value) || !Array.isArray(value.collapsedSections)) {
		return false;
	}
	const layoutScopes = new Set<string>();
	for (const layout of value.cardLayouts) {
		if (!isCardLayout(layout) || !('scope' in layout) || !isNonEmptyString(layout.scope) || layoutScopes.has(layout.scope)) {
			return false;
		}
		layoutScopes.add(layout.scope);
	}
	const sectionScopes = new Set<string>();
	for (const section of value.collapsedSections) {
		if (typeof section !== 'object' || section === null || Array.isArray(section)
			|| !('scope' in section) || !isNonEmptyString(section.scope) || sectionScopes.has(section.scope)
			|| !('collapsed' in section) || typeof section.collapsed !== 'boolean') {
			return false;
		}
		sectionScopes.add(section.scope);
	}
	return true;
}

function freezeCardLayout(layout: ISessionCardBoardState): ISessionCardBoardState {
	return deepFreeze({
		order: [...layout.order],
		sizes: layout.sizes.map(size => ({
			id: size.id,
			columnSpan: size.columnSpan,
			...(size.height === undefined ? {} : { height: size.height }),
		})),
	});
}

/** A frozen facade protects map entries, which Object.freeze on a Map cannot protect. */
function toReadonlyMap<T>(entries?: Iterable<readonly [string, T]>): ReadonlyMap<string, T> {
	const map = new Map(entries);
	const result: ReadonlyMap<string, T> = {
		size: map.size,
		get: key => map.get(key),
		has: key => map.has(key),
		entries: () => map.entries(),
		keys: () => map.keys(),
		values: () => map.values(),
		forEach: (callback, thisArg) => map.forEach((value, key) => callback.call(thisArg, value, key, result)),
		[Symbol.iterator]: () => map[Symbol.iterator](),
	};
	return Object.freeze(result);
}

function validateCardScope(scope: string): void {
	if (!isNonEmptyString(scope)) {
		throw new Error(localize('sessionsBoard.invalidCardScope', "The session card layout scope is invalid."));
	}
}

function validateCardSessionId(sessionId: string): void {
	if (!isNonEmptyString(sessionId)) {
		throw new Error(localize('sessionsBoard.invalidCardSession', "The session card identifier is invalid."));
	}
}

export class SessionsBoardService extends Disposable implements ISessionsBoardService {
	declare readonly _serviceBrand: undefined;
	private static readonly STORAGE_KEY = 'sessions.board.views';
	private static readonly LAYOUT_STORAGE_KEY = 'sessions.board.layouts';
	private readonly _options = observableValue<ISessionsBoardOptions>(this, DEFAULT_SESSIONS_BOARD_OPTIONS);
	readonly options: IObservable<ISessionsBoardOptions> = this._options;
	private readonly _savedViews = observableValue<readonly ISavedSessionsBoardView[]>(this, []);
	readonly savedViews: IObservable<readonly ISavedSessionsBoardView[]> = this._savedViews;
	private readonly _promotedViews = observableValue<readonly PromotableSessionWorkView[]>(this, []);
	readonly promotedViews: IObservable<readonly PromotableSessionWorkView[]> = this._promotedViews;
	private readonly _cardLayouts = observableValue<ReadonlyMap<string, ISessionCardBoardState>>(this, toReadonlyMap());
	readonly cardLayouts: IObservable<ReadonlyMap<string, ISessionCardBoardState>> = this._cardLayouts;
	private readonly _collapsedSections = observableValue<ReadonlyMap<string, boolean>>(this, toReadonlyMap());
	readonly collapsedSections: IObservable<ReadonlyMap<string, boolean>> = this._collapsedSections;
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
				const options = normalizeBoardOptions(value.options);
				const views = value.views.map(view => ({ ...view, options: normalizeBoardOptions(view.options) }));
				const promotedViews = [...new Set(value.promotedViews ?? [])];
				transaction(tx => {
					this._options.set(options, tx);
					this._savedViews.set(views, tx);
					this._promotedViews.set(promotedViews, tx);
				});
				if (options.view !== value.options.view || views.some((view, index) => view.options.view !== value.views[index].options.view)
					|| value.promotedViews === undefined || promotedViews.length !== value.promotedViews.length) {
					this._save();
				}
			} catch (error) {
				this.logService.warn('[SessionsBoardService] Failed to restore board views', error);
			}
		}
		this._restoreCardLayouts();
	}

	updateOptions(options: Partial<ISessionsBoardOptions>): void {
		const next = { ...this._options.get(), ...options };
		if (!isBoardOptions(next)) {
			throw new Error(localize('sessionsBoard.invalidOptions', "The session view filters are invalid."));
		}
		this._options.set(normalizeBoardOptions(next), undefined);
		this._save();
	}

	setViewPromoted(view: PromotableSessionWorkView, promoted: boolean): void {
		if (!isPromotableSessionWorkView(view) || typeof promoted !== 'boolean') {
			throw new Error(localize('sessionsBoard.invalidPromotion', "This work view cannot be added to the sidebar."));
		}
		const views = this._promotedViews.get();
		if (views.includes(view) === promoted) {
			return;
		}
		this._promotedViews.set(promoted ? [...views, view] : views.filter(item => item !== view), undefined);
		this._save();
	}

	getCardLayout(scope: string): ISessionCardBoardState | undefined {
		validateCardScope(scope);
		return this._cardLayouts.get().get(scope);
	}

	setCardLayout(scope: string, layout: ISessionCardBoardState, canonicalOrder: readonly string[]): void {
		validateCardScope(scope);
		if (!isCardLayout(layout) || !isCardOrder(canonicalOrder)) {
			throw new Error(localize('sessionsBoard.invalidCardLayout', "The session card layout is invalid."));
		}
		if (!layout.order.length) {
			return;
		}
		const layouts = this._cardLayouts.get();
		const previous = layouts.get(scope);
		const fullOrder = [...new Set([...(previous?.order ?? []), ...canonicalOrder, ...layout.order])];
		const visibleIds = new Set(layout.order);
		let visibleIndex = 0;
		const order = fullOrder.map(id => visibleIds.has(id) ? layout.order[visibleIndex++] : id);
		const sizes = new Map(previous?.sizes.map(size => [size.id, size]));
		for (const id of visibleIds) {
			sizes.delete(id);
		}
		for (const size of layout.sizes) {
			sizes.set(size.id, size);
		}
		const next = freezeCardLayout({ order, sizes: order.flatMap(id => sizes.get(id) ?? []) });
		if (equals(previous, next)) {
			return;
		}
		this._setCardLayouts(new Map(layouts).set(scope, next));
	}

	resetCardLayout(scope: string): void {
		validateCardScope(scope);
		const layouts = new Map(this._cardLayouts.get());
		if (layouts.delete(scope)) {
			this._setCardLayouts(layouts);
		}
	}

	setSectionCollapsed(scope: string, collapsed: boolean): void {
		validateCardScope(scope);
		if (typeof collapsed !== 'boolean') {
			throw new Error(localize('sessionsBoard.invalidSectionCollapse', "The session section collapse state is invalid."));
		}
		const sections = this._collapsedSections.get();
		if (sections.get(scope) === collapsed) {
			return;
		}
		transaction(tx => {
			this._collapsedSections.set(toReadonlyMap(new Map(sections).set(scope, collapsed)), tx);
			this._saveCardLayouts();
		});
	}

	rebindCardSession(previousId: string, sessionId: string): void {
		validateCardSessionId(previousId);
		validateCardSessionId(sessionId);
		if (previousId === sessionId) {
			return;
		}
		const layouts = new Map(this._cardLayouts.get());
		let changed = false;
		for (const [scope, layout] of layouts) {
			if (!layout.order.includes(previousId)) {
				continue;
			}
			const order = layout.order.filter(id => id !== sessionId).map(id => id === previousId ? sessionId : id);
			const sourceSize = layout.sizes.find(size => size.id === previousId) ?? layout.sizes.find(size => size.id === sessionId);
			const sizes = new Map(layout.sizes.filter(size => size.id !== previousId && size.id !== sessionId).map(size => [size.id, size]));
			if (sourceSize) {
				sizes.set(sessionId, { ...sourceSize, id: sessionId });
			}
			layouts.set(scope, freezeCardLayout({ order, sizes: order.flatMap(id => sizes.get(id) ?? []) }));
			changed = true;
		}
		if (changed) {
			this._setCardLayouts(layouts);
		}
	}

	removeCardSession(sessionId: string): void {
		validateCardSessionId(sessionId);
		const layouts = new Map(this._cardLayouts.get());
		let changed = false;
		for (const [scope, layout] of layouts) {
			if (!layout.order.includes(sessionId)) {
				continue;
			}
			const order = layout.order.filter(id => id !== sessionId);
			if (order.length) {
				layouts.set(scope, freezeCardLayout({ order, sizes: layout.sizes.filter(size => size.id !== sessionId) }));
			} else {
				layouts.delete(scope);
			}
			changed = true;
		}
		if (changed) {
			this._setCardLayouts(layouts);
		}
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

		this._options.set(normalizeBoardOptions(view.options), undefined);
		this._save();
	}

	deleteView(id: string): void {
		const views = this._savedViews.get();
		if (!views.some(view => view.id === id)) {
			throw new Error(localize('sessionsBoard.missingView', "This session board view no longer exists."));
		}
		this._savedViews.set(views.filter(view => view.id !== id), undefined);
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

	private _restoreCardLayouts(): void {
		const raw = this.storageService.get(SessionsBoardService.LAYOUT_STORAGE_KEY, StorageScope.WORKSPACE);
		if (raw === undefined) {
			return;
		}
		try {
			const value: unknown = JSON.parse(raw);
			if (!isStoredCardLayoutState(value)) {
				throw new Error('Invalid session card layouts');
			}
			transaction(tx => {
				this._cardLayouts.set(toReadonlyMap(value.cardLayouts.map(layout => [layout.scope, freezeCardLayout(layout)])), tx);
				this._collapsedSections.set(toReadonlyMap(value.collapsedSections.map(section => [section.scope, section.collapsed])), tx);
			});
		} catch (error) {
			this.logService.warn('[SessionsBoardService] Failed to restore card layouts', error);
		}
	}

	private _setCardLayouts(layouts: ReadonlyMap<string, ISessionCardBoardState>): void {
		transaction(tx => {
			this._cardLayouts.set(toReadonlyMap(layouts), tx);
			this._saveCardLayouts();
		});
	}

	private _saveCardLayouts(): void {
		const value: IStoredCardLayoutState = {
			version: 1,
			cardLayouts: [...this._cardLayouts.get()].map(([scope, layout]) => ({ scope, ...layout })),
			collapsedSections: [...this._collapsedSections.get()].map(([scope, collapsed]) => ({ scope, collapsed })),
		};
		this.storageService.store(SessionsBoardService.LAYOUT_STORAGE_KEY, JSON.stringify(value), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private _save(): void {
		this.storageService.store(SessionsBoardService.STORAGE_KEY, JSON.stringify({ options: this._options.get(), views: this._savedViews.get(), promotedViews: this._promotedViews.get() }), StorageScope.PROFILE, StorageTarget.USER);
	}
}

registerSingleton(ISessionsBoardService, SessionsBoardService, InstantiationType.Delayed);
