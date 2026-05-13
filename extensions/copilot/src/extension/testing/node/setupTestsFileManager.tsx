/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IParserService } from '../../../platform/parser/node/parserService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceMutation, IWorkspaceMutationManager, IWorkspaceMutationOptions } from '../../../platform/testing/common/workspaceMutationManager';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Iterable } from '../../../util/vs/base/common/iterator';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Range } from '../../../vscodeTypes';
import { applyEdits } from '../../prompt/node/intents';
import { CopilotIdentityRules } from '../../prompts/node/base/copilotIdentity';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { ResponseTranslationRules } from '../../prompts/node/base/responseTranslationRules';
import { SafetyRules } from '../../prompts/node/base/safetyRules';
import { PatchEditExamplePatch, PatchEditRules, getPatchEditReplyProcessor } from '../../prompts/node/codeMapper/patchEditGeneration';
import { summarizeDocument } from '../../prompts/node/inline/summarizedDocument/summarizeDocumentHelpers';
import { CodeBlock } from '../../prompts/node/panel/safeElements';

const KEEP_LAST_N = 5;

export class WorkspaceMutationManager implements IWorkspaceMutationManager {
	declare readonly _serviceBrand: undefined;

	private readonly requests = new Map<string, IWorkspaceMutation>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {

	}
	create(requestId: string, options: IWorkspaceMutationOptions): IWorkspaceMutation {
		const mut = this.instantiationService.createInstance(WorkspaceMutation, options);
		this.requests.set(requestId, mut);

		if (this.requests.size > KEEP_LAST_N) {
			this.requests.delete(Iterable.first(this.requests.keys())!);
		}

		return mut;
	}

	get(requestId: string): IWorkspaceMutation {
		const req = this.requests.get(requestId);
		if (!req) {
			throw new Error(l10n.t(`No request found, or it has expired. Please re-submit your query.`));
		}
		return req;
	}
}

class WorkspaceMutation implements IWorkspaceMutation {
	private readonly fileDescriptions = this.getFileDescriptions();
	private readonly fileContents = new Map<string, Promise<string>>();
	private applied = false;

	constructor(
		public readonly opts: IWorkspaceMutationOptions,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService
	) {
		this.fileDescriptions = this.getFileDescriptions();
	}

	/** @inheritdoc */
	public get(file: string) {
		file = file.replaceAll('\\', '/').replace(/^\//, '');

		const res = this.getInner(file);

		// optimisiticly pre-fetch for a case of a user going through the files in sequence
		const index = this.opts.files.indexOf(file);
		if (index !== -1 && index < this.opts.files.length - 1) {
			res.then(() => this.getInner(this.opts.files[index + 1]));
		}

		return res;
	}

	/** @inheritdoc */
	public async apply(progress: undefined | vscode.Progress<{ message: string }>, token: CancellationToken): Promise<void> {
		if (this.applied) {
			throw new Error(l10n.t('Edits have already been applied'));
		}

		try {
			this.applied = true;
			for (const file of this.opts.files) {
				if (token.isCancellationRequested) {
					return;
				}

				progress?.report({ message: l10n.t('Generating {0}', file) });
				const contents = await this.getInner(file);
				await this.fileSystemService.writeFile(URI.joinPath(this.opts.baseURI, file), new TextEncoder().encode(contents));
			}

			progress?.report({ message: l10n.t('Edits applied successfully') });
		} catch (e) {
			this.applied = false;
			throw e;
		}
	}

	private async getInner(file: string) {
		const prev = this.fileContents.get(file);
		if (prev) {
			return prev;
		}

		const promise = this.generateContent(file);
		this.fileContents.set(file, promise);
		return promise;
	}

	private async generateContent(file: string) {
		const descriptions = await this.fileDescriptions;

		let document: TextDocumentSnapshot | undefined;
		try {
			document = await this.workspaceService.openTextDocumentAndSnapshot(URI.joinPath(this.opts.baseURI, file));
		} catch {
			// ignored
		}
		const originalText = document?.getText();


		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');
		const promptRenderer = PromptRenderer.create(this.instantiationService, endpoint, WorkspaceMutationFilePrompt, {
			file,
			document,
			allInstructions: descriptions?.response,
			fileTree: this.opts.fileTree,
			query: this.opts.query,
			instructionsForThisFile: descriptions?.perFile.find(f => f.file === file)?.description,
		});

		const prompt = await promptRenderer.render();

		const fetchResult = await endpoint
			.makeChatRequest(
				'workspaceMutationFileGenerator',
				prompt.messages,
				undefined,
				CancellationToken.None,
				ChatLocation.Other
			);

		if (fetchResult.type !== ChatFetchResponseType.Success) {
			this.fileContents.delete(file);
			throw new Error(l10n.t('Encountered an error while generating the file: ({0}) {1}', fetchResult.type, fetchResult.reason));
		}

		if (originalText && document) {
			const reply = getPatchEditReplyProcessor(this.promptPathRepresentationService).process(fetchResult.value, originalText, document.uri);
			return applyEdits(originalText, reply.edits);
		}

		return fetchResult.value;
	}

	private async getFileDescriptions() {
		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');
		const promptRenderer = PromptRenderer.create(this.instantiationService, endpoint, WorkspaceMutationInstructionsPrompt, {
			fileTreeStr: this.opts.fileTree,
			query: this.opts.query,
		});
		const prompt = await promptRenderer.render();

		const fetchResult = await endpoint
			.makeChatRequest(
				'workspaceMutationSummarizer',
				prompt.messages,
				undefined,
				CancellationToken.None,
				ChatLocation.Other,
			);

		if (fetchResult.type !== ChatFetchResponseType.Success) {
			return undefined;
		}

		const out: { file: string; description: string }[] = [];
		for (const [, file, description] of fetchResult.value.matchAll(/^`?(.*?)`?:\s*(.+)$/gm)) {
			out.push({ file, description });
		}
		return { perFile: out, response: fetchResult.value };
	}
}


interface WorkspaceMutationInstructionsPromptArgs extends BasePromptElementProps {
	query: string;
	fileTreeStr: string;
}

class WorkspaceMutationInstructionsPrompt extends PromptElement<WorkspaceMutationInstructionsPromptArgs> {
	override render(): PromptPiece<any, any> | undefined {
		return (
			<>
				<SystemMessage priority={1000}>
					You are a VS Code assistant. Your job is to generate the project specification when given the user description and file tree structure of the project that a user wants to create. <br />
					<CopilotIdentityRules />
					<SafetyRules />
					<ResponseTranslationRules />
					<br />
					Additional Rules<br />
					You will be given a user query and a tree of files they wish to edit or create in order to accomplish a task.
					Think step by step and respond with a text description that lists and summarizes what needs to be done in each file to accomplish the user's task.<br />
					Below you will find a set of examples of what you should respond with. Please follow these examples as closely as possible.<br />
					<br />
					## Valid question<br />
					User: I want to: add the sequelize ORM to my project and add a user model<br />
					This is the project tree structure:<br />
					```markdown <br />
					my-express-app<br />
					├── src<br />
					│   └── models<br />
					│       └── user.ts<br />
					├── package.json<br />
					└── README.md<br />
					```<br />
					## Valid response<br />
					`src/models/user.ts`: This file defines and exports the User model for use in the application.<br />
					`src/routes/index.ts`: This file exports a function `setRoutes` which sets up the routes for the application. It uses the `IndexController` to handle the root route.<br />
					`package.json`: We need to edit the package.json to ensure Sequelize is defined as a dependency<br />
					`README.md`: We should add documentation to the readme file to make consumers aware of the new setup steps.<br />
				</SystemMessage>
				<UserMessage priority={900}>
					I want to: {this.props.query}<br />
					This is the project tree structure:<br />
					```markdown' <br />
					{this.props.fileTreeStr}<br />
					```<br />
				</UserMessage >
			</>
		);
	}
}

interface WorkspaceFileMutationPromptArgs extends BasePromptElementProps {
	file: string;
	query: string;
	fileTree: string;
	allInstructions: string | undefined;
	instructionsForThisFile?: string;
	/** existing text document, if any */
	document?: TextDocumentSnapshot;
}

class WorkspaceMutationFilePrompt extends PromptElement<WorkspaceFileMutationPromptArgs> {
	override render(): PromptPiece<any, any> | undefined {
		const { file, query, fileTree, allInstructions, instructionsForThisFile, document } = this.props;
		return (
			<>
				<SystemMessage priority={1000}>
					You are a VS Code assistant. Your job is to generate the project specification when given the user description and file tree structure of the project that a user wants to create. <br />
					<CopilotIdentityRules />
					<SafetyRules />
					<ResponseTranslationRules />
					<br />
					Additional Rules<br />
					The user will describe the task they're trying to accomplish, and ask you to generate or edit a file in persuit of that task.<br />
					{document ? <PatchEditRules /> : <>
						Print the entire contents of the file you propose.<br />
						If asked to generate a test file, create a file with a self-contained 'hello world' test case without dependency on any other files or imports aside from the testing framwork.<br />
					</>}
					Do not include comments in json files.<br />
					Do not use code blocks or backticks.<br />
					Do not include any other explanation.<br />
					<br />
					{document ? <PatchEditExamplePatch changes={[{
						uri: URI.file('/package.json'),
						find: ['"dependencies": {', '  "typescript": "^4.5.4",'],
						replace: ['"dependencies": {', '  "mocha": "latest"', '  "typescript": "^4.5.4",'],
					}]} /> : <>
						# Example<br />
						## Question:<br />
						I want to: set up mocha in my workspace<br />
						Please print the contents of the file `src/index.test.ts`<br />
						## Response:{`
const assert = require('assert');
test('hello world!', () => {
	assert.strictEqual(1 + 1, 2);
});
`}</>}
				</SystemMessage>
				<UserMessage priority={900}>
					I want to: {query}<br />
					Please print the contents of the file `{file}`<br />
					{instructionsForThisFile
						? <>Description of this file: {instructionsForThisFile}</>
						: <>Here are the files in my workspace, including this one: {allInstructions}`</>}<br />

					This is the project tree structure:<br />
					```filetree<br />
					{fileTree}<br />
					```<br />
					<br />
					{document && <WorkspaceMutationFileContents flexGrow={1} document={document} />}
				</UserMessage >
			</>
		);
	}
}

interface WorkspaceMutationFileContentsProps extends BasePromptElementProps {
	document: TextDocumentSnapshot;
}

class WorkspaceMutationFileContents extends PromptElement<WorkspaceMutationFileContentsProps> {
	constructor(
		props: WorkspaceMutationFileContentsProps,
		@IParserService private readonly parserService: IParserService,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing): Promise<PromptPiece> {
		const { document } = this.props;
		const codeExcerpt = await summarizeDocument(
			this.parserService,
			document,
			undefined,
			new Range(0, 0, 0, 0),
			sizing.tokenBudget * (2 / 3)
		);

		return <CodeBlock uri={document.uri} languageId={document.languageId} code={codeExcerpt.text} />;
	}
}
