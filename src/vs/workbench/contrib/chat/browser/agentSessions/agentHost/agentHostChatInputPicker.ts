/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentHostChatInputPicker.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import type { ResolveSessionConfigResult, SessionConfigPropertySchema, SessionConfigValueItem } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import type { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { type IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import type { IAction } from '../../../../../../base/common/actions.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import type { IChatWidget } from '../../chat.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import type { IChatInputPickerOptions } from '../../widget/input/chatInputPickerActionItem.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

const FILTER_THRESHOLD = 10;

interface IConfigPickerItem {
	readonly value: string;
	readonly label: string;
	readonly description?: string;
}

function getConfigIcon(property: SessionConfigKey, value: unknown | undefined): ThemeIcon | undefined {
	if (property === SessionConfigKey.Isolation) {
		if (value === 'folder') { return Codicon.folder; }
		if (value === 'worktree') { return Codicon.worktree; }
		return undefined;
	}
	if (property === SessionConfigKey.Branch) {
		return Codicon.gitBranch;
	}
	if (property === SessionConfigKey.Mode) {
		switch (value) {
			case 'plan': return Codicon.checklist;
			case 'autopilot': return Codicon.rocket;
			case 'interactive': return Codicon.comment;
		}
	}
	return undefined;
}

function toActionItems(property: SessionConfigKey, items: readonly IConfigPickerItem[], currentValue: unknown | undefined): IActionListItem<IConfigPickerItem>[] {
	return items.map(item => ({
		kind: ActionListItemKind.Action,
		label: item.label,
		description: item.description,
		group: { title: '', icon: getConfigIcon(property, item.value) },
		item: { ...item, label: item.value === currentValue ? `${item.label} ${localize('selected', "(Selected)")}` : item.label },
	}));
}

function renderPickerTrigger(slot: HTMLElement, disabled: boolean, disposables: DisposableStore, onOpen: () => void): HTMLElement {
	const trigger = dom.append(slot, disabled ? dom.$('span.action-label') : dom.$('a.action-label'));
	if (disabled) {
		trigger.setAttribute('aria-readonly', 'true');
	} else {
		trigger.role = 'button';
		trigger.tabIndex = 0;
		trigger.setAttribute('aria-haspopup', 'listbox');
		disposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			disposables.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				onOpen();
			}));
		}
		disposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				onOpen();
			}
		}));
	}
	slot.classList.toggle('disabled', disabled);
	return trigger;
}

function toBackendSessionUri(sessionResource: URI): URI | undefined {
	const scheme = sessionResource.scheme;
	const prefix = 'agent-host-';
	if (!scheme.startsWith(prefix)) {
		return undefined;
	}
	const provider = scheme.substring(prefix.length);
	if (!provider) {
		return undefined;
	}
	const rawId = sessionResource.path.replace(/^\//, '');
	return URI.from({ scheme: provider, path: `/${rawId}` });
}

/**
 * One workbench chat-input chip bound to a single well-known agent-host
 * session-config property (`SessionConfigKey.Mode`, `.Isolation`, or
 * `.Branch`).
 */
export class AgentHostChatInputPicker extends Disposable {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _filterDelayer = this._register(new Delayer<readonly IActionListItem<IConfigPickerItem>[]>(200));
	private readonly _subRef = this._register(new MutableDisposable<IDisposable & { readonly sub: IAgentSubscription<SessionState>; readonly backendSession: URI }>());
	private _container: HTMLElement | undefined;

	private _initialResolved: { readonly sessionResource: URI; readonly result: ResolveSessionConfigResult } | undefined;
	private readonly _initialResolveCts = this._register(new MutableDisposable<CancellationTokenSource>());

	constructor(
		private readonly _widget: IChatWidget,
		private readonly _property: SessionConfigKey,
		private readonly _pickerOptions: IChatInputPickerOptions | undefined,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@IAgentHostSessionWorkingDirectoryResolver private readonly _workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisional: IAgentHostUntitledProvisionalSessionService,
	) {
		super();

		this._register(this._widget.onDidChangeViewModel(() => this._reattach()));
		const opts = this._pickerOptions;
		if (opts) {
			this._register(autorun(reader => {
				opts.hideChevrons.read(reader);
				this._renderChip();
			}));
		}
		this._register(this._provisional.onDidChange((sessionResource: URI) => {
			const current = this._widget.viewModel?.sessionResource;
			if (current && current.toString() === sessionResource.toString()) {
				this._reattach();
			}
		}));
		this._reattach();
	}

	render(container: HTMLElement): void {
		this._container = container;
		container.classList.add('agent-host-chat-input-picker-host');
		container.classList.add(`agent-host-chat-input-picker-host-${this._property}`);
		this._renderChip();
	}

	private _reattach(): void {
		const sessionResource = this._widget.viewModel?.sessionResource;
		const provisionalBackend = sessionResource ? this._provisional.get(sessionResource) : undefined;
		const backendSession = provisionalBackend
			?? (sessionResource ? toBackendSessionUri(sessionResource) : undefined);

		if (!sessionResource || !backendSession) {
			this._subRef.clear();
			this._initialResolved = undefined;
			this._cancelInitialResolve();
			this._renderChip();
			return;
		}

		if (isUntitledChatSession(sessionResource) && !provisionalBackend) {
			this._subRef.clear();
			if (!this._initialResolved || this._initialResolved.sessionResource.toString() !== sessionResource.toString()) {
				this._initialResolved = undefined;
				void this._refreshInitialResolved(sessionResource, backendSession);
			}
			// Eagerly create a provisional backend session so even users
			// who never touch a chip still get their picker defaults
			// (e.g. `isolation: 'worktree'`) flowed through to the agent
			// at materialization time. Without this, sending the very
			// first message goes through the handler's standard
			// `_createAndSubscribe` path with no `sessionConfig`.
			//
			// Idempotent + serialised inside the service, so each chip
			// instance racing into this branch produces exactly one
			// provisional. Once it resolves, the service fires
			// `onDidChange` and we re-attach into the subscription path.
			void this._provisional.getOrCreate(
				sessionResource,
				backendSession.scheme,
				this._readWorkingDirectory(),
			);
			this._renderChip();
			return;
		}

		this._initialResolved = undefined;
		this._cancelInitialResolve();
		const ref = this._agentHostService.getSubscription(StateComponents.Session, backendSession);
		const sub = ref.object;
		const listener = sub.onDidChange(() => this._renderChip());
		this._subRef.value = {
			sub,
			backendSession,
			dispose: () => { listener.dispose(); ref.dispose(); },
		};
		this._renderChip();
	}

	private _cancelInitialResolve(): void {
		// CancellationTokenSource.dispose() does not cancel by default, so we
		// must explicitly cancel before clearing/replacing to ensure any
		// in-flight resolveSessionConfig call cannot still write back into
		// `_initialResolved` after the session has moved on.
		this._initialResolveCts.value?.cancel();
		this._initialResolveCts.clear();
	}

	private async _refreshInitialResolved(sessionResource: URI, backendSession: URI): Promise<void> {
		this._initialResolveCts.value?.cancel();
		const cts = new CancellationTokenSource();
		this._initialResolveCts.value = cts;
		try {
			const result = await this._agentHostService.resolveSessionConfig({
				provider: backendSession.scheme,
				workingDirectory: this._readWorkingDirectory(),
			});
			if (cts.token.isCancellationRequested || this._widget.viewModel?.sessionResource?.toString() !== sessionResource.toString()) {
				return;
			}
			this._initialResolved = { sessionResource, result };
			this._renderChip();
		} catch {
			// Best-effort.
		}
	}

	private _renderChip(): void {
		if (!this._container) {
			return;
		}
		this._renderDisposables.clear();
		dom.clearNode(this._container);

		const ctx = this._readContext();
		// For sessions that have already started (i.e. no longer untitled —
		// the first message was sent and the chat session has been
		// materialized), hide the picker entirely when the property cannot
		// be changed post-creation. While the session is still untitled the
		// user is in the pre-send configuration phase and must be able to
		// adjust creation-time-only properties (e.g. isolation, branch).
		const sessionResource = this._widget.viewModel?.sessionResource;
		const isStartedSession = !!sessionResource && !isUntitledChatSession(sessionResource);
		if (!ctx || (isStartedSession && ctx.schema.sessionMutable === false)) {
			this._container.style.display = 'none';
			this._container.classList.add('agent-host-chat-input-picker-host-hidden');
			return;
		}
		this._container.style.display = '';
		this._container.classList.remove('agent-host-chat-input-picker-host-hidden');

		const slot = dom.append(this._container, dom.$('.agent-host-chat-input-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const isReadOnly = !!ctx.schema.readOnly || (isStartedSession && ctx.schema.sessionMutable === false);
		const trigger = renderPickerTrigger(slot, isReadOnly, this._renderDisposables, () => this._showPicker(trigger));
		this._renderTrigger(trigger, ctx.schema, ctx.value, isReadOnly);
	}

	private _renderTrigger(trigger: HTMLElement, schema: SessionConfigPropertySchema, value: unknown | undefined, isReadOnly: boolean): void {
		dom.clearNode(trigger);

		const compact = this._pickerOptions?.hideChevrons.get() ?? false;

		const icon = getConfigIcon(this._property, value);
		if (icon) {
			dom.append(trigger, renderIcon(icon));
		}
		const label = this._labelFor(schema, value);
		if (!compact) {
			const labelSpan = dom.append(trigger, dom.$('span.agent-host-chat-input-picker-label'));
			labelSpan.textContent = label;
		}
		trigger.setAttribute('aria-label', isReadOnly
			? localize('agentHostChatInputPicker.triggerAriaReadOnly', "{0}: {1}, Read-Only", schema.title, label)
			: localize('agentHostChatInputPicker.triggerAria', "{0}: {1}", schema.title, label));
		if (!isReadOnly && !compact) {
			dom.append(trigger, renderIcon(Codicon.chevronDown));
		}
	}

	private _labelFor(schema: SessionConfigPropertySchema, value: unknown | undefined): string {
		if (typeof value === 'string') {
			const index = schema.enum?.indexOf(value) ?? -1;
			return index >= 0 ? schema.enumLabels?.[index] ?? value : value;
		}
		return schema.title;
	}

	private _readContext(): { backendSession: URI; schema: SessionConfigPropertySchema; value: unknown | undefined } | undefined {
		const sessionResource = this._widget.viewModel?.sessionResource;
		if (!sessionResource) {
			return undefined;
		}

		if (this._subRef.value) {
			const state = this._subRef.value.sub.value;
			if (!state || state instanceof Error) {
				return undefined;
			}
			const schema = state.config?.schema.properties[this._property];
			if (!schema) {
				return undefined;
			}
			const value = state.config?.values?.[this._property] ?? schema.default;
			return { backendSession: this._subRef.value.backendSession, schema, value };
		}

		if (this._initialResolved && this._initialResolved.sessionResource.toString() === sessionResource.toString()) {
			const schema = this._initialResolved.result.schema.properties[this._property];
			if (!schema) {
				return undefined;
			}
			const backendSession = toBackendSessionUri(sessionResource);
			if (!backendSession) {
				return undefined;
			}
			const value = this._initialResolved.result.values?.[this._property] ?? schema.default;
			return { backendSession, schema, value };
		}

		return undefined;
	}

	private async _showPicker(trigger: HTMLElement): Promise<void> {
		if (this._actionWidgetService.isVisible) {
			return;
		}
		const ctx = this._readContext();
		if (!ctx || ctx.schema.readOnly) {
			return;
		}

		const items = await this._getItems(ctx.schema);
		if (items.length === 0) {
			return;
		}
		const currentValue = ctx.value;
		const actionItems = toActionItems(this._property, items, currentValue);

		const delegate: IActionListDelegate<IConfigPickerItem> = {
			onSelect: item => {
				this._actionWidgetService.hide();
				void this._setValue(ctx.backendSession, item.value);
			},
			onFilter: ctx.schema.enumDynamic
				? query => this._filterDelayer.trigger(async () => {
					const refreshed = this._readContext();
					if (!refreshed) {
						return [];
					}
					return toActionItems(this._property, await this._getItems(refreshed.schema, query), refreshed.value);
				})
				: undefined,
			onHide: () => trigger.focus(),
		};

		this._actionWidgetService.show<IConfigPickerItem>(
			`agentHostChatInputPicker.${this._property}`,
			false,
			actionItems,
			delegate,
			trigger,
			undefined,
			[],
			{
				getAriaLabel: item => item.label ?? '',
				getWidgetAriaLabel: () => localize('agentHostChatInputPicker.ariaLabel', "{0} Picker", ctx.schema.title),
			},
			actionItems.length > FILTER_THRESHOLD || ctx.schema.enumDynamic
				? { showFilter: true, filterPlaceholder: localize('agentHostChatInputPicker.filter', "Filter...") }
				: undefined,
		);
	}

	private async _getItems(schema: SessionConfigPropertySchema, query?: string): Promise<readonly IConfigPickerItem[]> {
		const sessionResource = this._widget.viewModel?.sessionResource;
		const backendSession = this._subRef.value?.backendSession
			?? (sessionResource ? toBackendSessionUri(sessionResource) : undefined);
		if (schema.enumDynamic && backendSession) {
			try {
				const result = await this._agentHostService.sessionConfigCompletions({
					provider: backendSession.scheme,
					property: this._property,
					query,
					workingDirectory: this._readWorkingDirectory(),
					config: this._readCurrentValues(),
				});
				return result.items.map(item => this._fromCompletion(item));
			} catch {
				// Fall through to the static enum below.
			}
		}
		return (schema.enum ?? []).map((value, index) => ({
			value,
			label: schema.enumLabels?.[index] ?? value,
			description: schema.enumDescriptions?.[index],
		}));
	}

	private _fromCompletion(item: SessionConfigValueItem): IConfigPickerItem {
		return { value: item.value, label: item.label, description: item.description };
	}

	private _readWorkingDirectory(): URI | undefined {
		const state = this._subRef.value?.sub.value;
		if (state && !(state instanceof Error)) {
			const cwd = state.summary.workingDirectory;
			return typeof cwd === 'string' ? URI.parse(cwd) : cwd;
		}
		const sessionResource = this._widget.viewModel?.sessionResource;
		return (sessionResource && this._workingDirectoryResolver.resolve(sessionResource))
			?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
	}

	private _readCurrentValues(): Record<string, unknown> | undefined {
		const state = this._subRef.value?.sub.value;
		if (state && !(state instanceof Error)) {
			return state.config?.values;
		}
		return this._initialResolved?.result.values;
	}

	private async _setValue(backendSession: URI, value: string): Promise<void> {
		const sessionResource = this._widget.viewModel?.sessionResource;
		if (!sessionResource) {
			return;
		}

		let dispatchTarget = backendSession;
		if (isUntitledChatSession(sessionResource)) {
			const provider = backendSession.scheme;
			const created = await this._provisional.getOrCreate(
				sessionResource,
				provider,
				this._readWorkingDirectory(),
			);
			if (!created) {
				return;
			}
			dispatchTarget = created;
			if (!this._subRef.value || this._subRef.value.backendSession.toString() !== created.toString()) {
				this._reattach();
			}
		}

		this._agentHostService.dispatch({
			type: ActionType.SessionConfigChanged,
			session: dispatchTarget.toString(),
			config: { [this._property]: value },
		});
	}
}

export class AgentHostChatInputPickerActionViewItem extends BaseActionViewItem {
	constructor(action: IAction, private readonly _picker: AgentHostChatInputPicker) {
		super(undefined, action);
		this._register(this._picker);
	}
	override render(container: HTMLElement): void {
		this._picker.render(container);
	}
}
