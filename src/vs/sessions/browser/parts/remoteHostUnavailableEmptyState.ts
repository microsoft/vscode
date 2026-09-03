/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/remoteHostUnavailableEmptyState.css';
import * as dom from '../../../base/browser/dom.js';
import { renderIcon } from '../../../base/browser/ui/iconLabel/iconLabels.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { Checkbox } from '../../../base/browser/ui/toggle/toggle.js';
import { Gesture, EventType as TouchEventType } from '../../../base/browser/touch.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../platform/theme/browser/defaultStyles.js';

export interface IRemoteHostUnavailableEmptyStateContent {
	readonly title: string;
	readonly description: string;
	readonly progress?: string;
	readonly action?: {
		readonly label: string;
		readonly run: () => void;
	};
	/** Optional kind-scoped auto-start policy, rendered beneath the action. */
	readonly autoConnect?: {
		readonly label: string;
		readonly checked: boolean;
		readonly onChange: (checked: boolean) => void;
	};
}

/**
 * Blocking recovery state for a new chat whose remote host is unavailable.
 */
export class RemoteHostUnavailableEmptyState extends Disposable {

	readonly domNode: HTMLElement;
	private readonly _title: HTMLElement;
	private readonly _description: HTMLElement;
	private readonly _progress: HTMLElement;
	private readonly _actionContainer: HTMLElement;
	private readonly _action: Button;
	private readonly _actionListener = this._register(new MutableDisposable());
	private readonly _autoConnectContainer: HTMLElement;
	private readonly _autoConnectRow: HTMLElement;
	private readonly _autoConnect: Checkbox;
	private readonly _autoConnectLabel: HTMLElement;
	private readonly _autoConnectListener = this._register(new MutableDisposable());

	constructor() {
		super();

		this.domNode = dom.$('.remote-host-unavailable-empty-state.hidden');
		this.domNode.setAttribute('role', 'group');
		this.domNode.tabIndex = -1;

		const icon = dom.append(this.domNode, dom.$('.remote-host-unavailable-empty-state-icon'));
		icon.setAttribute('aria-hidden', 'true');
		icon.appendChild(renderIcon(Codicon.debugDisconnect));

		this._title = dom.append(this.domNode, dom.$('h2.remote-host-unavailable-empty-state-title'));
		this._description = dom.append(this.domNode, dom.$('p.remote-host-unavailable-empty-state-description'));
		this._progress = dom.append(this.domNode, dom.$('p.remote-host-unavailable-empty-state-progress.hidden'));
		// Connect progress changes while the user waits (waiting → download
		// percentage), so announce it politely rather than leaving it silent.
		this._progress.setAttribute('role', 'status');
		this._actionContainer = dom.append(this.domNode, dom.$('.remote-host-unavailable-empty-state-action.hidden'));
		// Primary styling: recovering the host is the one thing to do here.
		this._action = this._register(new Button(this._actionContainer, { ...defaultButtonStyles, title: true }));
		this._autoConnectContainer = dom.append(this.domNode, dom.$('.remote-host-unavailable-empty-state-auto-connect.hidden'));
		this._autoConnectRow = dom.append(this._autoConnectContainer, dom.$('.remote-host-unavailable-empty-state-auto-connect-row'));
		this._autoConnect = this._register(new Checkbox('', false, { ...defaultCheckboxStyles, size: 14 }));
		dom.append(this._autoConnectRow, this._autoConnect.domNode);
		this._autoConnectLabel = dom.append(this._autoConnectRow, dom.$('span.remote-host-unavailable-empty-state-auto-connect-label'));
		this._autoConnectLabel.setAttribute('aria-hidden', 'true');
		this._register(Gesture.addTarget(this._autoConnectRow));
	}

	get visible(): boolean {
		return !this.domNode.classList.contains('hidden');
	}

	setContent(content: IRemoteHostUnavailableEmptyStateContent | undefined): void {
		this._actionListener.clear();
		this._autoConnectListener.clear();
		this.domNode.classList.toggle('hidden', !content);
		if (!content) {
			this._progress.textContent = '';
			this._progress.classList.add('hidden');
			this._actionContainer.classList.add('hidden');
			this._action.label = '';
			this._autoConnectContainer.classList.add('hidden');
			this._autoConnectLabel.textContent = '';
			this._autoConnect.checked = false;
			this._autoConnect.setTitle('');
			return;
		}

		this.domNode.setAttribute('aria-label', content.title);
		this._title.textContent = content.title;
		this._description.textContent = content.description;
		this._progress.textContent = content.progress ?? '';
		this._progress.classList.toggle('hidden', !content.progress);
		if (!content.action) {
			this._actionContainer.classList.add('hidden');
			this._action.label = '';
		} else {
			this._actionContainer.classList.remove('hidden');
			this._action.label = content.action.label;
			this._action.setAriaLabel(content.action.label);
			this._actionListener.value = this._action.onDidClick(() => content.action?.run());
		}

		const autoConnect = content.autoConnect;
		this._autoConnectContainer.classList.toggle('hidden', !autoConnect);
		this._autoConnectLabel.textContent = autoConnect?.label ?? '';
		this._autoConnect.checked = autoConnect?.checked ?? false;
		this._autoConnect.setTitle(autoConnect?.label ?? '');
		if (!autoConnect) {
			return;
		}

		const listeners = new DisposableStore();
		listeners.add(this._autoConnect.onChange(() => autoConnect.onChange(this._autoConnect.checked)));
		listeners.add(dom.addDisposableListener(this._autoConnectRow, dom.EventType.CLICK, e => {
			if (!this._autoConnect.enabled) {
				return;
			}
			dom.EventHelper.stop(e, true);
			this._autoConnect.checked = !this._autoConnect.checked;
			autoConnect.onChange(this._autoConnect.checked);
		}));
		listeners.add(dom.addDisposableListener(this._autoConnectRow, TouchEventType.Tap, e => {
			if (!this._autoConnect.enabled) {
				return;
			}
			dom.EventHelper.stop(e, true);
			this._autoConnect.checked = !this._autoConnect.checked;
			autoConnect.onChange(this._autoConnect.checked);
		}));
		this._autoConnectListener.value = listeners;
	}

	focus(): void {
		this.domNode.focus();
	}

	override dispose(): void {
		this.domNode.remove();
		super.dispose();
	}
}
