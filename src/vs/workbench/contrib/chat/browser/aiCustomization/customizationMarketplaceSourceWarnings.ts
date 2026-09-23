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
	private errors: readonly ICustomizationMarketplaceSourceError[] = [];
	private recoveringSourceId: string | undefined;
	private loading = false;

	constructor(
		parent: HTMLElement,
		private readonly sources: readonly ICustomizationMarketplaceSourceInfo[],
		private readonly onRetry: () => void,
		private readonly getRecoveryAction: (sourceId: string) => ICustomizationMarketplaceSourceRecoveryAction | undefined,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.element = DOM.append(parent, DOM.$('.customization-marketplace-source-warnings'));
		this.element.setAttribute('role', 'group');
		this.element.setAttribute('aria-label', localize('customizationMarketplace.unavailableSources', "Unavailable marketplace sources"));
		this.element.hidden = true;
	}

	get hasErrors(): boolean {
		return this.errors.length > 0;
	}

	update(errors: readonly ICustomizationMarketplaceSourceError[], loading: boolean): void {
		if (this.recoveringSourceId && !errors.some(error => error.sourceId === this.recoveringSourceId)) {
			this.recovery.value?.cancel();
		}
		if (!equals(this.errors, errors, (a, b) => a.sourceId === b.sourceId && a.message === b.message)) {
			this.errors = errors;
			this.rows.clear();
			this.buttons.length = 0;
			DOM.clearNode(this.element);
			for (const error of errors) {
				const row = DOM.append(this.element, DOM.$('.customization-marketplace-source-warning'));
				const icon = DOM.append(row, DOM.$('span'));
				icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
				icon.setAttribute('aria-hidden', 'true');
				DOM.append(row, DOM.$('span.customization-marketplace-source-warning-message')).textContent = this.getMessage(error);
				const action = this.getRecoveryAction(error.sourceId);
				const retry = this.rows.add(new Button(row, { ...defaultButtonStyles, secondary: true, small: true }));
				retry.label = action?.label ?? localize('customizationMarketplace.retrySource', "Retry");
				retry.setAriaLabel(action
					? localize('customizationMarketplace.recoverSourceLabel', "{0} for {1}. Reload all sources from the first page.", action.label, this.getSourceName(error))
					: localize('customizationMarketplace.retrySourceLabel', "Retry {0}. Reload all sources from the first page.", this.getSourceName(error)));
				this.rows.add(retry.onDidClick(() => this.retry(error.sourceId, action)));
				this.buttons.push(retry);
			}
			if (this.hasErrors) {
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

	private async retry(sourceId: string, action: ICustomizationMarketplaceSourceRecoveryAction | undefined): Promise<void> {
		if (this.loading || this.recovery.value) {
			return;
		}
		if (!action) {
			this.onRetry();
			return;
		}
		const cancellation = this.recovery.value = new CancellationTokenSource();
		this.recoveringSourceId = sourceId;
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
			this.recoveringSourceId = undefined;
			this.recovery.clear();
			if (!this._store.isDisposed) {
				this.setLoading(this.loading);
			}
		}
	}

	getAccessibilityContent(): string {
		return this.hasErrors ? [...this.errors.map(error => {
			const action = this.getRecoveryAction(error.sourceId);
			return action
				? localize('customizationMarketplace.sourceRecovery', "{0} Choose {1} to restore this source.", this.getMessage(error), action.label)
				: this.getMessage(error);
		}), this.getRetryHint()].join('\n') : '';
	}

	private getSourceName(error: ICustomizationMarketplaceSourceError): string {
		return this.sources.find(source => source.id === error.sourceId)?.displayName ?? error.sourceId;
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
