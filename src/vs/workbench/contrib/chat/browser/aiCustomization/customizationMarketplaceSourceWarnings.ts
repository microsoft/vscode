/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customizationMarketplaceSourceWarnings.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { equals } from '../../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICustomizationMarketplaceSourceError, ICustomizationMarketplaceSourceInfo, ICustomizationMarketplaceSourceRecoveryAction } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';

export class CustomizationMarketplaceSourceWarnings extends Disposable {
	readonly element: HTMLElement;
	private readonly rows = this._register(new DisposableStore());
	private readonly recovery = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly buttons: Button[] = [];
	private readonly actions = new Map<string, ICustomizationMarketplaceSourceRecoveryAction | undefined>();
	private readonly sourceNames = new Map<string, string>();
	private errors: readonly ICustomizationMarketplaceSourceError[] = [];
	private recoveringSourceIds: readonly string[] | undefined;
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

	get hasErrors(): boolean {
		return this.errors.length > 0;
	}

	get hasWarnings(): boolean {
		return this.errors.some(error => this.actions.get(error.sourceId)?.kind !== 'signIn');
	}

	get firstActionElement(): HTMLElement | undefined {
		return this.buttons[0]?.element;
	}

	update(errors: readonly ICustomizationMarketplaceSourceError[], loading: boolean): void {
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
				const signIn = action?.kind === 'signIn';
				const row = DOM.append(this.element, DOM.$(signIn ? '.customization-marketplace-source-signin' : '.customization-marketplace-source-warning'));
				if (!signIn) {
					const icon = DOM.append(row, DOM.$('span'));
					icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
					icon.setAttribute('aria-hidden', 'true');
				}
				DOM.append(row, DOM.$('span.customization-marketplace-source-message')).textContent = signIn ? this.getSignInMessage(errors) : this.getMessage(errors[0]);
				const retry = this.rows.add(new Button(row, { ...defaultButtonStyles, secondary: !signIn, small: !signIn }));
				retry.label = action?.label ?? localize('customizationMarketplace.retrySource', "Retry");
				retry.setAriaLabel(signIn
					? localize('customizationMarketplace.signInSourceLabel', "{0} to access {1}.", action.label, this.getSourceNames(errors))
					: action
						? localize('customizationMarketplace.recoverSourceLabel', "{0} for {1}. Reload all sources from the first page.", action.label, this.getSourceNames(errors))
						: localize('customizationMarketplace.retrySourceLabel', "Retry {0}. Reload all sources from the first page.", this.getSourceNames(errors)));
				this.rows.add(retry.onDidClick(() => this.retry(errors.map(error => error.sourceId), action)));
				this.buttons.push(retry);
			}
			if (this.hasWarnings) {
				DOM.append(this.element, DOM.$('.customization-marketplace-source-warning-help')).textContent = this.getRetryHint();
			}
			this.element.hidden = !this.hasErrors;
		}
		this.setLoading(loading);
	}

	setLoading(loading: boolean): void {
		this.loading = loading;
		const busy = loading || this.recovery.value !== undefined;
		this.element.setAttribute('aria-busy', String(busy));
		for (const button of this.buttons) {
			button.enabled = !busy;
		}
	}

	private async retry(sourceIds: readonly string[], action: ICustomizationMarketplaceSourceRecoveryAction | undefined): Promise<void> {
		if (this.loading || this.recovery.value) {
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
		const messages = this.getGroups().map(({ errors, action }) => {
			if (action?.kind === 'signIn') {
				return localize('customizationMarketplace.sourceSignIn', "{0} Choose {1} to access {2}.", this.getSignInMessage(errors), action.label, this.getSourceNames(errors));
			}
			const error = errors[0];
			return action
				? localize('customizationMarketplace.sourceRecovery', "{0} Choose {1} to restore this source.", this.getMessage(error), action.label)
				: this.getMessage(error);
		});
		if (this.hasWarnings) {
			messages.push(this.getRetryHint());
		}
		return messages.join('\n');
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

	private getRetryHint(): string {
		return localize('customizationMarketplace.retrySourcesHint', "Results may be incomplete. Retry reloads all sources from the first page.");
	}

	override dispose(): void {
		this.recovery.value?.cancel();
		super.dispose();
	}
}
