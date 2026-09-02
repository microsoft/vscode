/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/remoteHostUnavailableEmptyState.css';
import * as dom from '../../../base/browser/dom.js';
import { renderIcon } from '../../../base/browser/ui/iconLabel/iconLabels.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { defaultButtonStyles } from '../../../platform/theme/browser/defaultStyles.js';

export interface IRemoteHostUnavailableEmptyStateContent {
	readonly title: string;
	readonly description: string;
	readonly progress?: string;
	readonly action?: {
		readonly label: string;
		readonly run: () => void;
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
		this._actionContainer = dom.append(this.domNode, dom.$('.remote-host-unavailable-empty-state-action.hidden'));
		// Primary styling: recovering the host is the one thing to do here.
		this._action = this._register(new Button(this._actionContainer, { ...defaultButtonStyles, title: true }));
	}

	get visible(): boolean {
		return !this.domNode.classList.contains('hidden');
	}

	setContent(content: IRemoteHostUnavailableEmptyStateContent | undefined): void {
		this._actionListener.clear();
		this.domNode.classList.toggle('hidden', !content);
		if (!content) {
			this._progress.textContent = '';
			this._progress.classList.add('hidden');
			this._actionContainer.classList.add('hidden');
			this._action.label = '';
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
			return;
		}

		this._actionContainer.classList.remove('hidden');
		this._action.label = content.action.label;
		this._action.setAriaLabel(content.action.label);
		this._actionListener.value = this._action.onDidClick(() => content.action?.run());
	}

	focus(): void {
		this.domNode.focus();
	}

	override dispose(): void {
		this.domNode.remove();
		super.dispose();
	}
}
