/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, RunOnceScheduler } from '../../../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { dirname } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { CustomizationMigrationFailureReason, CustomizationMigrationType, ICustomizationMigrationHint } from './customizationMigrationService.js';

export const ICustomizationMigrationTelemetryService = createDecorator<ICustomizationMigrationTelemetryService>('customizationMigrationTelemetryService');

const AGENT_MIGRATION_RESULT_WATCH_TIMEOUT = 5 * 60 * 1000;

type CustomizationMigrationAction =
	| 'hintShown'
	| 'hintReviewClicked'
	| 'hintDismissClicked'
	| 'migrationOverviewShown'
	| 'migrationCategoryShown'
	| 'migrationOverviewClicked'
	| 'migrationCategoryClicked'
	| 'agentMigrationClicked'
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
	migrationFlowId?: string;
	count?: number;
	requestedCount?: number;
	migratedCount?: number;
	failedCount?: number;
	cancelled?: boolean;
	migrationFailedReasons?: string;
};

type CustomizationMigrationClassification = {
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The customization migration impression or action.' };
	category?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The category of customization migration.' };
	migrationFlowId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A random identifier that correlates events for one customization migration flow.' };
	count?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of customizations represented by the hint.' };
	requestedCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations selected for migration.' };
	migratedCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations successfully migrated.' };
	failedCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations that failed to migrate.' };
	cancelled?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the customization migration flow was cancelled before completion.' };
	migrationFailedReasons?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A semicolon-separated list of bounded failure reason identifiers. Does not contain customization names, paths, content, or error messages.' };
	owner: 'digitarald';
	comment: 'Tracks aggregate customization migration impressions, actions, and outcomes without collecting customization names, paths, or content.';
};

type CustomizationMigrationAssessmentEvent = {
	migrationFlowId: string;
	category: CustomizationMigrationType;
	count: number;
};

type CustomizationMigrationAssessmentClassification = {
	migrationFlowId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A random identifier that correlates this finding with its customization migration flow.' };
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
	actionClicked(action: 'migrationOverviewClicked' | 'migrationCategoryClicked' | 'agentMigrationClicked' | 'backClicked' | 'destinationsClicked' | 'workspaceSkipped' | 'workspaceIncluded' | 'retryClicked' | 'viewChangesClicked' | 'resultDismissed' | 'activityDismissed', category?: CustomizationMigrationType): void;
	migrationClicked(category: CustomizationMigrationType, requestedCount: number, migrationFlowId?: string): void;
	migrationCompleted(category: CustomizationMigrationType, requestedCount: number, migratedCount: number, failedCount: number, failureReasons: readonly CustomizationMigrationFailureReason[], migrationFlowId?: string, cancelled?: boolean): void;
	watchAgentMigrationResult(resultResource: URI, migrationFlowId: string, inventoryCounts: ReadonlyMap<CustomizationMigrationType, number>): void;
}

interface ICustomizationMigrationAgentResultFile {
	readonly version: 1;
	readonly migrationFlowId: string;
	readonly cancelled: boolean;
	readonly results: readonly ICustomizationMigrationAgentResult[];
}

interface ICustomizationMigrationAgentResult {
	readonly category: CustomizationMigrationType;
	readonly scope: 'user' | 'workspace';
	readonly customizationType: 'agent' | 'instructions' | 'skill' | 'mcpServer';
	readonly outcome: 'migrated' | 'skipped' | 'failed';
	readonly count: number;
}

export interface ICustomizationMigrationAgentOutcome {
	readonly category: CustomizationMigrationType;
	readonly requestedCount: number;
	readonly migratedCount: number;
	readonly failedCount: number;
}

export interface ICustomizationMigrationAgentReport {
	readonly cancelled: boolean;
	readonly outcomes: readonly ICustomizationMigrationAgentOutcome[];
}

export class CustomizationMigrationTelemetryService extends Disposable implements ICustomizationMigrationTelemetryService {
	declare readonly _serviceBrand: undefined;

	private readonly agentMigrationResultWatches = this._register(new DisposableMap<string>());

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	hintComputed(hint: ICustomizationMigrationHint): void {
		for (const { type, count } of hint.counts) {
			this.telemetryService.publicLog2<CustomizationMigrationAssessmentEvent, CustomizationMigrationAssessmentClassification>('chat.customizationMigrationAssessment', { migrationFlowId: hint.migrationFlowId, category: type, count });
		}
	}

	hintShown(hint: ICustomizationMigrationHint): void {
		this.sendHintAction('hintShown', hint);
	}

	hintClicked(hint: ICustomizationMigrationHint, action: 'review' | 'dismiss'): void {
		this.sendHintAction(action === 'review' ? 'hintReviewClicked' : 'hintDismissClicked', hint);
	}

	pageShown(category?: CustomizationMigrationType): void {
		this.send({ action: category ? 'migrationCategoryShown' : 'migrationOverviewShown', category });
	}

	actionClicked(action: 'migrationOverviewClicked' | 'migrationCategoryClicked' | 'agentMigrationClicked' | 'backClicked' | 'destinationsClicked' | 'workspaceSkipped' | 'workspaceIncluded' | 'retryClicked' | 'viewChangesClicked' | 'resultDismissed' | 'activityDismissed', category?: CustomizationMigrationType): void {
		this.send({ action, category });
	}

	migrationClicked(category: CustomizationMigrationType, requestedCount: number, migrationFlowId?: string): void {
		this.send({
			action: 'migrationClicked',
			category,
			requestedCount,
			...(migrationFlowId ? { migrationFlowId } : {}),
		});
	}

	migrationCompleted(category: CustomizationMigrationType, requestedCount: number, migratedCount: number, failedCount: number, failureReasons: readonly CustomizationMigrationFailureReason[], migrationFlowId?: string, cancelled?: boolean): void {
		const migrationFailedReasons = Array.from(new Set(failureReasons)).sort().join(';');
		this.send({
			action: 'migrationCompleted',
			category,
			requestedCount,
			migratedCount,
			failedCount,
			...(migrationFlowId ? { migrationFlowId } : {}),
			...(cancelled ? { cancelled: true } : {}),
			...(migrationFailedReasons ? { migrationFailedReasons } : {}),
		});
	}

	watchAgentMigrationResult(resultResource: URI, migrationFlowId: string, inventoryCounts: ReadonlyMap<CustomizationMigrationType, number>): void {
		const disposables = new DisposableStore();
		let active = true;
		disposables.add(toDisposable(() => active = false));
		const reportResult = disposables.add(new RunOnceScheduler(async () => {
			try {
				const content = await this.fileService.readFile(resultResource, { limits: { size: 64 * 1024 } });
				if (!active) {
					return;
				}
				const report = parseCustomizationMigrationAgentResult(content.value.toString(), migrationFlowId, inventoryCounts);
				this.agentMigrationResultWatches.deleteAndDispose(migrationFlowId);
				for (const outcome of report.outcomes) {
					if (outcome.requestedCount > 0 || report.cancelled) {
						this.migrationCompleted(
							outcome.category,
							outcome.requestedCount,
							outcome.migratedCount,
							outcome.failedCount,
							[],
							migrationFlowId,
							report.cancelled,
						);
					}
				}
			} catch (error) {
				this.logService.warn('Could not read the agent customization migration result.', error);
			}
		}, 500));
		disposables.add(this.fileService.watch(dirname(resultResource)));
		disposables.add(this.fileService.onDidFilesChange(event => {
			if (event.affects(resultResource)) {
				reportResult.schedule();
			}
		}));
		disposables.add(disposableTimeout(() => {
			this.agentMigrationResultWatches.deleteAndDispose(migrationFlowId);
		}, AGENT_MIGRATION_RESULT_WATCH_TIMEOUT));
		this.agentMigrationResultWatches.set(migrationFlowId, disposables);
	}

	private send(event: CustomizationMigrationEvent): void {
		this.telemetryService.publicLog2<CustomizationMigrationEvent, CustomizationMigrationClassification>('chat.customizationMigration', event);
	}

	private sendHintAction(action: 'hintShown' | 'hintReviewClicked' | 'hintDismissClicked', hint: ICustomizationMigrationHint): void {
		this.send({
			action,
			migrationFlowId: hint.migrationFlowId,
			count: hint.counts.reduce((total, { count }) => total + count, 0),
		});
	}

}

export function parseCustomizationMigrationAgentResult(
	content: string,
	migrationFlowId: string,
	inventoryCounts: ReadonlyMap<CustomizationMigrationType, number>,
): ICustomizationMigrationAgentReport {
	const resultFile = JSON.parse(content) as ICustomizationMigrationAgentResultFile;
	if (resultFile.version !== 1 || resultFile.migrationFlowId !== migrationFlowId || typeof resultFile.cancelled !== 'boolean' || !Array.isArray(resultFile.results) || resultFile.results.length === 0 || !resultFile.results.every(isValidCustomizationMigrationAgentResult)) {
		throw new Error('Invalid customization migration result file.');
	}

	const reportedCounts = new Map<CustomizationMigrationType, number>();
	const outcomesByCategory = new Map<CustomizationMigrationType, ICustomizationMigrationAgentOutcome>();
	for (const result of resultFile.results) {
		const reportedCount = (reportedCounts.get(result.category) ?? 0) + result.count;
		if (reportedCount > (inventoryCounts.get(result.category) ?? 0)) {
			throw new Error('Customization migration result exceeds the supplied inventory.');
		}
		reportedCounts.set(result.category, reportedCount);

		const previous = outcomesByCategory.get(result.category) ?? {
			category: result.category,
			requestedCount: 0,
			migratedCount: 0,
			failedCount: 0,
		};
		outcomesByCategory.set(result.category, {
			category: result.category,
			requestedCount: previous.requestedCount + (result.outcome === 'skipped' ? 0 : result.count),
			migratedCount: previous.migratedCount + (result.outcome === 'migrated' ? result.count : 0),
			failedCount: previous.failedCount + (result.outcome === 'failed' ? result.count : 0),
		});
	}

	return {
		cancelled: resultFile.cancelled,
		outcomes: [...outcomesByCategory.values()],
	};
}

function isValidCustomizationMigrationAgentResult(result: ICustomizationMigrationAgentResult): boolean {
	return Object.values(CustomizationMigrationType).includes(result.category)
		&& (result.scope === 'user' || result.scope === 'workspace')
		&& (result.customizationType === 'agent' || result.customizationType === 'instructions' || result.customizationType === 'skill' || result.customizationType === 'mcpServer')
		&& (result.outcome === 'migrated' || result.outcome === 'skipped' || result.outcome === 'failed')
		&& Number.isSafeInteger(result.count)
		&& result.count > 0;
}
