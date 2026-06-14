/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IProviderSessionType, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { Emitter } from '../../../../base/common/event.js';
import { isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { reportNewChatPickerClosed } from './newChatPickerTelemetry.js';

const STORAGE_KEY_LAST_SESSION_TYPE = 'sessions.userSelectedSessionType';

/**
 * A picked session type, paired with the provider that serves it. Two
 * providers can advertise the same session type id (e.g. both expose
 * 'copilot-cli'), so callers need both to route session creation to the
 * right provider.
 */
export interface IPickedSessionType {
	readonly providerId: string;
	readonly sessionTypeId: string;
}

/**
 * A stored or in-memory preference. When the providerId is unknown (legacy
 * storage that only persisted the session type id, or a pick made before
 * any folder was known) the picker resolves a provider lazily once the
 * active folder is established.
 */
export interface IPreferredSessionType {
	readonly providerId?: string;
	readonly sessionTypeId: string;
}

interface IStoredSessionTypePick {
	readonly providerId?: string;
	readonly sessionTypeId: string;
}

/**
 * Row item rendered inside the session type picker — carries both the
 * provider id and the session type so we can dispatch creation through
 * the correct provider when the same type is offered by multiple providers.
 */
interface ISessionTypePickerItem {
	readonly providerId: string;
	readonly sessionTypeId: string;
	readonly label: string;
	readonly checked?: boolean;
}

export class SessionTypePicker extends Disposable {

	/**
	 * The currently displayed pick. May be missing `providerId` when restored
	 * from legacy storage that only persisted the session type id — it will
	 * be resolved to a concrete provider lazily when consumers create a
	 * session.
	 */
	protected _picked: IPreferredSessionType | undefined;
	protected readonly _onDidSelectSessionType = this._register(new Emitter<IPickedSessionType | undefined>());
	readonly onDidSelectSessionType = this._onDidSelectSessionType.event;

	/** Session types the active session's folder can be served by, across all providers. */
	protected _folderSessionTypes: IProviderSessionType[] = [];

	private readonly _renderDisposables = this._register(new DisposableStore());
	protected _triggerElement: HTMLElement | undefined;

	constructor(
		private readonly _session: IObservable<ISession | undefined>,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IStorageService protected readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		// Restore the previously selected session type from storage
		this._picked = this._readStoredPick();

		const refresh = (session: ISession | undefined) => {
			if (session) {
				const folderUri = session.workspace.get()?.folders[0]?.root;
				this._folderSessionTypes = folderUri ? this.sessionsManagementService.getSessionTypesForFolder(folderUri) : [];
				// Reflect the active session's type in the trigger label, but do
				// not persist it: the stored preference must only change when the
				// user explicitly picks a type via the picker.
				this._picked = { providerId: session.providerId, sessionTypeId: session.sessionType };
			} else {
				this._folderSessionTypes = [];
				// Preserve the stored pick when no active session exists,
				// so it can be used as the default for the next new session.
				this._picked = this._readStoredPick();
			}
			this._updateTriggerLabel();
		};

		this._register(autorun(reader => {
			const session = this._session.read(reader);
			refresh(session);
		}));
		// Re-read when a provider advertises/removes session types at runtime
		// (e.g. a remote agent host discovers a new agent).
		this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => {
			refresh(this._session.get());
		}));
	}

	get selectedPick(): IPreferredSessionType | undefined {
		return this._picked;
	}

	/**
	 * The session type the user explicitly picked, read from the stored
	 * preference. Unlike {@link selectedPick}, this is independent of any
	 * active session's type. Returns `undefined` when the user has never
	 * picked a type (or changed away from the default), in which case
	 * consumers should fall back to {@link getPreferredSessionType}.
	 */
	getUserPickedSessionType(): IPreferredSessionType | undefined {
		return this._readStoredPick();
	}

	/**
	 * The preferred session type for {@link folderUri}: the first entry in
	 * the folder's session-type list. Recomputed against the live list, so
	 * it follows provider changes (e.g. a late-registering agent host that
	 * prepends a new type). Used as the default when the user has made no
	 * explicit pick.
	 */
	getPreferredSessionType(folderUri: URI): IPreferredSessionType | undefined {
		const first = this.sessionsManagementService.getSessionTypesForFolder(folderUri)[0];
		return first ? { providerId: first.providerId, sessionTypeId: first.sessionType.id } : undefined;
	}

	render(container: HTMLElement, options?: { className?: string }): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		if (options?.className) {
			const classNames = options.className.split(/\s+/).filter(className => className.length > 0);
			if (classNames.length > 0) {
				slot.classList.add(...classNames);
			}
		}
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;
		this._updateTriggerLabel();

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}));
		}

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));
	}

	/**
	 * Override hook for mobile subclasses. Receives the trigger element so
	 * the override can decide where to anchor (or that it doesn't need
	 * anchoring at all, e.g. for a bottom sheet).
	 */
	protected _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		const session = this._session.get();
		if (!session) {
			return;
		}

		// Recompute types fresh at open time so a late-registering provider
		// (e.g. Local Agent Host whose session types are populated only after
		// agent discovery) shows up without waiting for the refresh event to
		// land before the user clicks.
		const folderUri = session.workspace.get()?.folders[0]?.root;
		const folderTypes = folderUri
			? this.sessionsManagementService.getSessionTypesForFolder(folderUri)
			: this._folderSessionTypes;
		this._folderSessionTypes = folderTypes;

		if (folderTypes.length <= 1) {
			return;
		}

		// Determine which providers contain at least one duplicated label.
		// Only those providers need a group title for disambiguation.
		const labelCounts = new Map<string, number>();
		for (const { sessionType } of folderTypes) {
			labelCounts.set(sessionType.label, (labelCounts.get(sessionType.label) ?? 0) + 1);
		}
		const providersWithDuplicates = new Set<string>();
		for (const { providerId, sessionType } of folderTypes) {
			if ((labelCounts.get(sessionType.label) ?? 0) > 1) {
				providersWithDuplicates.add(providerId);
			}
		}
		const hasDuplicateLabels = providersWithDuplicates.size > 0;

		const providersService = this.sessionsProvidersService;
		const groupedItems: IActionListItem<ISessionTypePickerItem>[] = [];
		let lastProviderId: string | undefined;
		for (const { providerId, sessionType } of folderTypes) {
			const provider = providersService.getProvider(providerId);
			const groupTitle = provider?.label ?? providerId;
			const isFirstInGroup = providerId !== lastProviderId;
			lastProviderId = providerId;
			const isCurrent = this._picked?.providerId === providerId && this._picked?.sessionTypeId === sessionType.id;
			const item: ISessionTypePickerItem = isCurrent
				? { providerId, sessionTypeId: sessionType.id, label: sessionType.label, checked: true }
				: { providerId, sessionTypeId: sessionType.id, label: sessionType.label };
			groupedItems.push({
				kind: ActionListItemKind.Action,
				label: sessionType.label,
				group: providersWithDuplicates.has(providerId) ? {
					title: isFirstInGroup ? groupTitle : '',
					icon: sessionType.icon,
				} : {
					title: '',
					icon: sessionType.icon,
				},
				item,
			});
		}

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<ISessionTypePickerItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				this._handleSelectedSessionType(item);
			},
			onHide: () => { triggerElement.focus(); },
		};

		this.actionWidgetService.show<ISessionTypePickerItem>(
			'sessionTypePicker',
			false,
			groupedItems,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('sessionTypePicker.ariaLabel', "Session Type"),
			},
			{ showGroupTitleOnFirstItem: hasDuplicateLabels },
		);
	}

	/**
	 * Handles the user picking a session type. Emits `newChatPickerClosed`
	 * telemetry (with the previously selected type read from storage, or the
	 * in-memory field when nothing is stored). The explicit selection is always
	 * persisted — picking the preferred (first) type clears the stored
	 * preference, any other pick stores it — while {@link onDidSelectSessionType}
	 * fires only when the visible pick actually changed.
	 *
	 * Shared between desktop (action-widget popup) and mobile (bottom
	 * sheet) presentations so both surfaces report identical telemetry.
	 */
	protected _handleSelectedSessionType(pick: IPickedSessionType): void {
		const stored = this._readStoredPick();
		const beforeId = stored?.sessionTypeId ?? this._picked?.sessionTypeId;
		const beforeLabel = this._folderSessionTypes.find(t => t.sessionType.id === beforeId)?.sessionType.label;
		const afterLabel = this._folderSessionTypes.find(t => t.providerId === pick.providerId && t.sessionType.id === pick.sessionTypeId)?.sessionType.label;

		reportNewChatPickerClosed(this.telemetryService, {
			id: 'NewChatSessionTypePicker',
			name: 'NewChatSessionTypePicker',
			optionIdBefore: beforeId,
			optionIdAfter: pick.sessionTypeId,
			optionLabelBefore: beforeLabel,
			optionLabelAfter: afterLabel,
			isPII: false,
		});

		// Persist the explicit selection regardless of whether the visible
		// pick changed (the visible pick may reflect the active session rather
		// than the stored preference): picking the preferred (first) type means
		// "no explicit preference" and clears the stored pick so the session
		// keeps tracking the preferred type as the folder's list changes; any
		// other explicit pick is stored.
		const preferred = this._folderSessionTypes[0];
		const isDefault = !!preferred && preferred.providerId === pick.providerId && preferred.sessionType.id === pick.sessionTypeId;
		const visiblePickChanged = pick.providerId !== this._picked?.providerId || pick.sessionTypeId !== this._picked?.sessionTypeId;
		if (isDefault) {
			this._clearStoredPick(pick);
		} else {
			this._writeStoredPick(pick);
		}
		// Only notify (and trigger draft recreation) when the visible pick
		// actually changed, to avoid unnecessary work.
		if (visiblePickChanged) {
			this._onDidSelectSessionType.fire(pick);
		}
	}

	private _readStoredPick(): IPreferredSessionType | undefined {
		const raw = this.storageService.get(STORAGE_KEY_LAST_SESSION_TYPE, StorageScope.PROFILE);
		if (!raw) {
			return undefined;
		}
		// Try parsing as the new JSON shape first; fall back to the legacy
		// shape where only the sessionTypeId string was stored.
		try {
			const parsed = JSON.parse(raw) as IStoredSessionTypePick;
			if (parsed && typeof parsed.sessionTypeId === 'string') {
				return typeof parsed.providerId === 'string'
					? { providerId: parsed.providerId, sessionTypeId: parsed.sessionTypeId }
					: { sessionTypeId: parsed.sessionTypeId };
			}
		} catch {
			// Not JSON — fall through to legacy raw-string handling.
		}
		// Legacy raw string was just the session type id. Resolution to a
		// provider happens lazily once the active folder is known.
		return { sessionTypeId: raw };
	}

	private _writeStoredPick(pick: IPickedSessionType): void {
		this._picked = pick;
		const stored: IStoredSessionTypePick = { providerId: pick.providerId, sessionTypeId: pick.sessionTypeId };
		this.storageService.store(STORAGE_KEY_LAST_SESSION_TYPE, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	/**
	 * Forget any explicit preference (e.g. the user re-selected the default
	 * type). The display still reflects the in-memory pick, but consumers
	 * reading {@link getUserPickedSessionType} fall back to the preferred type.
	 */
	private _clearStoredPick(pick: IPickedSessionType): void {
		this._picked = pick;
		this.storageService.remove(STORAGE_KEY_LAST_SESSION_TYPE, StorageScope.PROFILE);
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);

		// In web (vscode.dev/agents) the host filter already scopes the
		// workbench to a single agent host, so when that host advertises only
		// one harness there is nothing to pick — hide the trigger entirely.
		// Note: the existing CSS rule on `.session-workspace-picker-with-label`
		// uses `:has(+ .sessions-chat-session-type-picker .action-label.hidden)`
		// to also hide the "with" connector when the trigger is hidden.
		const hideForSingleHarness = isWeb && this._folderSessionTypes.length <= 1;
		if (this._folderSessionTypes.length === 0 || hideForSingleHarness) {
			this._triggerElement.classList.add('hidden');
			return;
		}

		this._triggerElement.classList.remove('hidden');
		const currentType = this._folderSessionTypes.find(t =>
			t.providerId === this._picked?.providerId && t.sessionType.id === this._picked?.sessionTypeId)?.sessionType
			?? this._folderSessionTypes.find(t => t.sessionType.id === this._picked?.sessionTypeId)?.sessionType;
		const modeIcon = currentType?.icon ?? Codicon.terminal;
		const modeLabel = currentType?.label ?? this._picked?.sessionTypeId ?? '';

		dom.append(this._triggerElement, renderIcon(modeIcon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = modeLabel;

		const chevron = dom.append(this._triggerElement, renderIcon(Codicon.chevronDownCompact));
		chevron.classList.add('sessions-chat-dropdown-chevron');

		this._triggerElement.ariaLabel = localize('sessionTypePicker.triggerAriaLabel', "Pick Session Type, {0}", modeLabel);
	}
}
