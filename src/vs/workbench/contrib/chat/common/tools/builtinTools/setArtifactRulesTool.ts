/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../../../base/common/jsonSchema.js';
import { localize } from '../../../../../../nls.js';
import {
	IToolData,
	IToolImpl,
	IToolInvocation,
	IToolResult,
	ToolDataSource,
	IToolInvocationPreparationContext,
	IPreparedToolInvocation,
	ToolInvocationPresentation
} from '../languageModelToolsService.js';
import { IArtifactGroupConfig, IArtifactRuleOverrides, IChatArtifactsService } from '../chatArtifactsService.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';

export const SetArtifactRulesToolId = 'setArtifactRules';

const artifactGroupConfigSchema: IJSONSchema = {
	type: 'object',
	properties: {
		groupName: {
			type: 'string',
			description: 'Display name for the artifact group.'
		},
		onlyShowGroup: {
			type: 'boolean',
			description: 'When true, show only the group header instead of individual items.'
		}
	},
	required: ['groupName']
};

const inputSchema: IJSONSchema & { properties: IJSONSchemaMap } = {
	type: 'object',
	properties: {
		byMimeType: {
			type: 'object',
			description: 'Rules for extracting artifacts from tool results by MIME type. Maps MIME type patterns (e.g. \'image/*\') to group configuration.',
			additionalProperties: artifactGroupConfigSchema,
		},
		byFilePath: {
			type: 'object',
			description: 'Rules for extracting artifacts from written files by file path glob pattern. Maps glob patterns (e.g. \'**/*plan*.md\') to group configuration.',
			additionalProperties: artifactGroupConfigSchema,
		},
		byMemoryFilePath: {
			type: 'object',
			description: 'Rules for extracting artifacts from memory tool writes by memory file path glob pattern. Maps glob patterns to group configuration.',
			additionalProperties: artifactGroupConfigSchema,
		}
	}
};

export const SetArtifactRulesToolData: IToolData = {
	id: SetArtifactRulesToolId,
	toolReferenceName: 'artifactRules',
	legacyToolReferenceFullNames: [],
	displayName: localize('tool.setArtifactRules.displayName', 'Set Artifact Rules'),
	modelDescription: 'Override the artifact extraction rules for this session. Rules control which tool results, files, and memory writes are automatically surfaced as artifacts.\n\nProvide rules as MIME type patterns, file path globs, or memory file path globs, each mapped to a group configuration with a groupName and optional onlyShowGroup flag.\n\nExamples:\n- byMimeType: { "image/*": { "groupName": "Screenshots", "onlyShowGroup": true } }\n- byFilePath: { "**/*plan*.md": { "groupName": "Plans" } }\n- byMemoryFilePath: { "**/*plan*.md": { "groupName": "Plans" } }\n\nThis fully replaces any settings-based rules for the duration of this session.',
	canBeReferencedInPrompt: true,
	source: ToolDataSource.Internal,
	inputSchema
};

interface ISetArtifactRulesToolInput {
	byMimeType?: Record<string, IArtifactGroupConfig>;
	byFilePath?: Record<string, IArtifactGroupConfig>;
	byMemoryFilePath?: Record<string, IArtifactGroupConfig>;
}

export class SetArtifactRulesTool implements IToolImpl {

	constructor(
		@IChatArtifactsService private readonly _chatArtifactsService: IChatArtifactsService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			pastTenseMessage: new MarkdownString(localize('tool.setArtifactRules.pastTense', "Updated artifact rules")),
			presentation: ToolInvocationPresentation.Hidden,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: never, _progress: never, _token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as ISetArtifactRulesToolInput;
		const chatSessionResource = invocation.context?.sessionResource;
		if (!chatSessionResource) {
			return {
				content: [{ kind: 'text', value: 'Error: No session resource available' }]
			};
		}

		const rules: IArtifactRuleOverrides = {
			byMimeType: args.byMimeType,
			byFilePath: args.byFilePath,
			byMemoryFilePath: args.byMemoryFilePath,
		};

		this._chatArtifactsService.getArtifacts(chatSessionResource).setRuleOverrides(rules);

		return {
			content: [{ kind: 'text', value: localize('tool.setArtifactRules.success', "Updated artifact rules") }]
		};
	}
}
