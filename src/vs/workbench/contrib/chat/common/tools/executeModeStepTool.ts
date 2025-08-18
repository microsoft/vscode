/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import {
	IPreparedToolInvocation,
	IToolData,
	IToolImpl,
	IToolInvocation,
	IToolInvocationPreparationContext,
	IToolResult,
	ToolDataSource
} from '../languageModelToolsService.js';

export const ExecuteModeStepToolId = 'execute_mode_step';

export const ExecuteModeStepToolData: IToolData = {
	id: ExecuteModeStepToolId,
	toolReferenceName: 'executeModeStep',
	when: undefined,
	canBeReferencedInPrompt: true,
	icon: ThemeIcon.fromId(Codicon.run.id),
	displayName: 'Execute Mode Step',
	userDescription: 'Executes the step-specific prompt for the selected mode',
	modelDescription: 'Executes the mode-step prompt contained in a file at a given file path. The path to the prompt file must be specified in the promptFilePath attribute of a ModeStep element in the system prompt',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			promptFilePath: {
				type: 'string',
				description: 'The file path to the file containing the mode step prompt'
			}
		},
		required: ['promptFilePath']
	}
};

interface IExecuteModeStepToolInputParams {
	promptFilePath: string;
}

export class ExecuteModeStepTool extends Disposable implements IToolImpl {

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,

	) {
		super();
	}

	async invoke(invocation: IToolInvocation, _countTokens: any, _progress: any, _token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IExecuteModeStepToolInputParams;
		this.logService.debug(`ExecuteModeStepTool: Invoking with promptFilePath=${args.promptFilePath}`);

		try {
			// Validate parameters
			if (!args.promptFilePath) {
				throw new Error('promptFilePath is required');
			}

			let promptFileUri = undefined;
			let file = URI.file(args.promptFilePath);
			if (!await this.fileService.exists(file)) {
				const { folders } = this.workspaceService.getWorkspace();
				for (const folder of folders) {
					file = joinPath(folder.uri, args.promptFilePath);
					if (await this.fileService.exists(file)) {
						promptFileUri = file;
						break;
					}
				}
			} else {
				promptFileUri = file;
			}

			if (!promptFileUri) {
				throw new Error(`Mode step file not found: ${args.promptFilePath}`);
			}


			const fileContent = await this.fileService.readFile(promptFileUri);
			const promptContent = fileContent.value.toString();

			// Log telemetry
			this.telemetryService.publicLog2<ModeStepToolInvokedEvent, ModeStepToolInvokedClassification>(
				'executeModeStepToolInvoked',
				{
					modeStepFilePathHash: this.hashString(args.promptFilePath),
					modeStepFileSize: promptContent.length
				}
			);

			// Process the mode step prompt file
			const result = this.processPrompt(promptContent);

			return {
				content: [{
					kind: 'text',
					value: result
				}]
			};

		} catch (error) {
			const errorMessage = `Error executing mode step: ${error instanceof Error ? error.message : 'Unknown error'}`;
			this.logService.error(errorMessage, error);

			return {
				content: [{
					kind: 'text',
					value: errorMessage
				}]
			};
		}
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IExecuteModeStepToolInputParams;

		const fileName = args.promptFilePath.split('/').pop() || args.promptFilePath;
		const message = `Executed mode step "${fileName}"`;

		return {
			pastTenseMessage: new MarkdownString(message),
			toolSpecificData: {
				kind: 'promptFile',
				promptFilePath: args.promptFilePath
			}
		};
	}

	private processPrompt(promptContent: string): string {
		return `<ModeStepInstructions>
	${promptContent}
</ModeStepInstructions>
`;
	}

	private hashString(str: string): string {
		// Simple hash function for telemetry (not cryptographically secure)
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return Math.abs(hash).toString();
	}
}

type ModeStepToolInvokedEvent = {
	modeStepFilePathHash: string;
	modeStepFileSize: number;
};

type ModeStepToolInvokedClassification = {
	modeStepFilePathHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Hash of the mode step file path for privacy.' };
	modeStepFileSize: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Size of the mode step file in characters.' };
	owner: 'copilot';
	comment: 'Provides insight into the usage of the execute mode step tool.';
};
