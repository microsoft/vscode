/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
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
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { getSessionTypeAvailability, getSessionTypeUnavailableDescription, getSessionTypeUnavailableHover, SessionTypeAvailability } from '../../../../workbench/contrib/chat/browser/agentSessions/sessionTypeAvailability.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { markOnboardingTarget } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { reportNewChatPickerClosed } from './newChatPickerTelemetry.js';
import { SessionHarnessPickerVisibleContext } from '../../../common/contextkeys.js';

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

function pickEquals(a: IPreferredSessionType | undefined, b: IPreferredSessionType | undefined): boolean {
	return a?.providerId === b?.providerId && a?.sessionTypeId === b?.sessionTypeId;
}

interface IStoredSessionTypePick {
	readonly providerId?: string;
	readonly sessionTypeId: string;
}

/** Default telemetry source used when the picker serves the New Session composer. */
const DEFAULT_TELEMETRY_SOURCE = 'NewChatSessionTypePicker';

/**
 * Configures how the picker behaves when reused outside the New Session
 * composer (e.g. the automations dialog), where profile-wide persistence and
 * new-chat telemetry would be incorrect side effects.
 */
export interface ISessionTypePickerOptions {
	/**
	 * When `false` (used e.g. by the automations dialog), an explicit pick is
	 * never written to or cleared from the profile-wide
	 * {@link STORAGE_KEY_LAST_SESSION_TYPE} preference, so picking a type here
	 * cannot change the New Session default. The stored preference is still read
	 * to seed a sensible initial default. Defaults to `true`.
	 */
	readonly persistSelection?: boolean;
	/** Telemetry id/name reported on selection. Defaults to {@link DEFAULT_TELEMETRY_SOURCE}. */
	readonly telemetrySource?: string;
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
	/**
	 * Provider display label, set when the picker shows section headers so the
	 * accessibility label can disambiguate same-named types (e.g. "Claude")
	 * across providers — headers are skipped by list navigation and aren't
	 * announced on their own.
	 */
	readonly groupLabel?: string;
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

	/**
	 * Fires whenever the effective {@link selectedPick} changes for any reason:
	 * an explicit user pick OR a recompute (e.g. a provider advertising its
	 * session types late). Unlike {@link onDidSelectSessionType}, which only
	 * covers explicit picks, this lets consumers that cache the pick stay in
	 * sync when the displayed default shifts on its own.
	 */
	protected readonly _onDidChangeSelectedPick = this._register(new Emitter<IPreferredSessionType | undefined>());
	readonly onDidChangeSelectedPick = this._onDidChangeSelectedPick.event;

	/** Session types the active session's folder can be served by, across all providers. */
	protected _folderSessionTypes: IProviderSessionType[] = [];

	/** Folder that drives the available session types when set via {@link setFolderSource}; `undefined` keeps session-driven behavior. */
	private _folderSource: IObservable<URI | undefined> | undefined;
	private readonly _folderSourceWatch = this._register(new MutableDisposable());

	private readonly _renderDisposables = this._register(new DisposableStore());
	protected _triggerElement: HTMLElement | undefined;

	/**
	 * Tracks whether the harness picker trigger is currently visible. Mirrors
	 * the `.hidden` state computed in {@link _updateTriggerLabel}, so the
	 * new-session-view onboarding tour can skip the harness step when only a
	 * single harness can serve the selected workspace.
	 */
	private readonly _visibleKey: IContextKey<boolean>;

	constructor(
		private readonly _session: IObservable<ISession | undefined>,
		private readonly _options: ISessionTypePickerOptions | undefined,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IStorageService protected readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IChatSessionsService protected readonly chatSessionsService: IChatSessionsService,
		@IChatEntitlementService protected readonly chatEntitlementService: IChatEntitlementService,
		@ILanguageModelsService protected readonly languageModelsService: ILanguageModelsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this._visibleKey = SessionHarnessPickerVisibleContext.bindTo(contextKeyService);
		this._register(toDisposable(() => this._visibleKey.reset()));

		// Restore the previously selected session type from storage
		this._picked = this._readStoredPick();

		this._register(autorun(reader => {
			this._session.read(reader);
			this._recompute();
		}));
		// Re-read when a provider advertises/removes session types at runtime
		// (e.g. a remote agent host discovers a new agent).
		this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => this._recompute()));
	}

	/**
	 * Recompute the available session types and the displayed pick from the
	 * current source (session or folder), then refresh the trigger label.
	 * Invoked reactively when the session, folder, or advertised types change.
	 */
	protected _recompute(): void {
		this._folderSessionTypes = this._resolveFolderSessionTypes();
		const previous = this._picked;
		this._picked = this._computeCurrentPick();
		this._updateTriggerLabel();
		if (!pickEquals(previous, this._picked)) {
			this._onDidChangeSelectedPick.fire(this._picked);
		}
	}

	/**
	 * The session types to offer, sourced from the folder when a folder source
	 * is set (see {@link setFolderSource}), otherwise from the active session.
	 */
	protected _resolveFolderSessionTypes(): IProviderSessionType[] {
		if (this._folderSource) {
			const folderUri = this._folderSource.get();
			return folderUri ? this.sessionsManagementService.getSessionTypesForFolder(folderUri) : [];
		}
		const session = this._session.get();
		return session ? this._sessionTypesForSession(session) : [];
	}

	/** The pick to display for the current source: the active session's type, otherwise the folder or stored default. */
	protected _computeCurrentPick(): IPreferredSessionType | undefined {
		const session = this._session.get();
		if (!this._folderSource && session) {
			// Reflect the session's type without persisting it; storage changes only on an explicit user pick.
			return { providerId: session.providerId, sessionTypeId: session.sessionType };
		}
		if (!this._folderSource) {
			// No active session: keep the stored pick to seed the next new session.
			return this._readStoredPick();
		}
		const candidate = this._picked ?? this._readStoredPick();
		if (this._pickServedByFolder(candidate)) {
			return candidate;
		}
		const stored = this._readStoredPick();
		if (this._pickServedByFolder(stored)) {
			return stored;
		}
		const preferred = this._folderSessionTypes[0];
		return preferred ? { providerId: preferred.providerId, sessionTypeId: preferred.sessionType.id } : undefined;
	}

	private _pickServedByFolder(pick: IPreferredSessionType | undefined): boolean {
		return !!pick && this._folderSessionTypes.some(t =>
			t.sessionType.id === pick.sessionTypeId &&
			(pick.providerId === undefined || t.providerId === pick.providerId));
	}

	/** Drive the picker from a folder instead of the active session, optionally seeding the initial pick. */
	setFolderSource(source: IObservable<URI | undefined>, options?: { readonly initialPick?: IPreferredSessionType }): void {
		this._folderSource = source;
		this._picked = options?.initialPick ?? this._readStoredPick();
		this._folderSourceWatch.value = autorun(reader => {
			source.read(reader);
			this._recompute();
		});
	}

	get selectedPick(): IPreferredSessionType | undefined {
		return this._picked;
	}

	/**
	 * The session types to offer for a session: all quick-chat types when the
	 * session is a workspace-less quick chat, otherwise the folder's types.
	 */
	private _sessionTypesForSession(session: ISession): IProviderSessionType[] {
		if (session.isQuickChat?.get() ?? false) {
			return this.sessionsManagementService.getQuickChatSessionTypes();
		}
		const folderUri = session.workspace.get()?.folders[0]?.root;
		return folderUri ? this.sessionsManagementService.getSessionTypesForFolder(folderUri) : [];
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
		// Onboarding spotlight target — id is referenced by the "new session view"
		// tour in vs/sessions/contrib/onboardingTours.
		this._renderDisposables.add(markOnboardingTarget(trigger, 'sessions.newSession.harnessPicker'));
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

		// Recompute types fresh at open time so a late-registering provider
		// (e.g. Local Agent Host whose session types are populated only after
		// agent discovery) shows up without waiting for the refresh event to
		// land before the user clicks.
		const folderTypes = this._resolveFolderSessionTypes();
		this._folderSessionTypes = folderTypes;

		if (folderTypes.length <= 1) {
			return;
		}

		// Group session types by their provider's display label, preserving
		// first-seen order. Providers can be interleaved in the folder list and
		// distinct providers can share a label, so collecting by label avoids
		// rendering the same section header more than once.
		const groups = new Map<string, IProviderSessionType[]>();
		for (const folderType of folderTypes) {
			const provider = this.sessionsProvidersService.getProvider(folderType.providerId);
			const groupTitle = provider?.label ?? folderType.providerId;
			const existing = groups.get(groupTitle);
			if (existing) {
				existing.push(folderType);
			} else {
				groups.set(groupTitle, [folderType]);
			}
		}
		// Section headers exist to disambiguate session types that share a
		// label across providers (e.g. two providers both offering "Claude").
		// When every type's label is unique there is nothing to disambiguate,
		// so render a flat list without group headers even if multiple
		// providers contribute.
		const labelCounts = new Map<string, number>();
		for (const { sessionType } of folderTypes) {
			labelCounts.set(sessionType.label, (labelCounts.get(sessionType.label) ?? 0) + 1);
		}
		const hasDuplicateLabels = Array.from(labelCounts.values()).some(count => count > 1);
		const showSectionHeaders = groups.size > 1 && hasDuplicateLabels;

		const groupedItems: IActionListItem<ISessionTypePickerItem>[] = [];
		for (const [groupTitle, types] of groups) {
			if (showSectionHeaders) {
				if (groupedItems.length > 0) {
					groupedItems.push({ kind: ActionListItemKind.Separator, label: '' });
				}
				groupedItems.push({
					kind: ActionListItemKind.Header,
					group: { title: groupTitle },
					label: groupTitle,
				});
			}
			for (const { providerId, sessionType } of types) {
				const isCurrent = this._picked?.providerId === providerId && this._picked?.sessionTypeId === sessionType.id;
				const availability = getSessionTypeAvailability(this.chatSessionsService, this.chatEntitlementService, this.languageModelsService, sessionType.chatSessionType ?? sessionType.id);
				const unavailable = availability !== SessionTypeAvailability.Available;
				const item: ISessionTypePickerItem = {
					providerId,
					sessionTypeId: sessionType.id,
					label: sessionType.label,
					...(isCurrent ? { checked: true } : {}),
					...(showSectionHeaders ? { groupLabel: groupTitle } : {}),
				};
				groupedItems.push({
					kind: ActionListItemKind.Action,
					label: sessionType.label,
					disabled: unavailable,
					...(unavailable ? {
						description: getSessionTypeUnavailableDescription(availability),
						hover: { content: getSessionTypeUnavailableHover(availability) },
					} : {}),
					group: {
						title: '',
						icon: sessionType.icon,
					},
					item,
				});
			}
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
				getAriaLabel: (element) => element.item?.groupLabel ? localize('sessionTypePicker.itemAriaLabel', "{0}, {1}", element.label ?? '', element.item.groupLabel) : (element.label ?? ''),
				getWidgetAriaLabel: () => localize('sessionTypePicker.ariaLabel', "Session Type"),
			},
			{ minWidth: 200 },
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

		const telemetrySource = this._options?.telemetrySource ?? DEFAULT_TELEMETRY_SOURCE;
		reportNewChatPickerClosed(this.telemetryService, {
			id: telemetrySource,
			name: telemetrySource,
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
		// profile-wide preference is gated so non-persisting callers (e.g. the
		// automations dialog) can pick a type without changing the New Session default
		this._picked = pick;
		if (this._options?.persistSelection !== false) {
			if (isDefault) {
				this._clearStoredPick();
			} else {
				this._writeStoredPick(pick);
			}
		}
		// Folder-driven callers have no session change to re-run the refresh autorun, so refresh the label here.
		this._updateTriggerLabel();
		// Only notify (and trigger draft recreation) when the visible pick
		// actually changed, to avoid unnecessary work.
		if (visiblePickChanged) {
			this._onDidSelectSessionType.fire(pick);
			this._onDidChangeSelectedPick.fire(this._picked);
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
		const stored: IStoredSessionTypePick = { providerId: pick.providerId, sessionTypeId: pick.sessionTypeId };
		this.storageService.store(STORAGE_KEY_LAST_SESSION_TYPE, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	/**
	 * Forget any explicit preference (e.g. the user re-selected the default
	 * type). The display still reflects the in-memory pick, but consumers
	 * reading {@link getUserPickedSessionType} fall back to the preferred type.
	 */
	private _clearStoredPick(): void {
		this.storageService.remove(STORAGE_KEY_LAST_SESSION_TYPE, StorageScope.PROFILE);
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			this._visibleKey.set(false);
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
			this._visibleKey.set(false);
			return;
		}

		this._triggerElement.classList.remove('hidden');
		this._visibleKey.set(true);
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
