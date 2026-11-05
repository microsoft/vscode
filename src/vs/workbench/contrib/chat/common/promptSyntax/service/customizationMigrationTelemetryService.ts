/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IChatService } from '../../chatService/chatService.js';
import { CustomizationMigrationFailureReason, CustomizationMigrationType, ICustomizationMigrationHint } from './customizationMigrationService.js';

export const ICustomizationMigrationTelemetryService = createDecorator<ICustomizationMigrationTelemetryService>('customizationMigrationTelemetryService');

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
	| 'retryClicked';

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
	actionClicked(action: 'migrationOverviewClicked' | 'migrationCategoryClicked' | 'agentMigrationClicked' | 'backClicked' | 'destinationsClicked' | 'workspaceSkipped' | 'workspaceIncluded' | 'retryClicked', category?: CustomizationMigrationType): void;
	migrationClicked(category: CustomizationMigrationType, requestedCount: number, migrationFlowId?: string): void;
	migrationCompleted(category: CustomizationMigrationType, requestedCount: number, migratedCount: number, failedCount: number, failureReasons: readonly CustomizationMigrationFailureReason[], migrationFlowId?: string, cancelled?: boolean): void;
	prepareAgentMigrationResult(migrationFlowId: string, inventoryCounts: ReadonlyMap<CustomizationMigrationType, number>, lifecycle: ICustomizationMigrationSessionLifecycle): IDisposable;
	bindAgentMigrationSession(migrationFlowId: string, sessionResource: URI): void;
	reportAgentMigrationResult(result: unknown): Promise<void>;
}

export interface ICustomizationMigrationSessionLifecycle {
	readonly onDidFinish?: (status: 'completed' | 'cancelled' | 'unknown') => Promise<void>;
}

interface ICustomizationMigrationAgentResult {
	readonly version: 1;
	readonly migrationFlowId: string;
	readonly cancelled: boolean;
	readonly results: readonly ICustomizationMigrationAgentResultEntry[];
}

interface ICustomizationMigrationAgentResultEntry {
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

interface IPendingCustomizationMigrationResult {
	readonly inventoryCounts: ReadonlyMap<CustomizationMigrationType, number>;
	readonly lifecycle: ICustomizationMigrationSessionLifecycle;
	readonly disposables: DisposableStore;
	terminalStatus?: 'completed' | 'cancelled';
	finishIfStopped?: () => void;
}

export class CustomizationMigrationTelemetryService extends Disposable implements ICustomizationMigrationTelemetryService {
	declare readonly _serviceBrand: undefined;

	private readonly agentMigrationResults = new Map<string, IPendingCustomizationMigrationResult>();

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();
		this._register(toDisposable(() => {
			for (const result of this.agentMigrationResults.values()) {
				result.disposables.dispose();
			}
			this.agentMigrationResults.clear();
		}));
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

	actionClicked(action: 'migrationOverviewClicked' | 'migrationCategoryClicked' | 'agentMigrationClicked' | 'backClicked' | 'destinationsClicked' | 'workspaceSkipped' | 'workspaceIncluded' | 'retryClicked', category?: CustomizationMigrationType): void {
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

	prepareAgentMigrationResult(migrationFlowId: string, inventoryCounts: ReadonlyMap<CustomizationMigrationType, number>, lifecycle: ICustomizationMigrationSessionLifecycle): IDisposable {
		this.deleteAgentMigrationResult(migrationFlowId);
		const disposables = new DisposableStore();
		const pending = { inventoryCounts, lifecycle, disposables };
		this.agentMigrationResults.set(migrationFlowId, pending);
		return toDisposable(() => {
			if (this.agentMigrationResults.get(migrationFlowId) === pending) {
				this.deleteAgentMigrationResult(migrationFlowId);
			}
		});
	}

	bindAgentMigrationSession(migrationFlowId: string, sessionResource: URI): void {
		const pending = this.agentMigrationResults.get(migrationFlowId);
		if (!pending) {
			return;
		}
		const finishIncompleteMigration = (cancelled: boolean): void => {
			if (this.agentMigrationResults.get(migrationFlowId) !== pending || pending.terminalStatus !== undefined) {
				return;
			}
			this.deleteAgentMigrationResult(migrationFlowId);
			pending.lifecycle.onDidFinish?.(cancelled ? 'cancelled' : 'unknown').catch(error => {
				this.logService.error('Could not update the agent customization migration recovery status.', error);
			});
			this.logService.warn(`Agent customization migration ${migrationFlowId} finished without reporting aggregate outcomes.`);
		};
		const model = this.chatService.getSession(sessionResource);
		if (model) {
			const finishWhenStopped = () => {
				const response = model.lastRequest?.response;
				if (response?.isCanceled || response?.result?.errorDetails?.code === 'canceled') {
					finishIncompleteMigration(true);
				} else if (!model.hasActiveRequest.get() && (!model.lastRequest || response?.isComplete)) {
					finishIncompleteMigration(false);
				}
			};
			pending.disposables.add(model.onDidChange(finishWhenStopped));
			pending.finishIfStopped = finishWhenStopped;
			finishWhenStopped();
		} else {
			finishIncompleteMigration(false);
		}
		pending.disposables.add(this.chatService.onDidDisposeSession(event => {
			if (event.reason === 'cleared' && event.sessionResources.some(resource => isEqual(resource, sessionResource))) {
				finishIncompleteMigration(true);
			}
		}));
	}

	async reportAgentMigrationResult(result: unknown): Promise<void> {
		const migrationFlowId = getCustomizationMigrationAgentResultFlowId(result);
		const pending = this.agentMigrationResults.get(migrationFlowId);
		if (!pending) {
			throw new Error('No pending customization migration matches this result.');
		}
		const report = parseCustomizationMigrationAgentResult(result, migrationFlowId, pending.inventoryCounts);
		if (pending.terminalStatus !== undefined) {
			throw new Error('No pending customization migration matches this result.');
		}
		pending.terminalStatus = report.cancelled ? 'cancelled' : 'completed';
		try {
			await pending.lifecycle.onDidFinish?.(pending.terminalStatus);
		} catch (error) {
			pending.terminalStatus = undefined;
			pending.finishIfStopped?.();
			throw error;
		}
		this.deleteAgentMigrationResult(migrationFlowId, pending);
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
	}

	private deleteAgentMigrationResult(migrationFlowId: string, expected?: IPendingCustomizationMigrationResult): boolean {
		const pending = this.agentMigrationResults.get(migrationFlowId);
		if (pending && (!expected || pending === expected)) {
			this.agentMigrationResults.delete(migrationFlowId);
			pending.disposables.dispose();
			return true;
		}
		return false;
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
	content: string | unknown,
	migrationFlowId: string,
	inventoryCounts: ReadonlyMap<CustomizationMigrationType, number>,
): ICustomizationMigrationAgentReport {
	const result: unknown = typeof content === 'string' ? JSON.parse(content) : content;
	if (!isCustomizationMigrationAgentResult(result) || result.migrationFlowId !== migrationFlowId) {
		throw new Error('Invalid customization migration result.');
	}

	const reportedCounts = new Map<CustomizationMigrationType, number>();
	const outcomesByCategory = new Map<CustomizationMigrationType, ICustomizationMigrationAgentOutcome>();
	for (const entry of result.results) {
		const reportedCount = (reportedCounts.get(entry.category) ?? 0) + entry.count;
		if (reportedCount > (inventoryCounts.get(entry.category) ?? 0)) {
			throw new Error('Customization migration result exceeds the supplied inventory.');
		}
		reportedCounts.set(entry.category, reportedCount);

		const previous = outcomesByCategory.get(entry.category) ?? {
			category: entry.category,
			requestedCount: 0,
			migratedCount: 0,
			failedCount: 0,
		};
		outcomesByCategory.set(entry.category, {
			category: entry.category,
			requestedCount: previous.requestedCount + (entry.outcome === 'skipped' ? 0 : entry.count),
			migratedCount: previous.migratedCount + (entry.outcome === 'migrated' ? entry.count : 0),
			failedCount: previous.failedCount + (entry.outcome === 'failed' ? entry.count : 0),
		});
	}
	for (const [category, count] of inventoryCounts) {
		if ((reportedCounts.get(category) ?? 0) !== count) {
			throw new Error('Customization migration result does not account for the supplied inventory.');
		}
	}

	return {
		cancelled: result.cancelled,
		outcomes: [...outcomesByCategory.values()],
	};
}

function getCustomizationMigrationAgentResultFlowId(result: unknown): string {
	if (!result || typeof result !== 'object' || typeof (result as Partial<ICustomizationMigrationAgentResult>).migrationFlowId !== 'string') {
		throw new Error('Customization migration result is missing its migration flow identifier.');
	}
	return (result as ICustomizationMigrationAgentResult).migrationFlowId;
}

function isCustomizationMigrationAgentResult(result: unknown): result is ICustomizationMigrationAgentResult {
	if (!result || typeof result !== 'object') {
		return false;
	}
	const candidate = result as Partial<ICustomizationMigrationAgentResult>;
	return candidate.version === 1
		&& typeof candidate.migrationFlowId === 'string'
		&& typeof candidate.cancelled === 'boolean'
		&& Array.isArray(candidate.results)
		&& candidate.results.length > 0
		&& candidate.results.every(isValidCustomizationMigrationAgentResult);
}

function isValidCustomizationMigrationAgentResult(result: unknown): result is ICustomizationMigrationAgentResultEntry {
	if (!result || typeof result !== 'object') {
		return false;
	}
	const candidate = result as Partial<ICustomizationMigrationAgentResultEntry>;
	return Object.values(CustomizationMigrationType).includes(candidate.category as CustomizationMigrationType)
		&& (candidate.scope === 'user' || candidate.scope === 'workspace')
		&& (candidate.customizationType === 'agent' || candidate.customizationType === 'instructions' || candidate.customizationType === 'skill' || candidate.customizationType === 'mcpServer')
		&& (candidate.outcome === 'migrated' || candidate.outcome === 'skipped' || candidate.outcome === 'failed')
		&& Number.isSafeInteger(candidate.count)
		&& candidate.count !== undefined
		&& candidate.count > 0;
}
