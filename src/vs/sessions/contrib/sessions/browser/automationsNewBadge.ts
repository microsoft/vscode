/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableValue } from '../../../../base/common/observable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IConfigurationService, isConfigured } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableMemento, type ObservableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from './automationsConstants.js';

export const AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY = 'sessions.automations.newBadgeSeen';
export const AUTOMATIONS_NEW_BADGE_STYLE_SETTING = 'sessions.automations.newBadgeStyle';
export const AUTOMATIONS_NEW_BADGE_STYLE_TREATMENT = 'agentSessionsAutomationsNewBadgeStyle';

export type AutomationsNewBadgeStyle = 'accent' | 'soft' | 'outline';

const DEFAULT_AUTOMATIONS_NEW_BADGE_STYLE: AutomationsNewBadgeStyle = 'outline';

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
	private observingActiveView = false;
	private initializationPromise: Promise<void> | undefined;
	private styleRequest = 0;
	readonly presentation = derived(this, reader => this.seen.read(reader) ? undefined : this.resolvedStyle.read(reader));
	readonly showNewBadge = derived(this, reader => this.presentation.read(reader) !== undefined);

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.seen = this._register(automationsNewBadgeSeenMemento(StorageScope.APPLICATION, StorageTarget.MACHINE, storageService));
	}

	initialize(): Promise<void> {
		if (!this.observingActiveView) {
			this.observingActiveView = true;
			this._register(autorun(reader => {
				if (this.customViewService.activeCustomView.read(reader)?.id === AUTOMATIONS_CUSTOM_VIEW_ID) {
					this.markSeen();
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
		this.seen.set(false, undefined);
		this.storageService.remove(AUTOMATIONS_NEW_BADGE_SEEN_STORAGE_KEY, StorageScope.APPLICATION);
		this.resolvedStyle.set(undefined, undefined);
		await this.updateStyle();
	}

	private async doInitialize(): Promise<void> {
		const hasPriorUse = this.seen.get()
			|| this.automationService.automations.get().length > 0
			|| this.automationService.runs.get().length > 0;
		if (hasPriorUse) {
			this.markSeen();
			return;
		}

		await this.updateStyle();
	}

	private async updateStyle(): Promise<void> {
		if (this.seen.get()) {
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
		if (request !== this.styleRequest || this.seen.get()) {
			return;
		}
		this.resolvedStyle.set(this.normalizeStyle(value), undefined);
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
		if (!this.seen.get()) {
			this.seen.set(true, undefined);
		}
	}
}
