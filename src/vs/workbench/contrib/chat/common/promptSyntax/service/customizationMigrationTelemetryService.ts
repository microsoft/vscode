/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { CustomizationMigrationType, ICustomizationMigrationHint } from './customizationMigrationService.js';

export const ICustomizationMigrationTelemetryService = createDecorator<ICustomizationMigrationTelemetryService>('customizationMigrationTelemetryService');

type CustomizationMigrationAction =
	| 'hintShown'
	| 'hintReviewClicked'
	| 'hintDismissClicked'
	| 'migrationOverviewShown'
	| 'migrationCategoryShown'
	| 'migrationOverviewClicked'
	| 'migrationCategoryClicked'
	| 'migrationClicked'
	| 'migrationCompleted'
	| 'backClicked'
	| 'destinationsClicked'
	| 'workspaceSkipped'
	| 'workspaceIncluded'
	| 'retryClicked'
	| 'viewChangesClicked'
	| 'resultDismissed'
	| 'activityDismissed';

type CustomizationMigrationEvent = {
	action: CustomizationMigrationAction;
	category?: CustomizationMigrationType;
	hintId?: string;
	count?: number;
	requestedCount?: number;
	migratedCount?: number;
	failedCount?: number;
};

type CustomizationMigrationClassification = {
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The customization migration impression or action.' };
	category?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The category of customization migration.' };
	hintId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A random identifier that correlates events for one computed migration hint.' };
	count?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations represented by a migration hint.' };
	requestedCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations selected for migration.' };
	migratedCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations successfully migrated.' };
	failedCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations that failed to migrate.' };
	owner: 'digitarald';
	comment: 'Tracks aggregate customization migration impressions, actions, and outcomes without collecting customization names, paths, or content.';
};

type CustomizationMigrationAssessmentEvent = {
	hintId: string;
	category: CustomizationMigrationType;
	count: number;
};

type CustomizationMigrationAssessmentClassification = {
	hintId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A random identifier that correlates findings with events for one computed migration hint.' };
	category: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The category of customization migration finding.' };
	count: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations in the finding.' };
	owner: 'digitarald';
	comment: 'Tracks aggregate customization migration findings without collecting customization names, paths, or content.';
};

export interface ICustomizationMigrationTelemetryService {
	readonly _serviceBrand: undefined;

	hintComputed(hint: ICustomizationMigrationHint): void;
	hintShown(hint: ICustomizationMigrationHint): void;
	hintClicked(hint: ICustomizationMigrationHint, action: 'review' | 'dismiss'): void;
	pageShown(category?: CustomizationMigrationType): void;
	actionClicked(action: 'migrationOverviewClicked' | 'migrationCategoryClicked' | 'backClicked' | 'destinationsClicked' | 'workspaceSkipped' | 'workspaceIncluded' | 'retryClicked' | 'viewChangesClicked' | 'resultDismissed' | 'activityDismissed', category?: CustomizationMigrationType): void;
	migrationClicked(category: CustomizationMigrationType, requestedCount: number): void;
	migrationCompleted(category: CustomizationMigrationType, requestedCount: number, migratedCount: number, failedCount: number): void;
}

export class CustomizationMigrationTelemetryService implements ICustomizationMigrationTelemetryService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	hintComputed(hint: ICustomizationMigrationHint): void {
		for (const { type, count } of hint.counts) {
			this.telemetryService.publicLog2<CustomizationMigrationAssessmentEvent, CustomizationMigrationAssessmentClassification>('chat.customizationMigrationAssessment', { hintId: hint.hintId, category: type, count });
		}
	}

	hintShown(hint: ICustomizationMigrationHint): void {
		this.send({ action: 'hintShown', hintId: hint.hintId, count: this.getHintCount(hint) });
	}

	hintClicked(hint: ICustomizationMigrationHint, action: 'review' | 'dismiss'): void {
		this.send({ action: action === 'review' ? 'hintReviewClicked' : 'hintDismissClicked', hintId: hint.hintId, count: this.getHintCount(hint) });
	}

	pageShown(category?: CustomizationMigrationType): void {
		this.send({ action: category ? 'migrationCategoryShown' : 'migrationOverviewShown', category });
	}

	actionClicked(action: 'migrationOverviewClicked' | 'migrationCategoryClicked' | 'backClicked' | 'destinationsClicked' | 'workspaceSkipped' | 'workspaceIncluded' | 'retryClicked' | 'viewChangesClicked' | 'resultDismissed' | 'activityDismissed', category?: CustomizationMigrationType): void {
		this.send({ action, category });
	}

	migrationClicked(category: CustomizationMigrationType, requestedCount: number): void {
		this.send({ action: 'migrationClicked', category, requestedCount });
	}

	migrationCompleted(category: CustomizationMigrationType, requestedCount: number, migratedCount: number, failedCount: number): void {
		this.send({ action: 'migrationCompleted', category, requestedCount, migratedCount, failedCount });
	}

	private send(event: CustomizationMigrationEvent): void {
		this.telemetryService.publicLog2<CustomizationMigrationEvent, CustomizationMigrationClassification>('chat.customizationMigration', event);
	}

	private getHintCount(hint: ICustomizationMigrationHint): number {
		return hint.counts.reduce((total, count) => total + count.count, 0);
	}
}
