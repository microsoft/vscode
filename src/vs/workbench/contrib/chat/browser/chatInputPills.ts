/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { addDisposableListener, EventType, getWindow } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import type { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, Separator, SubmenuAction, toAction, type IAction, type IActionRunner } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { AnchorPosition } from '../../../../base/common/layout.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedOpts, IObservable, IReader, ISettableObservable, ITransaction, observableFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import type { CodeWindow } from '../../../../base/browser/window.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../browser/labels.js';
import { ChatChangesPillActionViewItem, type IChatChangesStats } from '../../../browser/chatChangesPill.js';
import { ChatPillsRow, ChatPillsWidget, getChatPillEntries, getChatPillEntryHoverActions, withChatPillHoverLabel, type ChatPillsCompactMode, type IChatPill, type IChatPillAction, type IChatPillEntry, type IChatPillSection } from '../../../browser/chatPills.js';
import { ChatPillSingleEntry, createChatSectionPill, getChatPillInlineEntry, type IChatDropdownPillOptions } from '../../../browser/chatDropdownPill.js';
import { getSessionChatPillLabel, getSessionChatPillMenu, isSessionChatPillHiddenByDefault, ISessionChatPillVisibilityService, type ISessionChatPillMenuEntry, SessionChatPillKind } from '../common/sessionChatPills.js';
import { chatArtifactPillOptions } from './widget/chatTurnPills.js';
import { sessionBackgroundShellsPillOptions, sessionBrowsersPillOptions, sessionCanvasesPillOptions, sessionCustomizationsPillOptions, sessionIssuesPillOptions, sessionPullRequestsPillOptions, sessionReferencesPillOptions, sessionSubagentsPillOptions } from './sessionChatPillOptions.js';
import { markOnboardingTarget } from '../../onboarding/browser/spotlight/onboardingTarget.js';

export interface IChatInputPillSource {
	readonly kind?: SessionChatPillKind;
	readonly hasData: IObservable<boolean>;
	/** Whether any entries remain after the pill's own filtering. */
	readonly isVisible?: IObservable<boolean>;
	readonly pills: IObservable<readonly IChatPill[]>;
	getContextMenuActions?(): readonly IAction[];
	/** Actions on this pill's content, shown directly when its context menu is opened. */
	getContextMenuPrimaryActions?(pill: IChatPill): readonly IAction[];
}

export interface IChatInputPillsOptions {
	readonly debugName: string;
	readonly compact: ChatPillsCompactMode;
	readonly targetWindow?: CodeWindow;
	readonly enabled: IObservable<boolean>;
	readonly sources: IObservable<readonly IChatInputPillSource[]>;
	readonly offeredKinds: readonly SessionChatPillKind[];
	readonly ariaLabel?: string;
	readonly context?: IObservable<unknown>;
	readonly actionRunner?: IActionRunner;
	readonly focusFallback?: () => void;
}

export interface IStandardChatInputPillSections {
	readonly sections: IObservable<readonly IChatPillSection[]>;
	/** Keeps configuration reachable when the source filters out all its entries. */
	readonly hasData?: IObservable<boolean>;
	readonly icon?: ThemeIcon | IObservable<ThemeIcon>;
	getContextMenuActions?(): readonly IAction[];
	getContextMenuPrimaryActions?(): readonly IAction[];
}

export interface IStandardChatInputPillsData {
	readonly changes?: {
		readonly stats: IObservable<IChatChangesStats>;
		readonly label: IObservable<string>;
		open(): void;
		getContextMenuActions?(): readonly IAction[];
		getContextMenuPrimaryActions?(): readonly IAction[];
	};
	readonly pullRequests?: IStandardChatInputPillSections;
	readonly issues?: IStandardChatInputPillSections;
	readonly artifacts?: IStandardChatInputPillSections;
	readonly references?: IStandardChatInputPillSections;
	readonly customizations?: IStandardChatInputPillSections;
	readonly canvases?: IStandardChatInputPillSections;
	readonly browsers?: IStandardChatInputPillSections;
	readonly subagents?: IStandardChatInputPillSections;
	readonly backgroundShells?: IStandardChatInputPillSections;
}

/** Onboarding spotlight target of a chat input's changes pill, used by tours that teach reviewing changes. */
export const CHAT_CHANGES_PILL_ONBOARDING_TARGET_ID = 'chat.changesPill';

/** The changes pill, marked as an onboarding spotlight target that advances when the pill opens the changes. */
class ChatInputChangesPillActionViewItem extends ChatChangesPillActionViewItem {
	override render(container: HTMLElement): void {
		super.render(container);
		const element = this.buttonElement;
		if (element) {
			this._register(markOnboardingTarget(element, CHAT_CHANGES_PILL_ONBOARDING_TARGET_ID));
		}
	}
}

function setsEqual<T>(first: ReadonlySet<T>, second: ReadonlySet<T>): boolean {
	return first === second || (first.size === second.size && [...first].every(value => second.has(value)));
}

const PINNED_CHAT_PILL_ENTRIES_STORAGE_KEY = 'chat.inputPills.pinnedEntries';

function readPinnedChatPillEntries(storageService: IStorageService): ReadonlyMap<string, readonly string[]> {
	const value = storageService.get(PINNED_CHAT_PILL_ENTRIES_STORAGE_KEY, StorageScope.PROFILE);
	if (!value) {
		return new Map();
	}
	try {
		return new Map(JSON.parse(value) as readonly [string, readonly string[]][]);
	} catch {
		return new Map();
	}
}

function getPinnedEntryStorageKey(scope: string, kind: SessionChatPillKind): string {
	return JSON.stringify([scope, kind]);
}

/**
 * The entries a user pinned out of a chat input pill's dropdown into pills of
 * their own, per pin scope (such as a chat) and pill kind. Shared by every
 * surface composing chat input pills, so an entry stays pinned whichever
 * presentation lists it.
 */
export class ChatInputPillPins extends Disposable {
	private readonly pinned: IObservable<ReadonlyMap<string, readonly string[]>>;

	constructor(@IStorageService private readonly storageService: IStorageService) {
		super();
		this.pinned = observableFromEvent(
			this,
			storageService.onDidChangeValue(StorageScope.PROFILE, PINNED_CHAT_PILL_ENTRIES_STORAGE_KEY, this._store),
			() => readPinnedChatPillEntries(storageService),
		);
	}

	/** The IDs of the entries pinned for a scope and pill kind. */
	getPinned(scope: string | undefined, kind: SessionChatPillKind, reader: IReader | undefined): ReadonlySet<string> {
		return scope ? new Set(this.pinned.read(reader).get(getPinnedEntryStorageKey(scope, kind)) ?? []) : new Set();
	}

	setPinned(scope: string, kind: SessionChatPillKind, entryId: string, label: string, pinned: boolean): void {
		const storageKey = getPinnedEntryStorageKey(scope, kind);
		const pinnedForSource = new Set(readPinnedChatPillEntries(this.storageService).get(storageKey) ?? []);
		if (pinned) {
			pinnedForSource.add(entryId);
		} else {
			pinnedForSource.delete(entryId);
		}
		const next = new Map(readPinnedChatPillEntries(this.storageService));
		if (pinnedForSource.size > 0) {
			next.set(storageKey, [...pinnedForSource]);
		} else {
			next.delete(storageKey);
		}
		if (next.size > 0) {
			this.storageService.store(PINNED_CHAT_PILL_ENTRIES_STORAGE_KEY, JSON.stringify([...next]), StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(PINNED_CHAT_PILL_ENTRIES_STORAGE_KEY, StorageScope.PROFILE);
		}
		status(pinned
			? localize('chatInputPills.pinnedEntry', "Pinned {0}.", label)
			: localize('chatInputPills.unpinnedEntry', "Unpinned {0}.", label));
	}

	/** The action that pins an entry into a pill of its own, or unpins it back into its dropdown. */
	createPinAction(entry: Pick<IChatPillEntry, 'id' | 'label'>, kind: SessionChatPillKind, scope: string, pinned: boolean): IChatPillAction {
		return withChatPillHoverLabel(toAction({
			id: `chatInputPills.${kind}.${pinned ? 'unpin' : 'pin'}.${entry.id}`,
			label: pinned
				? localize('chatInputPills.unpinEntry', "Unpin {0}", entry.label)
				: localize('chatInputPills.pinEntry', "Pin {0}", entry.label),
			class: ThemeIcon.asClassName(pinned ? Codicon.unpin : Codicon.pin),
			run: () => this.setPinned(scope, kind, entry.id, entry.label, !pinned),
		}), pinned
			? localize('chatInputPills.unpinHoverLabel', "Unpin")
			: localize('chatInputPills.pinHoverLabel', "Pin"));
	}
}

class PinnedChatPillModel {
	private readonly entry: ISettableObservable<IChatPillEntry>;
	readonly pill: IObservable<IChatPill>;

	constructor(
		kind: SessionChatPillKind,
		entry: IChatPillEntry,
		title: string,
		options: IChatDropdownPillOptions,
		resourceLabels: ResourceLabels,
		instantiationService: IInstantiationService,
	) {
		this.entry = observableValue(this, entry);
		const action = toAction({
			id: `chatInputPills.${kind}.pinned.${entry.id}`,
			label: entry.label,
			run: () => this.entry.get().open(),
		});
		this.pill = createChatSectionPill(
			action,
			derived(this, reader => [{ title, entries: [this.entry.read(reader)] }]),
			{ ...options, singleEntry: ChatPillSingleEntry.Inline, promotedActionIcon: Codicon.unpin },
			resourceLabels,
			instantiationService,
		);
	}

	setEntry(entry: IChatPillEntry, tx: ITransaction): void {
		this.entry.set(entry, tx);
	}

	getEntry(): IChatPillEntry {
		return this.entry.get();
	}
}

/** Creates a source backed by one section/dropdown pill. */
export function createChatSectionPillSource(
	kind: SessionChatPillKind,
	action: IChatPill['action'],
	sections: IObservable<readonly IChatPillSection[]>,
	options: IChatDropdownPillOptions,
	resourceLabels: ResourceLabels,
	instantiationService: IInstantiationService,
): IChatInputPillSource {
	const pill = createChatSectionPill(action, sections, options, resourceLabels, instantiationService);
	return {
		kind,
		hasData: derived(reader => getChatPillEntries(sections.read(reader)).length > 0),
		pills: derived(reader => [pill.read(reader)]),
	};
}

/** Builds the canonical pill components and ordering from surface-specific data adapters. */
export class StandardChatInputPillSources extends Disposable {
	readonly sources: readonly IChatInputPillSource[];
	private readonly pins: ChatInputPillPins;

	constructor(
		data: IStandardChatInputPillsData,
		offeredKinds: readonly SessionChatPillKind[],
		pinScope: IObservable<string | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const offered = new Set(offeredKinds);
		const pins = this.pins = this._register(instantiationService.createInstance(ChatInputPillPins));
		const resourceLabels = this._register(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const sources: IChatInputPillSource[] = [];
		if (data.changes && offered.has(SessionChatPillKind.Changes)) {
			const changes = data.changes;
			const action = this._register(new Action('chatInputPills.changes', changes.label.get(), undefined, true, () => changes.open()));
			this._register(autorun(reader => {
				const label = changes.label.read(reader);
				action.label = label;
				action.tooltip = localize('chatInputPills.viewChanges', "View {0}", label);
			}));
			const pill: IChatPill = {
				action,
				createActionViewItem: (options: IActionViewItemOptions) => new ChatInputChangesPillActionViewItem(action, options, changes.stats, instantiationService),
			};
			sources.push({
				kind: SessionChatPillKind.Changes,
				hasData: derived(reader => changes.stats.read(reader).files > 0),
				pills: constObservable([pill]),
				getContextMenuActions: () => changes.getContextMenuActions?.() ?? [],
				getContextMenuPrimaryActions: () => changes.getContextMenuPrimaryActions?.() ?? [],
			});
		}

		const addSections = (kind: SessionChatPillKind, source: IStandardChatInputPillSections | undefined, options: IChatDropdownPillOptions) => {
			if (!source || !offered.has(kind)) {
				return;
			}
			const action = this._register(new Action(`chatInputPills.${kind}`, getSessionChatPillLabel(kind)));
			const pillOptions: IChatDropdownPillOptions = {
				...options,
				...(source.icon ? { icon: source.icon } : {}),
				preferredAnchorPosition: AnchorPosition.ABOVE,
			};
			const presentation = derived(this, reader => {
				const sections = source.sections.read(reader);
				const scope = pinScope.read(reader);
				const pinnedIds = pins.getPinned(scope, kind, reader);
				const pinnedEntries: IChatPillEntry[] = [];
				const unpinnedSections = sections.map(section => ({
					...section,
					entries: section.entries.filter(entry => {
						if (!pinnedIds.has(entry.id)) {
							return true;
						}
						pinnedEntries.push(this.withPinAction(entry, kind, scope, true));
						return false;
					}),
				})).filter(section => section.entries.length > 0);
				const unpinnedEntries = getChatPillEntries(unpinnedSections);
				const inlineRemaining = pinnedEntries.length > 0 && unpinnedEntries.length === 1 && pillOptions.openHoverOnSelect !== true;
				const unpinnedOptions = inlineRemaining
					? { ...pillOptions, singleEntry: ChatPillSingleEntry.Inline }
					: pillOptions;
				const pinAvailable = !!scope && unpinnedEntries.length > 0 && !getChatPillInlineEntry(unpinnedEntries, unpinnedOptions);
				return {
					inlineRemaining,
					pinnedEntries,
					sections: pinAvailable
						? unpinnedSections.map(section => ({
							...section,
							entries: section.entries.map(entry => this.withPinAction(entry, kind, scope, false)),
						}))
						: unpinnedSections,
				};
			});
			const unpinnedSections = derived(this, reader => presentation.read(reader).sections);
			const pillSource = createChatSectionPillSource(kind, action, unpinnedSections, pillOptions, resourceLabels, instantiationService);
			const inlinePillSource = createChatSectionPillSource(kind, action, unpinnedSections, {
				...pillOptions,
				singleEntry: ChatPillSingleEntry.Inline,
			}, resourceLabels, instantiationService);
			const unpinnedPills = derived(this, reader => presentation.read(reader).inlineRemaining
				? inlinePillSource.pills.read(reader)
				: pillSource.pills.read(reader));
			const pinnedModels = new Map<string, PinnedChatPillModel>();
			const pinnedModelsByPill = new WeakMap<IChatPill, PinnedChatPillModel>();
			const pinnedPills = observableValue<readonly IChatPill[]>(this, []);
			this._register(autorun(reader => {
				const entries = presentation.read(reader).pinnedEntries;
				const retainedIds = new Set(entries.map(entry => entry.id));
				transaction(tx => {
					const pills = entries.map(entry => {
						let model = pinnedModels.get(entry.id);
						if (!model) {
							model = new PinnedChatPillModel(kind, entry, pillOptions.title, pillOptions, resourceLabels, instantiationService);
							pinnedModels.set(entry.id, model);
						}
						model.setEntry(entry, tx);
						const pill = model.pill.read(reader);
						pinnedModelsByPill.set(pill, model);
						return pill;
					});
					pinnedPills.set(pills, tx);
				});
				for (const id of pinnedModels.keys()) {
					if (!retainedIds.has(id)) {
						pinnedModels.delete(id);
					}
				}
			}));
			const pills = derived(this, reader => {
				const promotedPills = pinnedPills.read(reader);
				return pillSource.hasData.read(reader)
					? [...promotedPills, ...unpinnedPills.read(reader)]
					: promotedPills;
			});
			const isVisible = derived(reader => presentation.read(reader).pinnedEntries.length > 0 || pillSource.hasData.read(reader));
			sources.push({
				...pillSource,
				pills,
				hasData: source.hasData ?? isVisible,
				isVisible,
				getContextMenuActions: () => source.getContextMenuActions?.() ?? [],
				getContextMenuPrimaryActions: pill => {
					const pinnedModel = pinnedModelsByPill.get(pill);
					if (pinnedModel) {
						return getChatPillEntryHoverActions(pinnedModel.getEntry());
					}
					const entries = getChatPillEntries(presentation.get().sections);
					if (entries.length === 1) {
						return getChatPillEntryHoverActions(entries[0]);
					}
					if (source.getContextMenuPrimaryActions) {
						return source.getContextMenuPrimaryActions();
					}
					return [];
				},
			});
		};
		addSections(SessionChatPillKind.PullRequests, data.pullRequests, sessionPullRequestsPillOptions);
		addSections(SessionChatPillKind.Issues, data.issues, sessionIssuesPillOptions);
		addSections(SessionChatPillKind.Artifacts, data.artifacts, chatArtifactPillOptions);
		addSections(SessionChatPillKind.References, data.references, sessionReferencesPillOptions);
		addSections(SessionChatPillKind.Customizations, data.customizations, sessionCustomizationsPillOptions);
		addSections(SessionChatPillKind.Canvases, data.canvases, sessionCanvasesPillOptions);
		addSections(SessionChatPillKind.Browsers, data.browsers, sessionBrowsersPillOptions);
		addSections(SessionChatPillKind.Subagents, data.subagents, sessionSubagentsPillOptions);
		addSections(SessionChatPillKind.BackgroundShells, data.backgroundShells, sessionBackgroundShellsPillOptions);
		this.sources = sources;
	}

	private withPinAction(entry: IChatPillEntry, kind: SessionChatPillKind, scope: string | undefined, pinned: boolean): IChatPillEntry {
		if (!scope) {
			return entry;
		}
		const pinAction = this.pins.createPinAction(entry, kind, scope, pinned);
		if (pinned) {
			return {
				...entry,
				toolbarActions: [...entry.toolbarActions ?? [], ...(entry.promotedAction ? [entry.promotedAction] : [])],
				promotedAction: pinAction,
			};
		}
		return {
			...entry,
			toolbarActions: [...entry.toolbarActions ?? [], pinAction],
		};
	}
}

/** Shared renderer/controller for status pills above a chat input. */
export class ChatInputPills extends Disposable {
	readonly element: HTMLElement;
	readonly onDidChange: Event<void>;
	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	private readonly _row: ChatPillsRow;
	private readonly _pills: ChatPillsWidget;
	private _visible = false;

	constructor(
		container: HTMLElement | undefined,
		private readonly _options: IChatInputPillsOptions,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@ISessionChatPillVisibilityService private readonly _visibility: ISessionChatPillVisibilityService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._row = this._register(new ChatPillsRow(_options.debugName, {
			compact: _options.compact,
			targetWindow: _options.targetWindow,
		}));
		this.element = this._row.element;
		if (container) {
			container.appendChild(this.element);
			this._register(toDisposable(() => this.element.remove()));
		}

		const visibleSources = derived(this, reader => {
			if (!_options.enabled.read(reader)) {
				return [];
			}
			return _options.sources.read(reader).filter(source =>
				source.hasData.read(reader) && (source.isVisible?.read(reader) ?? true) && (!source.kind || this._visibility.isVisible(source.kind, reader)));
		});
		const model = {
			pills: derived(this, reader => visibleSources.read(reader).flatMap(source => source.pills.read(reader))),
			context: _options.context,
		};
		this._pills = this._register(instantiationService.createInstance(ChatPillsWidget, model, {
			ariaLabel: _options.ariaLabel ?? localize('chatInputPills.ariaLabel', "Session status"),
			actionRunner: _options.actionRunner,
			allowContextMenu: true,
		}));
		this._pills.element.classList.add('show-file-icons');
		this._row.content.appendChild(this._pills.element);
		this._row.observe(this._pills.element, () => this._pills.getPillElements());
		this._register(this._pills.onDidRemoveFocusedPill(() => this._row.restoreFocus(() => this._pills.getPillElements(), _options.focusFallback)));
		this.onDidChange = Event.any(this._row.onDidChangeLayout, this._pills.onDidChangePills);

		const kindsWithData = derivedOpts<ReadonlySet<SessionChatPillKind>>({ owner: this, equalsFn: setsEqual }, reader => {
			const kinds = new Set<SessionChatPillKind>();
			if (!_options.enabled.read(reader)) {
				return kinds;
			}
			for (const source of _options.sources.read(reader)) {
				if (source.kind && source.hasData.read(reader)) {
					kinds.add(source.kind);
				}
			}
			return kinds;
		});
		const showContextMenu = (anchor: HTMLElement | StandardMouseEvent, target?: { readonly source: IChatInputPillSource; readonly pill: IChatPill }) => {
			const kinds = kindsWithData.get();
			if (kinds.size === 0) {
				return;
			}
			this._contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => this._getVisibilityActions(kinds, target),
			});
		};
		this._register(addDisposableListener(this._row.content, EventType.CONTEXT_MENU, event => {
			event.preventDefault();
			event.stopPropagation();
			const anchor = new StandardMouseEvent(getWindow(this._row.content), event);
			showContextMenu(anchor, this._getTarget(event.target as HTMLElement | null));
		}));
		this._register(this._row.onDidRequestContextMenu(anchor => showContextMenu(anchor, this._getTarget(anchor))));

		derived(this, reader => {
			const anyVisible = this._pills.isVisible.read(reader);
			// The empty row only restores pills the user hid or filtered; default-hidden kinds never claimed room in the row.
			const anyRestorable = [...kindsWithData.read(reader)].some(kind => this._visibility.isVisible(kind, reader) || !isSessionChatPillHiddenByDefault(kind));
			return anyVisible ? 'visible' : anyRestorable ? 'empty' : 'hidden';
		}).recomputeInitiallyAndOnChange(this._store, state => {
			const activeElement = getWindow(this._row.content).document.activeElement;
			const restoreInputFocus = state === 'hidden' && !!activeElement && this._row.content.contains(activeElement);
			const visible = state !== 'hidden';
			this.element.classList.toggle('hidden', !visible);
			this._row.setEmpty(state === 'empty', localize('chatInputPills.configure', "Configure Session Status Pills"));
			if (this._visible !== visible) {
				this._visible = visible;
				this._onDidChangeVisibility.fire(visible);
			}
			this._row.scanDomNode();
			if (restoreInputFocus) {
				this._row.restoreFocus(() => this._pills.getPillElements(), _options.focusFallback);
			}
		});
	}

	get visible(): boolean {
		return this._visible;
	}

	getPillElements(): readonly HTMLElement[] {
		return this._pills.getPillElements();
	}

	focusFirst(): boolean {
		return this._pills.focusFirst();
	}

	private _getTarget(target: HTMLElement | null): { readonly source: IChatInputPillSource; readonly pill: IChatPill } | undefined {
		const targetPill = this._pills.getPill(target);
		if (!targetPill) {
			return undefined;
		}
		for (const source of this._options.sources.get()) {
			if (source.pills.get().includes(targetPill)) {
				return { source, pill: targetPill };
			}
		}
		return undefined;
	}

	private _getVisibilityActions(kindsWithData: ReadonlySet<SessionChatPillKind>, target?: { readonly source: IChatInputPillSource; readonly pill: IChatPill }) {
		const targetKind = target?.source.kind;
		const sourceKinds = new Set(this._options.sources.get().flatMap(source => source.kind ? [source.kind] : []));
		const offeredKinds = this._options.offeredKinds.filter(kind => sourceKinds.has(kind));
		const menu = getSessionChatPillMenu(kindsWithData, this._visibility.readHiddenKinds(undefined), targetKind, offeredKinds);
		const restoreFocus = () => this._row.restoreFocus(() => {
			const pills = this._pills.getPillElements();
			const targetElement = target ? pills.find(pill => this._getTarget(pill)?.pill === target.pill) : undefined;
			return targetElement ? [targetElement] : pills;
		}, this._options.focusFallback);
		const withFocusRestoration = (action: IAction): IAction => {
			if (action instanceof Separator) {
				return action;
			}
			if (action instanceof SubmenuAction) {
				return new SubmenuAction(action.id, action.label, action.actions.map(withFocusRestoration), action.class);
			}
			return toAction({
				id: action.id,
				label: action.label,
				enabled: action.enabled,
				checked: action.checked,
				class: action.class,
				tooltip: action.tooltip,
				run: async () => {
					try {
						await action.run();
					} finally {
						// Filtering or removing an entry can detach the context menu's anchor.
						restoreFocus();
					}
				},
			});
		};
		const toggleAction = (entry: ISessionChatPillMenuEntry) => toAction({
			id: `chatInputPills.toggle.${entry.kind}`,
			label: entry.label,
			checked: entry.checked,
			run: () => {
				this._visibility.toggle(entry.kind);
				restoreFocus();
			},
		});
		const targetActions: IAction[] = [];
		const optionsActions: IAction[] = [];
		for (const source of this._options.sources.get()) {
			if (!source.kind || !this._options.offeredKinds.includes(source.kind)) {
				continue;
			}
			const allEntriesFilteredOut = kindsWithData.has(source.kind) && source.isVisible?.get() === false;
			if (targetKind ? source.kind !== targetKind && !allEntriesFilteredOut : !kindsWithData.has(source.kind)) {
				continue;
			}
			const actions = source.getContextMenuActions?.() ?? [];
			const primaryActions = source === target?.source ? source.getContextMenuPrimaryActions?.(target.pill) ?? [] : [];
			(actions.length ? optionsActions : targetActions).push(...primaryActions.map(withFocusRestoration));
			if (actions.length) {
				optionsActions.push(new SubmenuAction(
					`chatInputPills.options.${source.kind}`,
					source.kind === SessionChatPillKind.Subagents
						? localize('chatInputPills.subagentOptions', "Subagent Options")
						: localize('chatInputPills.options', "{0} Options", getSessionChatPillLabel(source.kind)),
					actions.map(withFocusRestoration),
				));
			}
		}
		if (targetActions.length) {
			targetActions.push(new Separator());
		}
		if (menu.hide) {
			const hide = menu.hide;
			targetActions.push(toAction({
				id: `chatInputPills.hide.${hide.kind}`,
				label: hide.label,
				run: () => {
					this._visibility.hide(hide.kind);
					restoreFocus();
				},
			}));
		}
		return Separator.join(targetActions, optionsActions, menu.withData.map(toggleAction), menu.withoutData.map(toggleAction));
	}
}

/** Creates a source for a pill whose data presence is represented by its membership. */
export function createChatInputPillSource(pill: IChatPill, kind?: SessionChatPillKind): IChatInputPillSource {
	return { kind, hasData: constObservable(true), pills: constObservable([pill]) };
}
