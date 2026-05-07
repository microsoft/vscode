/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/noAgentHostEmptyState.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../base/browser/formattedTextRenderer.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMobile } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { SessionWorkspacePickerGroupContext } from '../../../common/contextkeys.js';
import { SESSION_WORKSPACE_GROUP_REMOTE } from '../../../services/sessions/common/session.js';

const $ = dom.$;

const LEARN_MORE_URL = 'https://aka.ms/VSCode/Agents/docs';

/**
 * Empty state shown in the new-session view when the agents window is open
 * on web (vscode.dev / insiders.vscode.dev) and no agent hosts have been
 * discovered yet. Replaces the workspace picker — which can't surface any
 * useful items without a host — with a clear explanation of what an agent
 * host is and call-to-action buttons that drive the user through the host
 * onboarding flows registered in {@link Menus.SessionWorkspaceManage}.
 *
 * Two visual states drive off {@link IAgentHostFilterService}:
 *
 *  - `discovering`: a small spinner + "Searching for agent hosts…" while
 *    discovery handlers are in flight. The connect actions are still
 *    rendered below so the user can pick a flow without waiting.
 *  - `idle`: the steady "no hosts" state with a heading, description,
 *    connect actions, and a "Search again" footer that re-runs discovery.
 */
export class NoAgentHostEmptyState extends Disposable {

	private readonly _scopedContextKeyService: IContextKeyService;

	private _root: HTMLElement | undefined;
	private _statusElement: HTMLElement | undefined;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();

		// `Menus.SessionWorkspaceManage` actions (Connect via Tunnel / SSH)
		// are gated by `SessionWorkspacePickerGroupContext == 'Remote'`. The
		// real workspace picker sets this when the user clicks the Remote
		// tab; here we surface the same actions outside the picker, so we
		// scope a child context key service and bind the key ourselves.
		this._scopedContextKeyService = this._register(contextKeyService.createScoped(document.createElement('div')));
		SessionWorkspacePickerGroupContext.bindTo(this._scopedContextKeyService).set(SESSION_WORKSPACE_GROUP_REMOTE);
	}

	render(parent: HTMLElement): void {
		this._root = dom.append(parent, $('.no-agent-host-empty-state'));
		this._root.setAttribute('role', 'group');
		this._root.setAttribute('aria-label', localize('noAgentHost.aria', "No agent hosts available"));

		// --- Hero icon if not mobile ----------------------------------------
		if (!isMobile) {
			const iconWrap = dom.append(this._root, $('.no-agent-host-icon'));
			iconWrap.append(...renderLabelWithIcons(`$(${Codicon.remote.id})`));
		}

		// --- Heading + description ------------------------------------------
		const heading = dom.append(this._root, $('h2.no-agent-host-title'));
		heading.textContent = localize('noAgentHost.title', "Connect a host to get started");

		// Pick the matching CLI binary for the channel the user is on so the
		// command they copy actually exists on their machine: `code` for
		// stable, `code-insiders` for any non-stable channel (insider /
		// exploration / dev). The agents window does not ship its own CLI —
		// it relies on the regular VS Code CLI to expose the agent host.
		const cliBinary = this._productService.quality === 'stable' ? 'code' : 'code-insiders';
		const command = `${cliBinary} tunnel`;

		const description = dom.append(this._root, $('p.no-agent-host-description'));
		renderFormattedText(
			localize(
				'noAgentHost.description',
				"Run ``{0}`` from any device, then return here to run agents tasks on it.",
				command
			),
			{ renderCodeSegments: true },
			description
		);
		description.appendChild(document.createTextNode(' '));
		const learnMore = dom.append(description, $('a.no-agent-host-link')) as HTMLAnchorElement;
		learnMore.textContent = localize('noAgentHost.learnMore', "Learn more");
		learnMore.href = LEARN_MORE_URL;
		this._register(dom.addDisposableListener(learnMore, dom.EventType.CLICK, e => {
			e.preventDefault();
			this._openerService.open(URI.parse(LEARN_MORE_URL));
		}));

		// --- Discovery footer ----------------------------------------------
		const footer = dom.append(this._root, $('.no-agent-host-footer'));
		this._statusElement = dom.append(footer, $('.no-agent-host-status'));
		this._statusElement.setAttribute('aria-live', 'polite');
	}

	override dispose(): void {
		this._root?.remove();
		this._root = undefined;
		super.dispose();
	}
}
