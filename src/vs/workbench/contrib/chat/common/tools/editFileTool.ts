/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { SaveReason } from '../../../../common/editor.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ICodeMapperService } from '../../common/chatCodeMapperService.js';
import { IChatEditingService } from '../../common/chatEditingService.js';
import { ChatModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ILanguageModelIgnoredFilesService } from '../../common/ignoredFiles.js';
import { CountTokensCallback, IToolData, IToolImpl, IToolInvocation, IToolResult } from '../../common/languageModelToolsService.js';
import { IToolInputProcessor } from './tools.js';

const codeInstructions = `
The user is very smart and can understand how to apply your edits to their files, you just need to provide minimal hints.
Avoid repeating existing code, instead use comments to represent regions of unchanged code. The user prefers that you are as concise as possible. For example:
// ...existing code...
{ changed code }
// ...existing code...
{ changed code }
// ...existing code...

Here is an example of how you should use format an edit to an existing Person class:
class Person {
	// ...existing code...
	age: number;
	// ...existing code...
	getAge() {
		return this.age;
	}
}
`;

export const EditToolId = 'vscode_editFile';
export const EditToolData: IToolData = {
	id: EditToolId,
	tags: ['vscode_editing'],
	displayName: localize('chat.tools.editFile', "Edit File"),
	modelDescription: `Edit a file in the workspace. Use this tool once per file that needs to be modified, even if there are multiple changes for a file. Generate the "explanation" property first. ${codeInstructions}`,
	inputSchema: {
		type: 'object',
		properties: {
			explanation: {
				type: 'string',
				description: 'A short explanation of the edit being made. Can be the same as the explanation you showed to the user.',
			},
			filePath: {
				type: 'string',
				description: 'An absolute path to the file to edit, or the URI of a untitled, not yet named, file, such as `untitled:Untitled-1.',
			},
			code: {
				type: 'string',
				description: 'The code change to apply to the file. ' + codeInstructions
			}
		},
		required: ['explanation', 'filePath', 'code']
	}
};

export class EditTool implements IToolImpl {

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
		@ICodeMapperService private readonly codeMapperService: ICodeMapperService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILanguageModelIgnoredFilesService private readonly ignoredFilesService: ILanguageModelIgnoredFilesService,
		@ITextFileService private readonly textFileService: ITextFileService,
	) { }

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult> {
		if (!invocation.context) {
			throw new Error('toolInvocationToken is required for this tool');
		}

		const parameters = invocation.parameters as EditToolParams;
		const uri = URI.revive(parameters.file); // TODO@roblourens do revive in MainThreadLanguageModelTools
		if (!this.workspaceContextService.isInsideWorkspace(uri)) {
			throw new Error(`File ${uri.fsPath} can't be edited because it's not inside the current workspace`);
		}

		if (await this.ignoredFilesService.fileIsIgnored(uri, token)) {
			throw new Error(`File ${uri.fsPath} can't be edited because it is configured to be ignored by Copilot`);
		}

		const model = this.chatService.getSession(invocation.context?.sessionId) as ChatModel;
		const request = model.getRequests().at(-1)!;

		// Undo stops mark groups of response data in the output. Operations, such
		// as text edits, that happen between undo stops are all done or undone together.
		if (request.response?.response.getMarkdown().length) {
			// slightly hacky way to avoid an extra 'no-op' undo stop at the start of responses that are just edits
			model.acceptResponseProgress(request, {
				kind: 'undoStop',
				id: generateUuid(),
			});
		}

		model.acceptResponseProgress(request, {
			kind: 'markdownContent',
			content: new MarkdownString('\n````\n')
		});
		model.acceptResponseProgress(request, {
			kind: 'codeblockUri',
			uri
		});
		model.acceptResponseProgress(request, {
			kind: 'markdownContent',
			content: new MarkdownString(parameters.code + '\n````\n')
		});
		model.acceptResponseProgress(request, {
			kind: 'textEdit',
			edits: [],
			uri
		});

		const editSession = this.chatEditingService.getEditingSession(model.sessionId);
		if (!editSession) {
			throw new Error('This tool must be called from within an editing session');
		}

		const result = await this.codeMapperService.mapCode({
			codeBlocks: [{ code: parameters.code, resource: uri, markdownBeforeBlock: parameters.explanation }],
			location: 'tool',
			chatRequestId: invocation.chatRequestId
		}, {
			textEdit: (target, edits) => {
				model.acceptResponseProgress(request, { kind: 'textEdit', uri: target, edits });
			},
			notebookEdit(target, edits) {
				model.acceptResponseProgress(request, { kind: 'notebookEdit', uri: target, edits });
			},
		}, token);

		model.acceptResponseProgress(request, { kind: 'textEdit', uri, edits: [], done: true });

		if (result?.errorMessage) {
			throw new Error(result.errorMessage);
		}

		let dispose: IDisposable;
		await new Promise((resolve) => {
			// The file will not be modified until the first edits start streaming in,
			// so wait until we see that it _was_ modified before waiting for it to be done.
			let wasFileBeingModified = false;

			dispose = autorun((r) => {

				const entries = editSession.entries.read(r);
				const currentFile = entries?.find((e) => e.modifiedURI.toString() === uri.toString());
				if (currentFile) {
					if (currentFile.isCurrentlyBeingModifiedBy.read(r)) {
						wasFileBeingModified = true;
					} else if (wasFileBeingModified) {
						resolve(true);
					}
				}
			});
		}).finally(() => {
			dispose.dispose();
		});

		await this.textFileService.save(uri, {
			reason: SaveReason.AUTO,
			skipSaveParticipants: true,
		});

		return {
			content: [{ kind: 'text', value: 'The file was edited successfully' }]
		};
	}
}

export interface EditToolParams {
	file: UriComponents;
	explanation: string;
	code: string;
}

export interface EditToolRawParams {
	filePath: string;
	explanation: string;
	code: string;
}

export class EditToolInputProcessor implements IToolInputProcessor {
	processInput(input: EditToolRawParams): EditToolParams {
		if (!input.filePath) {
			// Tool name collision, or input wasn't properly validated upstream
			return input as any;
		}
		const filePath = input.filePath;
		// Runs in EH, will be mapped
		return {
			file: filePath.startsWith('untitled:') ? URI.parse(filePath) : URI.file(filePath),
			explanation: input.explanation,
			code: input.code,
		};
	}
}
