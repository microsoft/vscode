/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, getWindow } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import type { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, Separator, SubmenuAction, toAction, type IAction, type IActionRunner } from '../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import type { ThemeIcon } from '../../../../base/common/themables.js';
import type { CodeWindow } from '../../../../base/browser/window.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../browser/labels.js';
import { ChatChangesPillActionViewItem, type IChatChangesStats } from '../../../browser/chatChangesPill.js';
import { ChatPillsRow, ChatPillsWidget, getChatPillEntries, type ChatPillsCompactMode, type IChatPill, type IChatPillSection } from '../../../browser/chatPills.js';
import { createChatSectionPill, type IChatDropdownPillOptions } from '../../../browser/chatDropdownPill.js';
import { getSessionChatPillLabel, getSessionChatPillMenu, ISessionChatPillVisibilityService, type ISessionChatPillMenuEntry, SessionChatPillKind } from '../common/sessionChatPills.js';
import { chatArtifactPillOptions } from './widget/chatTurnPills.js';
import { sessionBrowsersPillOptions, sessionCustomizationsPillOptions, sessionIssuesPillOptions, sessionPullRequestsPillOptions, sessionReferencesPillOptions, sessionSubagentsPillOptions } from './sessionChatPillOptions.js';

export interface IChatInputPillSource {
	readonly kind?: SessionChatPillKind;
	readonly hasData: IObservable<boolean>;
	/** Whether any entries remain after the pill's own filtering. */
	readonly isVisible?: IObservable<boolean>;
	readonly pill: IObservable<IChatPill>;
	getContextMenuActions?(): readonly IAction[];
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
}

export interface IStandardChatInputPillsData {
	readonly changes?: {
		readonly stats: IObservable<IChatChangesStats>;
		readonly label: IObservable<string>;
		open(): void;
		getContextMenuActions?(): readonly IAction[];
	};
	readonly pullRequests?: IStandardChatInputPillSections;
	readonly issues?: IStandardChatInputPillSections;
	readonly artifacts?: IStandardChatInputPillSections;
	readonly references?: IStandardChatInputPillSections;
	readonly customizations?: IStandardChatInputPillSections;
	readonly browsers?: IStandardChatInputPillSections;
	readonly subagents?: IStandardChatInputPillSections;
}

function setsEqual<T>(first: ReadonlySet<T>, second: ReadonlySet<T>): boolean {
	return first === second || (first.size === second.size && [...first].every(value => second.has(value)));
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
	return {
		kind,
		hasData: derived(reader => getChatPillEntries(sections.read(reader)).length > 0),
		pill: createChatSectionPill(action, sections, options, resourceLabels, instantiationService),
	};
}

/** Builds the canonical pill components and ordering from surface-specific data adapters. */
export class StandardChatInputPillSources extends Disposable {
	readonly sources: readonly IChatInputPillSource[];

	constructor(
		data: IStandardChatInputPillsData,
		offeredKinds: readonly SessionChatPillKind[],
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const offered = new Set(offeredKinds);
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
				createActionViewItem: (options: IActionViewItemOptions) => new ChatChangesPillActionViewItem(action, options, changes.stats, instantiationService),
			};
			sources.push({
				kind: SessionChatPillKind.Changes,
				hasData: derived(reader => changes.stats.read(reader).files > 0),
				pill: constObservable(pill),
				getContextMenuActions: () => changes.getContextMenuActions?.() ?? [],
			});
		}

		const addSections = (kind: SessionChatPillKind, source: IStandardChatInputPillSections | undefined, options: IChatDropdownPillOptions) => {
			if (!source || !offered.has(kind)) {
				return;
			}
			const action = this._register(new Action(`chatInputPills.${kind}`, getSessionChatPillLabel(kind)));
			const pillSource = createChatSectionPillSource(kind, action, source.sections, source.icon ? { ...options, icon: source.icon } : options, resourceLabels, instantiationService);
			sources.push({
				...pillSource,
				hasData: source.hasData ?? pillSource.hasData,
				isVisible: pillSource.hasData,
				getContextMenuActions: () => source.getContextMenuActions?.() ?? [],
			});
		};
		addSections(SessionChatPillKind.PullRequests, data.pullRequests, sessionPullRequestsPillOptions);
		addSections(SessionChatPillKind.Issues, data.issues, sessionIssuesPillOptions);
		addSections(SessionChatPillKind.Artifacts, data.artifacts, chatArtifactPillOptions);
		addSections(SessionChatPillKind.References, data.references, sessionReferencesPillOptions);
		addSections(SessionChatPillKind.Customizations, data.customizations, sessionCustomizationsPillOptions);
		addSections(SessionChatPillKind.Browsers, data.browsers, sessionBrowsersPillOptions);
		addSections(SessionChatPillKind.Subagents, data.subagents, sessionSubagentsPillOptions);
		this.sources = sources;
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
			pills: derived(this, reader => visibleSources.read(reader).map(source => source.pill.read(reader))),
			context: _options.context,
		};
		this._pills = this._register(instantiationService.createInstance(ChatPillsWidget, model, {
			ariaLabel: _options.ariaLabel,
			actionRunner: _options.actionRunner,
			allowContextMenu: true,
		}));
		this._pills.element.classList.add('show-file-icons');
		this._row.content.appendChild(this._pills.element);
		this._row.observe(this._pills.element);
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
		const showContextMenu = (anchor: HTMLElement | StandardMouseEvent, targetKind?: SessionChatPillKind) => {
			const kinds = kindsWithData.get();
			if (kinds.size === 0) {
				return;
			}
			this._contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => this._getVisibilityActions(kinds, targetKind),
			});
		};
		this._register(addDisposableListener(this._row.content, EventType.CONTEXT_MENU, event => {
			event.preventDefault();
			event.stopPropagation();
			const anchor = new StandardMouseEvent(getWindow(this._row.content), event);
			showContextMenu(anchor, this._getTargetKind(event.target as HTMLElement | null));
		}));
		this._register(this._row.onDidRequestContextMenu(anchor => showContextMenu(anchor, this._getTargetKind(anchor))));

		derived(this, reader => {
			const anyVisible = this._pills.isVisible.read(reader);
			const anyHidden = kindsWithData.read(reader).size > 0;
			return anyVisible ? 'visible' : anyHidden ? 'empty' : 'hidden';
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

	private _getTargetKind(target: HTMLElement | null): SessionChatPillKind | undefined {
		const targetPill = this._pills.getPill(target);
		if (!targetPill) {
			return undefined;
		}
		for (const source of this._options.sources.get()) {
			if (source.kind && source.pill.get() === targetPill) {
				return source.kind;
			}
		}
		return undefined;
	}

	private _getVisibilityActions(kindsWithData: ReadonlySet<SessionChatPillKind>, targetKind?: SessionChatPillKind) {
		const menu = getSessionChatPillMenu(kindsWithData, this._visibility.readHiddenKinds(undefined), targetKind, this._options.offeredKinds);
		const restoreFocus = () => this._row.restoreFocus(() => this._pills.getPillElements());
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
		for (const source of this._options.sources.get()) {
			if (!source.kind || !this._options.offeredKinds.includes(source.kind)
				|| (targetKind ? source.kind !== targetKind : !kindsWithData.has(source.kind))) {
				continue;
			}
			const actions = source.getContextMenuActions?.();
			if (actions?.length) {
				targetActions.push(new SubmenuAction(
					`chatInputPills.options.${source.kind}`,
					localize('chatInputPills.options', "{0} Options", getSessionChatPillLabel(source.kind)),
					actions,
				));
			}
		}
		return Separator.join(targetActions, menu.withData.map(toggleAction), menu.withoutData.map(toggleAction));
	}
}

/** Creates a source for a pill whose data presence is represented by its membership. */
export function createChatInputPillSource(pill: IChatPill, kind?: SessionChatPillKind): IChatInputPillSource {
	return { kind, hasData: constObservable(true), pill: constObservable(pill) };
}
