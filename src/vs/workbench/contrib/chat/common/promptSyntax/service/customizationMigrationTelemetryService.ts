/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { CustomizationMigrationHintTarget, CustomizationMigrationType, ICustomizationMigrationCount } from './customizationMigrationService.js';

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
	target?: CustomizationMigrationHintTarget;
	requestedCount?: number;
	migratedCount?: number;
	failedCount?: number;
};

type CustomizationMigrationClassification = {
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The customization migration impression or action.' };
	category?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The category of customization migration.' };
	target?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The destination targeted by a customization migration hint.' };
	requestedCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations selected for migration.' };
	migratedCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations successfully migrated.' };
	failedCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations that failed to migrate.' };
	owner: 'digitarald';
	comment: 'Tracks aggregate customization migration impressions, actions, and outcomes without collecting customization names, paths, or content.';
};

type CustomizationMigrationAssessmentEvent = {
	category: CustomizationMigrationType;
	count: number;
};

type CustomizationMigrationAssessmentClassification = {
	category: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The category of customization migration finding.' };
	count: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations in the finding.' };
	owner: 'digitarald';
	comment: 'Tracks aggregate customization migration findings without collecting customization names, paths, or content.';
};

export interface ICustomizationMigrationTelemetryService {
	readonly _serviceBrand: undefined;

	hintComputed(counts: readonly ICustomizationMigrationCount[]): void;
	hintShown(target: CustomizationMigrationHintTarget): void;
	hintClicked(target: CustomizationMigrationHintTarget, action: 'review' | 'dismiss'): void;
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

	hintComputed(counts: readonly ICustomizationMigrationCount[]): void {
		for (const { type, count } of counts) {
			this.telemetryService.publicLog2<CustomizationMigrationAssessmentEvent, CustomizationMigrationAssessmentClassification>('chat.customizationMigrationAssessment', { category: type, count });
		}
	}

	hintShown(target: CustomizationMigrationHintTarget): void {
		this.send({ action: 'hintShown', target });
	}

	hintClicked(target: CustomizationMigrationHintTarget, action: 'review' | 'dismiss'): void {
		this.send({ action: action === 'review' ? 'hintReviewClicked' : 'hintDismissClicked', target });
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
}
