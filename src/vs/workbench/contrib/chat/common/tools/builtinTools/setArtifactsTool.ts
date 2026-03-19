/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../../../base/common/jsonSchema.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
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
import { IChatArtifact, IChatArtifactsService } from '../chatArtifactsService.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';

export const SetArtifactsToolId = 'setArtifacts';

const inputSchema: IJSONSchema & { properties: IJSONSchemaMap } = {
	type: 'object',
	properties: {
		artifacts: {
			type: 'array',
			description: 'The complete list of artifacts for this session. Overwrites any existing artifacts.',
			items: {
				type: 'object',
				properties: {
					label: {
						type: 'string',
						description: 'Display label for the artifact.'
					},
					uri: {
						type: 'string',
						description: 'Fully qualified URI of the artifact (e.g. https://localhost:3000 or file:///path/to/file). Must include the scheme.'
					},
					type: {
						type: 'string',
						enum: ['devServer', 'screenshot', 'plan'],
						description: 'The type of artifact.'
					}
				},
				required: ['label']
			}
		}
	},
	required: ['artifacts']
};

export const SetArtifactsToolData: IToolData = {
	id: SetArtifactsToolId,
	displayName: localize('tool.setArtifacts.displayName', 'Set Session Artifacts'),
	modelDescription: 'Set the list of artifacts for the current session. Each artifact has a label and either a uri or a toolCallId+dataPartIndex reference, plus an optional type (devServer, screenshot, plan). This overwrites the entire artifact list. Use this to surface important links, screenshots, plans, drafts, or temporary markdown documents to the user. URIs must be fully qualified with a scheme (e.g. https://localhost:3000, file:///tmp/plan.md). To reference a screenshot or image from a previous tool result, use toolCallId and dataPartIndex instead of uri.',
	canBeReferencedInPrompt: true,
	source: ToolDataSource.Internal,
	inputSchema
};

interface ISetArtifactsToolInput {
	artifacts: IChatArtifact[];
}

export class SetArtifactsTool implements IToolImpl {

	constructor(
		@IChatArtifactsService private readonly _chatArtifactsService: IChatArtifactsService,
		@IFileService private readonly _fileService: IFileService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			pastTenseMessage: new MarkdownString(localize('tool.setArtifacts.pastTense', "Updated session artifacts")),
			presentation: ToolInvocationPresentation.Hidden,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: never, _progress: never, _token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as ISetArtifactsToolInput;
		const chatSessionResource = invocation.context?.sessionResource;
		if (!chatSessionResource) {
			return {
				content: [{ kind: 'text', value: 'Error: No session resource available' }]
			};
		}

		const artifacts: IChatArtifact[] = [];
		for (const a of args.artifacts ?? []) {
			let uri = a.uri;
			if (!uri) {
				uri = '';
			}

			if (uri) {
				const parsed = URI.parse(uri);
				if (parsed.scheme !== 'http' && parsed.scheme !== 'https') {
					if (!await this._fileService.exists(parsed)) {
						throw new Error(localize('tool.setArtifacts.uriNotFound', "Artifact URI does not exist: {0}", uri));
					}
				}
			}

			artifacts.push({ label: a.label, uri, type: a.type });
		}

		this._chatArtifactsService.setArtifacts(chatSessionResource, artifacts);

		return {
			content: [{ kind: 'text', value: localize('tool.setArtifacts.success', "Set {0} artifact(s)", artifacts.length) }]
		};
	}
}
