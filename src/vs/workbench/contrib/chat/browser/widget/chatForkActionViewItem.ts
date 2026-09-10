/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { IActionRunner } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { CodiconActionViewItem } from '../../../notebook/browser/view/cellParts/cellActionView.js';

const actionIconClasses = ThemeIcon.asClassNameArray(Codicon.repoForked);
const forkIconClasses = ThemeIcon.asClassNameArray(Codicon.repoForkedCompact);
const spinnerIconClasses = ThemeIcon.asClassNameArray(ThemeIcon.modify(Codicon.loadingCompact, 'spin'));
const labelIconClasses = [...new Set([...actionIconClasses, ...forkIconClasses, ...spinnerIconClasses])].filter(className => className !== 'codicon');

export class ChatForkActionViewItem extends CodiconActionViewItem {

	private readonly actionRunnerListener = this._register(new MutableDisposable());
	private icon: HTMLElement | undefined;
	private running = false;

	override get actionRunner(): IActionRunner {
		return super.actionRunner;
	}

	override set actionRunner(actionRunner: IActionRunner) {
		super.actionRunner = actionRunner;
		this.bindActionRunner(actionRunner);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		// Stable classes so the stylesheet can target this item directly instead of
		// with :has(), which would add descendant-dependent style invalidation to a
		// workbench-wide stylesheet (microsoft/vscode#324985).
		container.classList.add('chat-fork-action-item');
		if (this.label) {
			this.label.classList.add('chat-fork-action-label');
			this.label.textContent = '';
			this.icon = document.createElement('span');
			this.icon.classList.add('chat-fork-action-icon');
			this.icon.setAttribute('aria-hidden', 'true');
			this.label.appendChild(this.icon);
		}
		this.bindActionRunner(super.actionRunner);
		this.renderRunningState();
	}

	protected override getTooltip(): string {
		return this.running
			? localize('chat.forkConversation.running', "Forking conversation")
			: super.getTooltip();
	}

	protected override updateClass(): void {
		super.updateClass();
		this.updateIcon();
	}

	private bindActionRunner(actionRunner: IActionRunner): void {
		const listeners = new DisposableStore();
		listeners.add(actionRunner.onWillRun(e => {
			if (e.action === this.action) {
				this.setRunning(true);
			}
		}));
		listeners.add(actionRunner.onDidRun(e => {
			if (e.action === this.action) {
				this.setRunning(false);
			}
		}));
		this.actionRunnerListener.value = listeners;
	}

	private setRunning(running: boolean): void {
		if (this.running === running) {
			return;
		}

		this.running = running;
		this.renderRunningState();
		if (running) {
			status(localize('chat.forkConversation.runningStatus', "Forking conversation"));
		}
	}

	private renderRunningState(): void {
		this.updateIcon();
		this.label?.setAttribute('aria-busy', String(this.running));
		this.updateTooltip();
	}

	private updateIcon(): void {
		if (!this.label || !this.icon) {
			return;
		}

		this.label.classList.remove(...labelIconClasses);
		this.icon.classList.remove(...forkIconClasses, ...spinnerIconClasses);
		this.icon.classList.add(...(this.running ? spinnerIconClasses : forkIconClasses));
	}
}
