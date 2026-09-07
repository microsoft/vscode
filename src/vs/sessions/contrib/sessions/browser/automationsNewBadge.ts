/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableValue } from '../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IConfigurationService, isConfigured } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableMemento, type ObservableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { ISessionsWindowUsageService } from '../../../services/sessions/browser/sessionsWindowUsageService.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from './automationsConstants.js';

export const AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY = 'sessions.automations.newBadgeSeen';
export const AUTOMATIONS_NEW_BADGE_STYLE_SETTING = 'sessions.automations.newBadgeStyle';
export const AUTOMATIONS_NEW_BADGE_STYLE_TREATMENT = 'agentSessionsAutomationsNewBadgeStyle';

export type AutomationsNewBadgeStyle = 'accent' | 'soft' | 'outline';

const DEFAULT_AUTOMATIONS_NEW_BADGE_STYLE: AutomationsNewBadgeStyle = 'outline';

type AutomationsNewBadgeStartupDecision = 'pending' | 'eligible' | 'suppressed';

const automationsNewBadgeSeenMemento = observableMemento<boolean>({
	key: AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY,
	defaultValue: false,
	toStorage: value => String(value),
	fromStorage: value => value === 'true',
});

/** Owns the first-use state for the Automations shortcut badge. */
export class AutomationsNewBadgeState extends Disposable {

	private readonly seen: ObservableMemento<boolean>;
	private readonly resolvedStyle = observableValue<AutomationsNewBadgeStyle | undefined>(this, undefined);
	private readonly forcePreview = observableValue(this, false);
	private readonly startupDecision = observableValue<AutomationsNewBadgeStartupDecision>(this, 'pending');
	private readonly automationEvidenceObserver = this._register(new MutableDisposable());
	private observersRegistered = false;
	private initializationPromise: Promise<void> | undefined;
	private styleRequest = 0;
	readonly presentation = derived(this, reader => {
		if (this.seen.read(reader)) {
			return undefined;
		}
		if (this.forcePreview.read(reader)) {
			return this.resolvedStyle.read(reader);
		}
		return this.startupDecision.read(reader) === 'eligible' ? this.resolvedStyle.read(reader) : undefined;
	});
	readonly showNewBadge = derived(this, reader => this.presentation.read(reader) !== undefined);

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@ISessionsWindowUsageService private readonly sessionsWindowUsageService: ISessionsWindowUsageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();
		this.seen = this._register(automationsNewBadgeSeenMemento(StorageScope.APPLICATION, StorageTarget.MACHINE, storageService));
	}

	initialize(): Promise<void> {
		if (!this.observersRegistered) {
			this.observersRegistered = true;
			if (!this.seen.get()) {
				const evidenceObserver = autorun(reader => {
					if (this.forcePreview.read(reader)) {
						return;
					}
					if (this.automationService.automations.read(reader).length > 0 || this.automationService.runs.read(reader).length > 0) {
						this.markSeen();
					}
				});
				this.automationEvidenceObserver.value = evidenceObserver;
				if (this.seen.get()) {
					this.automationEvidenceObserver.clear();
				}
			}
			this._register(autorun(reader => {
				if (this.customViewService.activeCustomView.read(reader)?.id === AUTOMATIONS_CUSTOM_VIEW_ID) {
					this.markSeen();
				}
			}));
			this._register(autorun(reader => {
				if (this.forcePreview.read(reader) || this.seen.read(reader) || this.startupDecision.read(reader) !== 'eligible') {
					return;
				}
				if (this.automationService.catalogueState.read(reader) !== 'ready') {
					this.startupDecision.set('suppressed', undefined);
				}
			}));
		}
		if (!this.initializationPromise) {
			this.initializationPromise = this.doInitialize();
			this._register(this.configurationService.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration(AUTOMATIONS_NEW_BADGE_STYLE_SETTING)) {
					void this.updateStyle().catch(onUnexpectedError);
				}
			}));
			this._register(this.assignmentService.onDidRefetchAssignments(() => {
				void this.updateStyle().catch(onUnexpectedError);
			}));
		}
		return this.initializationPromise;
	}

	async reset(): Promise<void> {
		this.forcePreview.set(true, undefined);
		this.seen.set(false, undefined);
		this.storageService.remove(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION);
		this.resolvedStyle.set(undefined, undefined);
		await this.updateStyle();
	}

	private async doInitialize(): Promise<void> {
		if (this._store.isDisposed || this.seen.get() || this.forcePreview.get()) {
			return;
		}

		if (!this.sessionsWindowUsageService.hadPriorWindowOpen) {
			this.startupDecision.set('suppressed', undefined);
			return;
		}

		await this.lifecycleService.when(LifecyclePhase.Eventually);
		if (this._store.isDisposed || this.seen.get() || this.forcePreview.get()) {
			return;
		}

		if (this.automationService.catalogueState.get() !== 'ready') {
			this.startupDecision.set('suppressed', undefined);
			return;
		}
		if (this.automationService.automations.get().length > 0 || this.automationService.runs.get().length > 0) {
			this.markSeen();
			return;
		}

		this.startupDecision.set('eligible', undefined);
		await this.updateStyle();
	}

	private async updateStyle(): Promise<void> {
		if (!this.canResolveStyle()) {
			return;
		}

		const request = ++this.styleRequest;
		const inspection = this.configurationService.inspect<string>(AUTOMATIONS_NEW_BADGE_STYLE_SETTING);
		let value: string | undefined;
		if (isConfigured(inspection)) {
			value = inspection.value;
		} else {
			try {
				value = await this.assignmentService.getTreatment<string>(AUTOMATIONS_NEW_BADGE_STYLE_TREATMENT);
			} catch (error) {
				this.logService.warn(`[AutomationsNewBadgeState] Failed to resolve badge style treatment; using '${DEFAULT_AUTOMATIONS_NEW_BADGE_STYLE}'.`, error);
			}
		}
		if (request !== this.styleRequest || !this.canResolveStyle()) {
			return;
		}
		this.resolvedStyle.set(this.normalizeStyle(value), undefined);
	}

	private canResolveStyle(): boolean {
		return !this._store.isDisposed && !this.seen.get() && (this.forcePreview.get() || this.startupDecision.get() === 'eligible');
	}

	private normalizeStyle(value: string | undefined): AutomationsNewBadgeStyle {
		if (value === undefined || value === DEFAULT_AUTOMATIONS_NEW_BADGE_STYLE) {
			return DEFAULT_AUTOMATIONS_NEW_BADGE_STYLE;
		}
		if (value === 'accent' || value === 'soft') {
			return value;
		}
		this.logService.warn(`[AutomationsNewBadgeState] Unsupported badge style treatment '${value}'; using '${DEFAULT_AUTOMATIONS_NEW_BADGE_STYLE}'.`);
		return DEFAULT_AUTOMATIONS_NEW_BADGE_STYLE;
	}

	private markSeen(): void {
		this.forcePreview.set(false, undefined);
		if (!this.seen.get()) {
			this.seen.set(true, undefined);
		}
		this.automationEvidenceObserver.clear();
	}
}
