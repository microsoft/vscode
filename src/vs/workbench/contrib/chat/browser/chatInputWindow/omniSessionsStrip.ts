/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { AgentSessionStatus, IAgentSession, getAgentChangesSummary } from '../agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { AgentSessionStatusIcon, getAgentSessionStatusIcon } from '../agentSessions/agentSessionsViewer.js';
import { IChatWidgetService } from '../chat.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { autorun } from '../../../../../base/common/observable.js';

/** Above this the strip stops listing and just counts. */
const MAX_LISTED_SESSIONS = 4;

/**
 * A status strip under the omnibar input, summarising the sessions that are
 * still running or waiting on you.
 *
 * The bar is a place you talk to work happening elsewhere, so the one thing it
 * owes you is whether that work is still going — and, more sharply, whether any
 * of it is blocked on an answer. It stays a single line until you open it: a
 * floating bar that grows a list every time an agent is thinking would be
 * pinned open permanently.
 */
export class OmniSessionsStrip extends Disposable {

	private readonly _element: HTMLElement;
	private readonly _summary: HTMLElement;
	private readonly _summaryLabel: HTMLElement;
	private readonly _chevron: HTMLElement;
	private readonly _list: HTMLElement;
	private readonly _rows = this._register(new DisposableStore());

	private _expanded = false;

	get element(): HTMLElement {
		return this._element;
	}

	constructor(
		private readonly onDidChangeHeight: () => void,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();

		this._element = dom.$('.omni-sessions-strip');
		this._summary = dom.append(this._element, dom.$('a.omni-sessions-summary', {
			role: 'button',
			tabindex: '0',
			'aria-expanded': 'false',
		}));
		this._summaryLabel = dom.append(this._summary, dom.$('span.omni-sessions-summary-label'));
		this._chevron = dom.append(this._summary, dom.$('span.omni-sessions-chevron'));
		this._list = dom.append(this._element, dom.$('.omni-sessions-list'));

		this._register(dom.addDisposableListener(this._summary, dom.EventType.CLICK, () => this._toggle()));
		this._register(dom.addStandardDisposableListener(this._summary, dom.EventType.KEY_DOWN, e => {
			if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
				e.preventDefault();
				this._toggle();
			}
		}));

		this._register(this.agentSessionsService.model.onDidChangeSessions(() => this.update()));
		// The aggregated model caches a session's status and deliberately never
		// caches it as in-progress, so a local chat that is mid-answer still reads
		// as complete there. Re-evaluate whenever any request starts or finishes
		// and ask each session for its own live state.
		this._register(autorun(reader => {
			this.chatService.requestInProgressObs.read(reader);
			this.update();
		}));
	}

	private _toggle(): void {
		this._expanded = !this._expanded;
		this._summary.setAttribute('aria-expanded', String(this._expanded));
		this.update();
	}

	update(): void {
		const active = this.agentSessionsService.model.sessions
			.filter(session => !session.isArchived() && this._isActive(session));

		if (!active.length) {
			this._element.classList.remove('shown');
			this._rows.clear();
			dom.clearNode(this._list);
			this.onDidChangeHeight();
			return;
		}

		// Blocked work leads: it is the only kind that will not finish without
		// you, so it is the only kind worth interrupting for.
		const blocked = active.filter(s => s.status === AgentSessionStatus.NeedsInput);
		const ordered = [...blocked, ...active.filter(s => s.status !== AgentSessionStatus.NeedsInput)];

		this._element.classList.add('shown');
		this._element.classList.toggle('needs-input', blocked.length > 0);
		this._summaryLabel.textContent = blocked.length
			? (blocked.length === 1
				? localize('omniSessions.oneBlocked', "1 session needs you")
				: localize('omniSessions.manyBlocked', "{0} sessions need you", blocked.length))
			: (active.length === 1
				? localize('omniSessions.oneRunning', "1 session running")
				: localize('omniSessions.manyRunning', "{0} sessions running", active.length));

		dom.clearNode(this._chevron);
		this._chevron.appendChild(renderIcon(this._expanded ? Codicon.chevronUp : Codicon.chevronDown));

		this._rows.clear();
		dom.clearNode(this._list);
		this._list.classList.toggle('expanded', this._expanded);
		if (this._expanded) {
			for (const session of ordered.slice(0, MAX_LISTED_SESSIONS)) {
				this._list.appendChild(this._renderRow(session));
			}
		}

		this.onDidChangeHeight();
	}

	/**
	 * Live, not cached: a provider-backed session reports its own status, while
	 * a local chat only looks in-progress from its model.
	 */
	private _isActive(session: IAgentSession): boolean {
		if (session.status === AgentSessionStatus.InProgress || session.status === AgentSessionStatus.NeedsInput) {
			return true;
		}
		return this.chatService.getSession(session.resource)?.requestInProgress.get() === true;
	}

	private _renderRow(session: IAgentSession): HTMLElement {
		const row = dom.$('a.omni-sessions-row', { role: 'button', tabindex: '0' });

		const iconContainer = dom.append(row, dom.$('span.omni-sessions-row-icon'));
		const statusIcon = this._rows.add(new AgentSessionStatusIcon(iconContainer, getAgentSessionStatusIcon, this.accessibilityService));
		statusIcon.setStatus(session);

		const label = dom.append(row, dom.$('span.omni-sessions-row-label'));
		label.textContent = session.label;

		const changes = getAgentChangesSummary(session.changes);
		if (changes && (changes.insertions || changes.deletions)) {
			const detail = dom.append(row, dom.$('span.omni-sessions-row-detail'));
			detail.textContent = localize('omniSessions.changes', "+{0} \u2212{1}", changes.insertions, changes.deletions);
		}

		const open = () => void this.chatWidgetService.openSession(session.resource);
		this._rows.add(dom.addDisposableListener(row, dom.EventType.CLICK, open));
		this._rows.add(dom.addStandardDisposableListener(row, dom.EventType.KEY_DOWN, e => {
			if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
				e.preventDefault();
				open();
			}
		}));

		return row;
	}
}
