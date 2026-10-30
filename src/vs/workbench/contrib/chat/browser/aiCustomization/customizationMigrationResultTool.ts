/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ICustomizationMigrationTelemetryService } from '../../common/promptSyntax/service/customizationMigrationTelemetryService.js';
import { ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolInvocationPresentation } from '../../common/tools/languageModelToolsService.js';
import { IAgentHostActiveClientService } from '../agentSessions/agentHost/agentHostActiveClientService.js';

export const CustomizationMigrationResultToolId = 'vscode_reportCustomizationMigration';

const inputSchema: IJSONSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		version: {
			type: 'number',
			enum: [1],
			description: 'The customization migration result schema version.',
		},
		migrationFlowId: {
			type: 'string',
			description: 'The migration flow identifier supplied by VS Code.',
		},
		cancelled: {
			type: 'boolean',
			description: 'Whether the user cancelled the migration.',
		},
		results: {
			type: 'array',
			minItems: 1,
			description: 'Aggregate outcomes grouped by category, scope, customization type, and outcome.',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					category: {
						type: 'string',
						enum: ['userData', 'promptFiles', 'configuredLocations', 'mcpServers'],
					},
					scope: {
						type: 'string',
						enum: ['user', 'workspace'],
					},
					customizationType: {
						type: 'string',
						enum: ['agent', 'instructions', 'skill', 'mcpServer'],
					},
					outcome: {
						type: 'string',
						enum: ['migrated', 'skipped', 'failed'],
					},
					count: {
						type: 'integer',
						minimum: 1,
					},
				},
				required: ['category', 'scope', 'customizationType', 'outcome', 'count'],
			},
		},
	},
	required: ['version', 'migrationFlowId', 'cancelled', 'results'],
};

export const CustomizationMigrationResultToolData: IToolData = {
	id: CustomizationMigrationResultToolId,
	toolReferenceName: 'report_customization_migration',
	displayName: localize('customizationMigrationResultTool.displayName', "Report Customization Migration"),
	modelDescription: 'Report the final aggregate outcome of the active VS Code customization migration. Use this tool exactly once after all selected migration work and source-cleanup decisions are finished, immediately before the final user-facing summary. Report only aggregate counts from the supplied inventory; never include customization names, paths, contents, configuration, or other user data.',
	source: ToolDataSource.Internal,
	when: ContextKeyExpr.false(),
	canBeReferencedInPrompt: false,
	inputSchema,
};

export class CustomizationMigrationResultTool implements IToolImpl {

	constructor(
		@ICustomizationMigrationTelemetryService private readonly telemetryService: ICustomizationMigrationTelemetryService,
		@IAgentHostActiveClientService private readonly activeClientService: IAgentHostActiveClientService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		return {
			pastTenseMessage: new MarkdownString(localize('customizationMigrationResultTool.complete', "Reported customization migration outcome")),
			presentation: ToolInvocationPresentation.Hidden,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: never, _progress: never, _token: CancellationToken): Promise<IToolResult> {
		await this.telemetryService.reportAgentMigrationResult(invocation.parameters);
		const sessionResource = invocation.context?.sessionResource;
		if (sessionResource) {
			this.activeClientService.clearSessionTools(sessionResource);
		}
		return {
			content: [{ kind: 'text', value: localize('customizationMigrationResultTool.success', "Customization migration outcome reported.") }],
		};
	}
}

export class CustomizationMigrationResultToolContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.customizationMigrationResultTool';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(toolsService.registerTool(
			CustomizationMigrationResultToolData,
			instantiationService.createInstance(CustomizationMigrationResultTool),
		));
	}
}
