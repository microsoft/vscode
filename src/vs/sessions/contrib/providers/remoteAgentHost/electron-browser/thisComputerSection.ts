/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/thisComputerSection.css';
import * as dom from '../../../../../base/browser/dom.js';
import { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IRadioOptionItem, Radio } from '../../../../../base/browser/ui/radio/radio.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../../platform/opener/browser/link.js';
import { getDevTunnelsDetail, getGitHubEnvironmentsDetail, GitHubEnvironmentsAvailability, RemoteConnectionsMethod, RemoteConnectionsSharing, RemoteConnectionsState, TUNNEL_ACCESS_DOCS_URL } from '../../../../../workbench/contrib/chat/electron-browser/remoteConnectionsSharing.js';
import { TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID } from '../../../../common/sessionCommands.js';

function getMethodLabel(method: Exclude<RemoteConnectionsMethod, 'off'>): string {
	return method === 'devTunnel'
		? localize('thisComputer.devTunnels', "Dev Tunnels")
		: localize('thisComputer.githubEnvironments', "GitHub Environments");
}

/**
 * Shows how this computer is shared for remote connections and lets the user change
 * the connection method or its sharing name, above the table of other remote environments.
 */
export class ThisComputerSection extends Disposable {

	readonly domNode: HTMLElement;
	private readonly sharing: RemoteConnectionsSharing;
	private readonly nameGroup: HTMLElement;
	private readonly name: HTMLElement;
	private readonly nameHover: IManagedHover;
	private readonly rename: Action;
	private readonly radio: Radio;
	private readonly status: HTMLElement;
	private readonly description: HTMLElement;
	private methods: readonly RemoteConnectionsMethod[] = [];
	private itemsKey: string | undefined;
	/** The method the user chose while it is being applied, so the control does not snap back meanwhile. */
	private pendingMethod: RemoteConnectionsMethod | undefined;

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICommandService commandService: ICommandService,
		@IHoverService hoverService: IHoverService,
	) {
		super();
		const state = this._register(instantiationService.createInstance(RemoteConnectionsState));
		this.sharing = this._register(instantiationService.createInstance(RemoteConnectionsSharing, state, () => commandService.executeCommand(TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID)));

		const titleId = generateUuid();
		this.domNode = dom.append(container, dom.$('section.remotes-this-computer', { 'aria-labelledby': titleId }));
		this._register(toDisposable(() => this.domNode.remove()));

		const header = dom.append(this.domNode, dom.$('.remotes-this-computer-header'));
		dom.append(header, renderIcon(Codicon.deviceDesktop)).setAttribute('aria-hidden', 'true');
		dom.append(header, dom.$('h2.remotes-this-computer-title', { id: titleId }, localize('thisComputer.title', "This Computer")));
		this.nameGroup = dom.append(header, dom.$('.remotes-this-computer-name-group'));
		dom.append(this.nameGroup, dom.$('span.remotes-this-computer-name-label', undefined, localize('thisComputer.sharingName', "Sharing name:")));
		this.name = dom.append(this.nameGroup, dom.$('span.remotes-this-computer-name'));
		this.nameHover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.name, ''));
		this.rename = this._register(new Action('remotes.thisComputer.rename', localize('thisComputer.rename', "Rename Sharing Name"), ThemeIcon.asClassName(Codicon.edit), false, () => this.sharing.rename()));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, dom.append(this.nameGroup, dom.$('.remotes-this-computer-actions')), {
			ariaLabel: localize('thisComputer.actions', "This Computer Actions"),
		}));
		toolbar.setActions([this.rename]);

		const methodLabelId = generateUuid();
		dom.append(this.domNode, dom.$('.remotes-this-computer-method-label', { id: methodLabelId }, localize('thisComputer.remoteConnections', "Remote Connections")));
		// Choosing a method starts or stops sharing, so arrow keys only move focus.
		this.radio = this._register(new Radio({ items: [], arrowKeyBehavior: 'focus' }));
		this.radio.domNode.setAttribute('aria-labelledby', methodLabelId);
		this.domNode.appendChild(this.radio.domNode);
		this._register(this.radio.onDidSelect(index => this.select(this.methods[index])));

		this.status = dom.append(this.domNode, dom.$('p.remotes-this-computer-status', { role: 'status' }));
		this.description = dom.append(this.domNode, dom.$('p.remotes-this-computer-description', undefined,
			localize('thisComputer.description', "Local sessions run directly here. Sharing lets other clients access agents and folders on this computer.")));
		this._register(instantiationService.createInstance(Link, dom.append(this.domNode, dom.$('.remotes-this-computer-learn-more')), {
			label: localize('thisComputer.learnMore', "Learn About Sharing"),
			href: TUNNEL_ACCESS_DOCS_URL,
		}, {}));

		this._register(this.sharing.onDidChange(() => this.update()));
		this.update();
	}

	getAccessibilityContent(): string {
		const name = this.sharing.name;
		return [
			localize('thisComputer.title', "This Computer"),
			...(name ? [localize('thisComputer.accessibleName', "Sharing name: {0}", name)] : []),
			this.status.textContent ?? '',
			this.description.textContent ?? '',
		].join('\n');
	}

	private async select(method: RemoteConnectionsMethod): Promise<void> {
		this.pendingMethod = method;
		this.update();
		try {
			await this.sharing.selectMethod(method);
		} finally {
			if (this.pendingMethod === method) {
				this.pendingMethod = undefined;
			}
			if (!this._store.isDisposed) {
				this.update();
			}
		}
	}

	private update(): void {
		const state = this.sharing.getState();
		const active = this.sharing.activeMethod;
		const shown = this.pendingMethod ?? active;
		const availability = this.sharing.gitHubEnvironmentsAvailability;
		const methods: RemoteConnectionsMethod[] = ['off', 'devTunnel'];
		if (availability !== 'unavailable' || shown === 'githubEnvironment') {
			methods.push('githubEnvironment');
		}
		const itemsKey = `${methods.join(',')}:${availability}`;
		if (itemsKey !== this.itemsKey) {
			this.itemsKey = itemsKey;
			this.methods = methods;
			this.radio.setItems(methods.map(method => this.getItem(method, availability)));
		}
		this.radio.setActiveItem(methods.indexOf(shown));

		const name = this.sharing.name;
		this.nameGroup.hidden = !name;
		this.name.textContent = name ?? '';
		this.nameHover.update(name ?? '');
		this.rename.enabled = !!name && !state.isConnecting;

		this.status.textContent = this.pendingMethod && this.pendingMethod !== active
			? this.pendingMethod === 'off'
				? localize('thisComputer.stopping', "Turning off remote connections...")
				: localize('thisComputer.starting', "Remote connections are starting via {0}...", getMethodLabel(this.pendingMethod))
			: active === 'off'
				? localize('thisComputer.statusOff', "Remote connections are off.")
				: state.isConnecting
					? localize('thisComputer.starting', "Remote connections are starting via {0}...", getMethodLabel(active))
					: localize('thisComputer.statusOn', "Remote connections are on via {0}.", getMethodLabel(active));
	}

	private getItem(method: RemoteConnectionsMethod, availability: GitHubEnvironmentsAvailability): IRadioOptionItem {
		switch (method) {
			case 'off':
				return { text: localize('thisComputer.methodOff', "Off"), tooltip: localize('thisComputer.methodOffTooltip', "Other clients cannot connect to this computer.") };
			case 'devTunnel':
				return { text: getMethodLabel(method), tooltip: getDevTunnelsDetail() };
			case 'githubEnvironment':
				return {
					text: localize('thisComputer.githubEnvironmentsPreview', "GitHub Environments (Preview)"),
					tooltip: getGitHubEnvironmentsDetail(availability),
					disabled: availability !== 'enabled',
				};
		}
	}
}
