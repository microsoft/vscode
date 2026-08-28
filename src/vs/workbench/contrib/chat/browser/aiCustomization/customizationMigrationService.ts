/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { basename, getComparisonKey } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatConfiguration } from '../../common/constants.js';
import { CustomizationMigrationCategoryId, CustomizationMigrationTrigger, ICustomizationMigrationAssessment, ICustomizationMigrationAssessmentRequest, ICustomizationMigrationFinding, ICustomizationMigrationService } from '../../common/customizationMigrationService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptPath, IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { isPromptFileMigrationCandidate, isUserDataMigrationCandidate } from './customizationMigration.js';

const SAMPLE_NAME_LIMIT = 3;

type CustomizationMigrationAssessmentEvent = {
	trigger: CustomizationMigrationTrigger;
	category: CustomizationMigrationCategoryId;
	severity: string;
	count: number;
};

type CustomizationMigrationAssessmentClassification = {
	trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat surface that triggered the customization migration assessment.' };
	category: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The category of customization migration finding.' };
	severity: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The impact severity of the customization migration finding.' };
	count: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of customizations in the finding.' };
	owner: 'digitarald';
	comment: 'Tracks aggregate customization migration findings without collecting customization names, paths, or content.';
};

interface IAssessmentEntry {
	readonly generation: number;
	readonly cancellation: CancellationTokenSource;
	readonly promise: Promise<ICustomizationMigrationAssessment>;
}

export class CustomizationMigrationService extends Disposable implements ICustomizationMigrationService {
	declare readonly _serviceBrand: undefined;

	private generation = 0;
	private readonly cache = new Map<string, ICustomizationMigrationAssessment>();
	private readonly pending = new Map<string, IAssessmentEntry>();
	private readonly reported = new Set<string>();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this._register(Event.any(
			this.promptsService.onDidChangeCustomAgents,
			this.promptsService.onDidChangeSlashCommands,
			this.promptsService.onDidChangeSkills,
			this.promptsService.onDidChangeHooks,
			this.promptsService.onDidChangeInstructions,
			this.promptsService.onDidChangeAgentInstructions,
		)(() => this.invalidate()));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.ChatCustomizationsMigrationAssessmentEnabled)) {
				this.invalidate();
			}
		}));
	}

	async assess(request: ICustomizationMigrationAssessmentRequest, token: CancellationToken): Promise<ICustomizationMigrationAssessment> {
		if (this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsMigrationAssessmentEnabled) === false) {
			return {
				state: 'disabled',
				attentionNeeded: false,
				count: 0,
				findings: [],
			};
		}

		const key = getComparisonKey(request.workspaceRoot);
		let assessment = this.cache.get(key);
		if (!assessment) {
			let entry = this.pending.get(key);
			if (!entry) {
				const generation = this.generation;
				const cancellation = new CancellationTokenSource();
				const promise = this.computeAssessment(request.workspaceRoot, cancellation.token).then(result => {
					if (generation !== this.generation || cancellation.token.isCancellationRequested) {
						throw new CancellationError();
					}
					this.cache.set(key, result);
					return result;
				}).finally(() => {
					const current = this.pending.get(key);
					if (current?.generation === generation) {
						this.pending.delete(key);
						cancellation.dispose();
					}
				});
				entry = { generation, cancellation, promise };
				this.pending.set(key, entry);
			}
			assessment = await raceCancellationError(entry.promise, token);
		}

		if (request.trigger) {
			this.report(key, request.trigger, assessment);
		}
		return assessment;
	}

	private async computeAssessment(workspaceRoot: URI, token: CancellationToken): Promise<ICustomizationMigrationAssessment> {
		const [workspacePrompts, userPrompts, userAgents, userInstructions] = await Promise.all([
			this.promptsService.listPromptFilesForStorage(PromptsType.prompt, PromptsStorage.local, token, workspaceRoot),
			this.promptsService.listPromptFilesForStorage(PromptsType.prompt, PromptsStorage.user, token),
			this.promptsService.listPromptFilesForStorage(PromptsType.agent, PromptsStorage.user, token),
			this.promptsService.listPromptFilesForStorage(PromptsType.instructions, PromptsStorage.user, token),
		]);

		const findings: ICustomizationMigrationFinding[] = [];
		const promptFiles = [...workspacePrompts, ...userPrompts].filter(isPromptFileMigrationCandidate);
		if (promptFiles.length > 0) {
			findings.push(this.createFinding(CustomizationMigrationCategoryId.PromptFiles, promptFiles));
		}

		const userData = [...userAgents, ...userInstructions].filter(isUserDataMigrationCandidate);
		if (userData.length > 0) {
			findings.push(this.createFinding(CustomizationMigrationCategoryId.UserData, userData));
		}

		const count = findings.reduce((total, finding) => total + finding.count, 0);
		return {
			state: 'complete',
			attentionNeeded: count > 0,
			severity: count > 0 ? 'warning' : undefined,
			count,
			findings,
		};
	}

	private createFinding(category: CustomizationMigrationCategoryId, customizations: readonly IPromptPath[]): ICustomizationMigrationFinding {
		return {
			category,
			severity: 'warning',
			count: customizations.length,
			sampleNames: customizations.slice(0, SAMPLE_NAME_LIMIT).map(customization => customization.name ?? basename(customization.uri)),
		};
	}

	private report(key: string, trigger: CustomizationMigrationTrigger, assessment: ICustomizationMigrationAssessment): void {
		if (assessment.state !== 'complete') {
			return;
		}
		const reportKey = `${this.generation}:${key}:${trigger}`;
		if (this.reported.has(reportKey)) {
			return;
		}
		this.reported.add(reportKey);
		for (const finding of assessment.findings) {
			this.telemetryService.publicLog2<CustomizationMigrationAssessmentEvent, CustomizationMigrationAssessmentClassification>('chatCustomizationMigration.assessment', {
				trigger,
				category: finding.category,
				severity: finding.severity,
				count: finding.count,
			});
		}
	}

	private invalidate(): void {
		this.generation++;
		this.cache.clear();
		this.reported.clear();
		for (const entry of this.pending.values()) {
			entry.cancellation.cancel();
			entry.cancellation.dispose();
		}
		this.pending.clear();
	}

	override dispose(): void {
		this.invalidate();
		super.dispose();
	}
}

registerSingleton(ICustomizationMigrationService, CustomizationMigrationService, InstantiationType.Delayed);
