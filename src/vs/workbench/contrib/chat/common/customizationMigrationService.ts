/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ICustomizationMigrationService = createDecorator<ICustomizationMigrationService>('customizationMigrationService');

export const enum CustomizationMigrationCategoryId {
	PromptFiles = 'promptFiles',
	UserData = 'userData',
}

export type CustomizationMigrationTrigger = 'editorNewChat' | 'agentsNewSession' | 'agentsSessionOpen' | 'agentsSessionRestore';
export type CustomizationMigrationSeverity = 'informational' | 'warning';
export type CustomizationMigrationAssessmentState = 'complete' | 'disabled';

export interface ICustomizationMigrationAssessmentRequest {
	readonly workspaceRoot: URI;
	readonly sessionResource?: URI;
	readonly trigger?: CustomizationMigrationTrigger;
}

export interface ICustomizationMigrationFinding {
	readonly category: CustomizationMigrationCategoryId;
	readonly severity: CustomizationMigrationSeverity;
	readonly count: number;
	readonly sampleNames?: readonly string[];
}

export interface ICustomizationMigrationAssessment {
	readonly state: CustomizationMigrationAssessmentState;
	readonly attentionNeeded: boolean;
	readonly severity?: CustomizationMigrationSeverity;
	readonly count: number;
	readonly findings: readonly ICustomizationMigrationFinding[];
}

export interface ICustomizationMigrationService {
	readonly _serviceBrand: undefined;

	assess(request: ICustomizationMigrationAssessmentRequest, token: CancellationToken): Promise<ICustomizationMigrationAssessment>;
}
