/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customizationMarketplaceSourceWarnings.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { equals } from '../../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ICustomizationMarketplaceSourceError, ICustomizationMarketplaceSourceInfo, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { INotificationHandle, INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';

export class CustomizationMarketplaceSourceWarnings extends Disposable {
	readonly element: HTMLElement;
	private readonly rows = this._register(new DisposableStore());
	private readonly recovery = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly buttons: Button[] = [];
	private readonly actions = new Map<string, ICustomizationMarketplaceSourceRecoveryAction | undefined>();
	private readonly sourceNames = new Map<string, string>();
	private readonly notifications = new Map<string, { readonly handle: INotificationHandle; readonly sourceIds: readonly string[] }>();
	private errors: readonly ICustomizationMarketplaceSourceError[] = [];
	private recoveringSourceIds: readonly string[] | undefined;
	private pendingRetries: { readonly key: string; readonly sourceIds: readonly string[]; readonly action: ICustomizationMarketplaceSourceRecoveryAction | undefined }[] = [];
	private loading = false;

	constructor(
		parent: HTMLElement,
		private readonly getSources: () => readonly ICustomizationMarketplaceSourceInfo[],
		private readonly onRetry: () => void,
		private readonly getRecoveryAction: (sourceId: string) => ICustomizationMarketplaceSourceRecoveryAction | undefined,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.element = DOM.append(parent, DOM.$('.customization-marketplace-source-warnings'));
		this.element.setAttribute('role', 'group');
		this.element.setAttribute('aria-label', localize('customizationMarketplace.sources', "Marketplace sources"));
		this.element.hidden = true;
	}

	get hasInlinePrompts(): boolean {
		return this.errors.some(error => this.actions.get(error.sourceId)?.kind === 'signIn');
	}

	get hasFailures(): boolean {
		return this.errors.some(error => this.actions.get(error.sourceId)?.kind !== 'signIn');
	}

	get firstActionElement(): HTMLElement | undefined {
		return this.buttons[0]?.element;
	}

	update(errors: readonly ICustomizationMarketplaceSourceError[], loading: boolean, queryComplete: boolean, relevantSourceIds: readonly string[]): void {
		if (this.recoveringSourceIds && !this.recoveringSourceIds.some(sourceId => errors.some(error => error.sourceId === sourceId))) {
			this.recovery.value?.cancel();
		}
		const sourceNamesChanged = errors.some(error => this.sourceNames.get(error.sourceId) !== this.getSourceName(error));
		if (sourceNamesChanged || !equals(this.errors, errors, (a, b) => a.sourceId === b.sourceId && a.message === b.message)) {
			this.errors = errors;
			this.rows.clear();
			this.buttons.length = 0;
			this.actions.clear();
			this.sourceNames.clear();
			DOM.clearNode(this.element);
			for (const error of errors) {
				this.sourceNames.set(error.sourceId, this.getSourceName(error));
				const action = this.getRecoveryAction(error.sourceId);
				this.actions.set(error.sourceId, action);
			}
			for (const group of this.getGroups()) {
				const { action, errors } = group;
				if (action?.kind !== 'signIn') {
					continue;
				}
				const row = DOM.append(this.element, DOM.$('.customization-marketplace-source-signin'));
				DOM.append(row, DOM.$('span.customization-marketplace-source-message')).textContent = this.getSignInMessage(errors);
				const retry = this.rows.add(new Button(row, { ...defaultButtonStyles }));
				retry.label = action.label;
				retry.setAriaLabel(localize('customizationMarketplace.signInSourceLabel', "{0} to access {1}.", action.label, this.getSourceNames(errors)));
				this.rows.add(retry.onDidClick(() => this.retry(errors.map(error => error.sourceId), action)));
				this.buttons.push(retry);
			}
			this.element.hidden = !this.hasInlinePrompts;
		}
		this.updateNotifications(queryComplete, relevantSourceIds);
		this.setLoading(loading);
	}

	private updateNotifications(queryComplete: boolean, relevantSourceIds: readonly string[]): void {
		const relevant = new Set(relevantSourceIds);
		for (const [key, notification] of [...this.notifications]) {
			if (notification.sourceIds.some(sourceId => !relevant.has(sourceId))) {
				this.notifications.delete(key);
				notification.handle.close();
			}
		}
		this.pendingRetries = this.pendingRetries.filter(pending => pending.sourceIds.every(sourceId => relevant.has(sourceId)));
		if (!queryComplete) {
			return;
		}

		const current = new Set<string>();
		for (const { action, errors } of this.getGroups()) {
			if (action?.kind === 'signIn') {
				continue;
			}
			const key = JSON.stringify(errors.map(error => [error.sourceId, error.message, action?.label]));
			current.add(key);
			if (this.notifications.has(key)) {
				continue;
			}
			const label = action?.label ?? localize('customizationMarketplace.retrySource', "Retry");
			const handle = this.notificationService.prompt(Severity.Warning, this.getMessage(errors[0]), [{
				label,
				keepOpen: true,
				run: () => {
					void this.retry(errors.map(error => error.sourceId), action, key);
				},
			}]);
			this.notifications.set(key, { handle, sourceIds: errors.map(error => error.sourceId) });
		}
		this.pendingRetries = this.pendingRetries.filter(pending => current.has(pending.key));
		for (const [key, notification] of [...this.notifications]) {
			if (!current.has(key)) {
				this.notifications.delete(key);
				notification.handle.close();
			}
		}
	}

	setLoading(loading: boolean): void {
		this.loading = loading;
		const busy = loading || this.recovery.value !== undefined;
		this.element.setAttribute('aria-busy', String(busy));
		for (const button of this.buttons) {
			button.enabled = !busy;
		}
		if (!busy && this.pendingRetries.length > 0) {
			const pending = this.pendingRetries.shift()!;
			void this.retry(pending.sourceIds, pending.action, pending.key);
		}
	}

	private async retry(sourceIds: readonly string[], action: ICustomizationMarketplaceSourceRecoveryAction | undefined, key?: string): Promise<void> {
		if (this.loading) {
			if (key && !this.pendingRetries.some(pending => pending.key === key)) {
				this.pendingRetries.push({ key, sourceIds, action });
			}
			return;
		}
		if (this.recovery.value) {
			return;
		}
		if (!action) {
			this.onRetry();
			return;
		}
		const cancellation = this.recovery.value = new CancellationTokenSource();
		this.recoveringSourceIds = sourceIds;
		this.setLoading(this.loading);
		try {
			await action.run(cancellation.token);
			if (!cancellation.token.isCancellationRequested && !this._store.isDisposed) {
				this.onRetry();
			}
		} catch (error) {
			if (!cancellation.token.isCancellationRequested && !isCancellationError(error)) {
				this.notificationService.error(error);
			}
		} finally {
			this.recoveringSourceIds = undefined;
			this.recovery.clear();
			if (!this._store.isDisposed) {
				this.setLoading(this.loading);
			}
		}
	}

	getAccessibilityContent(): string {
		return this.getGroups()
			.filter(({ action }) => action?.kind === 'signIn')
			.map(({ errors, action }) => localize('customizationMarketplace.sourceSignIn', "{0} Choose {1} to access {2}.", this.getSignInMessage(errors), action!.label, this.getSourceNames(errors)))
			.join('\n');
	}

	private getSourceName(error: ICustomizationMarketplaceSourceError): string {
		return this.getSources().find(source => source.id === error.sourceId)?.displayName ?? error.sourceId;
	}

	private getSourceNames(errors: readonly ICustomizationMarketplaceSourceError[]): string {
		const names = errors.map(error => this.getSourceName(error));
		return names.length === 2
			? localize('customizationMarketplace.twoSources', "{0} and {1}", names[0], names[1])
			: names.join(', ');
	}

	private getSignInMessage(errors: readonly ICustomizationMarketplaceSourceError[]): string {
		return errors.length === 1
			? errors[0].message
			: localize('customizationMarketplace.sharedSignIn', "Sign in to access {0}.", this.getSourceNames(errors));
	}

	private getGroups(): readonly { readonly errors: readonly ICustomizationMarketplaceSourceError[]; readonly action: ICustomizationMarketplaceSourceRecoveryAction | undefined }[] {
		const groups: { errors: ICustomizationMarketplaceSourceError[]; action: ICustomizationMarketplaceSourceRecoveryAction | undefined }[] = [];
		const shared = new Map<string, { errors: ICustomizationMarketplaceSourceError[]; action: ICustomizationMarketplaceSourceRecoveryAction }>();
		for (const error of this.errors) {
			const action = this.actions.get(error.sourceId);
			if (!action?.groupId) {
				groups.push({ errors: [error], action });
				continue;
			}
			let group = shared.get(action.groupId);
			if (!group) {
				group = { errors: [], action };
				shared.set(action.groupId, group);
				groups.push(group);
			}
			group.errors.push(error);
		}
		return groups;
	}

	private getMessage(error: ICustomizationMarketplaceSourceError): string {
		return localize('customizationMarketplace.sourceError', "{0}: {1}", this.getSourceName(error), error.message);
	}

	override dispose(): void {
		this.recovery.value?.cancel();
		for (const notification of this.notifications.values()) {
			notification.handle.close();
		}
		this.notifications.clear();
		this.pendingRetries = [];
		super.dispose();
	}
}
