/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { CopilotChatSessionsProvider, ICopilotChatSession } from './copilotChatSessionsProvider.js';

const FILTER_THRESHOLD = 10;

interface IBranchItem {
	readonly name: string;
}

/**
 * A widget for selecting a git branch.
 * Reads branch list and selected branch from the active session,
 * which is the source of truth for branch state.
 */
export class BranchPicker extends Disposable {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		this._register(autorun(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
			const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session!.sessionId) : undefined;
			if (providerSession) {
				providerSession.loading.read(reader);
				providerSession.branches.read(reader);
				providerSession.branch.read(reader);
				providerSession.isolationMode.read(reader);
			}
			this._updateTriggerLabel();
		}));
	}

	private _getSession(): ICopilotChatSession | undefined {
		const session = this.sessionsManagementService.activeSession.get();
		if (!session) {
			return undefined;
		}
		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		return provider instanceof CopilotChatSessionsProvider ? provider.getSession(session.sessionId) : undefined;
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._slotElement = slot;
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;
		this._updateTriggerLabel();

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e, true);
			this.showPicker();
		}));

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this.showPicker();
			}
		}));
	}

	showPicker(): void {
		const session = this._getSession();
		const branches = session?.branches.get() ?? [];
		if (!this._triggerElement || this.actionWidgetService.isVisible || branches.length === 0 || session?.isolationMode.get() === 'workspace') {
			return;
		}

		const selectedBranch = session?.branch.get();
		const items: IActionListItem<IBranchItem>[] = branches.map(branch => ({
			kind: ActionListItemKind.Action,
			label: branch,
			group: { title: '', icon: Codicon.gitBranch },
			item: { name: branch, checked: branch === selectedBranch || undefined },
		}));

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IBranchItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				session?.setBranch(item.name);
			},
			onHide: () => { triggerElement.focus(); },
		};

		const totalActions = items.filter(i => i.kind === ActionListItemKind.Action).length;

		this.actionWidgetService.show<IBranchItem>(
			'branchPicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('branchPicker.ariaLabel', "Branch Picker"),
			},
			totalActions > FILTER_THRESHOLD ? { showFilter: true, filterPlaceholder: localize('branchPicker.filter', "Filter branches...") } : undefined,
		);
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}
		dom.clearNode(this._triggerElement);

		const session = this._getSession();
		const branches = session?.branches.get() ?? [];
		const isLoading = session?.loading.get() ?? false;
		const isDisabled = session?.isolationMode.get() === 'workspace' || branches.length === 0;
		const label = session?.branch.get() ?? localize('branchPicker.select', "Branch");

		dom.append(this._triggerElement, renderIcon(Codicon.gitBranch));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));

		this._triggerElement.ariaLabel = localize('branchPicker.triggerAriaLabel', "Pick Branch, {0}", label);

		this._slotElement?.classList.toggle('disabled', isLoading || isDisabled);
		this._triggerElement.setAttribute('aria-disabled', String(isLoading || isDisabled));
		this._triggerElement.tabIndex = (isLoading || isDisabled) ? -1 : 0;
	}
}
