/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ICodeMapperService } from '../../common/chatCodeMapperService.js';
import { IChatEditingService } from '../../common/chatEditingService.js';
import { ChatModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolImpl, IToolInvocation, IToolResult } from '../../common/languageModelToolsService.js';

export class BuiltinToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.builtinTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const editTool = instantiationService.createInstance(EditTool);
		this._register(toolsService.registerToolData(editTool));
		this._register(toolsService.registerToolImplementation(editTool.id, editTool));
	}
}

interface EditToolParams {
	filePath: string;
	expanation: string;
	code: string;
}

class EditTool implements IToolData, IToolImpl {
	readonly id = 'vscode_editFile';
	readonly tags = ['editing'];
	readonly displayName = localize('chat.tools.editFile', "Edit File");
	readonly modelDescription = 'Edit a file in the workspace. Use this tool once per file that needs to be modified, even if there are multiple changes for a file.';
	readonly inputSchema: IJSONSchema;

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
		@ICodeMapperService private readonly codeMapperService: ICodeMapperService
	) {
		const codeInstructions = `
The code change to apply to the file.
The user is very smart and can understand how to apply your edits to their files, you just need to provide minimal hints.
Avoid repeating existing code, instead use comments to represent regions of unchanged code. The user prefers that you are as concise as possible. For example:
// ...existing code...
{ changed code }
// ...existing code...
{ changed code }
// ...existing code...
`;
		this.inputSchema = {
			type: 'object',
			properties: {
				filePath: {
					type: 'string',
					description: 'An absolute path to the file to edit',
				},
				expanation: {
					type: 'string',
					description: 'A short explanation of the edit being made. Can be the same as the explanation you showed to the user.',
				},
				code: {
					type: 'string',
					description: codeInstructions
				}
			},
			required: ['filePath', 'expanation', 'code']
		};
	}

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult> {
		if (!invocation.context) {
			throw new Error('toolInvocationToken is required for this tool');
		}

		const parameters = invocation.parameters as EditToolParams;
		const model = this.chatService.getSession(invocation.context?.sessionId) as ChatModel;
		const request = model.getRequests().at(-1)!;

		const uri = URI.file(parameters.filePath);
		model.acceptResponseProgress(request, {
			kind: 'markdownContent',
			content: new MarkdownString('````\n')
		});
		model.acceptResponseProgress(request, {
			kind: 'codeblockUri',
			uri
		});
		model.acceptResponseProgress(request, {
			kind: 'markdownContent',
			content: new MarkdownString(parameters.code + '\n````')
		});

		if (this.chatEditingService.currentEditingSession?.chatSessionId !== model.sessionId) {
			throw new Error('This tool must be called from within an editing session');
		}

		const result = await this.codeMapperService.mapCode({
			codeBlocks: [{ code: parameters.code, resource: uri, markdownBeforeBlock: parameters.expanation }],
			conversation: []
		}, {
			textEdit: (target, edits) => {
				model.acceptResponseProgress(request, { kind: 'textEdit', uri: target, edits });
			}
		}, token);

		model.acceptResponseProgress(request, { kind: 'textEdit', uri, edits: [], done: true });

		if (result?.errorMessage) {
			// ?
			throw new Error(result.errorMessage);
		}

		await new Promise((resolve) => {
			autorun((r) => {
				const currentEditingSession = this.chatEditingService.currentEditingSessionObs.read(r);
				const entries = currentEditingSession?.entries.read(r);
				const currentFile = entries?.find((e) => e.modifiedURI.toString() === uri.toString());
				if (currentFile && !currentFile.isCurrentlyBeingModified.read(r)) {
					resolve(true);
				}
			});
		});

		return {
			content: [{ kind: 'text', value: 'Success' }]
		};
	}
}
