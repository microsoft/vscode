/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, RenderPromptResult, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { FetchStreamSource, IResponsePart } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { IRunCommandExecutionService } from '../../../../platform/commands/common/runCommandExecutionService';
import { IExtensionsService } from '../../../../platform/extensions/common/extensionsService';
import { IPackageJson } from '../../../../platform/extensions/common/packageJson';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { ISetupTestExtension, testExtensionsForLanguage } from '../../../../platform/testing/common/setupTestExtensions';
import { IWorkspaceMutationManager } from '../../../../platform/testing/common/workspaceMutationManager';
import { SetupConfirmationResult } from '../../../../platform/testing/node/setupTestDetector';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { mapFindFirst } from '../../../../util/vs/base/common/arraysFind';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Lazy } from '../../../../util/vs/base/common/lazy';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseExtensionsPart } from '../../../../vscodeTypes';
import { convertFileTreeToChatResponseFileTree, listFilesInResponseFileTree } from '../../../prompt/common/fileTreeParser';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { IToken, StreamingGrammar } from '../../../prompt/common/streamingGrammar';
import { IIntent, IIntentInvocation, IResponseProcessorContext, nullRenderPromptResult } from '../../../prompt/node/intents';
import { CopilotIdentityRules } from '../../../prompts/node/base/copilotIdentity';
import { InstructionMessage } from '../../../prompts/node/base/instructionMessage';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';
import { ResponseTranslationRules } from '../../../prompts/node/base/responseTranslationRules';
import { SafetyRules } from '../../../prompts/node/base/safetyRules';
import { ChatVariablesAndQuery } from '../../../prompts/node/panel/chatVariables';
import { EditorIntegrationRules } from '../../../prompts/node/panel/editorIntegrationRules';
import { WorkspaceStructure } from '../../../prompts/node/panel/workspace/workspaceStructure';
import { SetupTestFileScheme } from '../../../testing/common/files';
import { SetupTestsFrameworkQueryInvocationRaw } from './setupTestsFrameworkQueryInvocation';


export class SetupTestsInvocation implements IIntentInvocation {
	private delegatedSetup?: SetupConfirmationResult;
	private setupConfirmation?: SetupConfirmationResult;
	private buildPromptContext!: IBuildPromptContext;

	constructor(
		public readonly intent: IIntent,
		public readonly endpoint: IChatEndpoint,
		public readonly location: ChatLocation,
		private readonly prompt: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IWorkspaceMutationManager private readonly workspaceMutationManager: IWorkspaceMutationManager,
		@IExtensionsService private readonly extensionsService: IExtensionsService,
		@IRunCommandExecutionService private readonly commandService: IRunCommandExecutionService
	) {
	}

	async buildPrompt(context: IBuildPromptContext, progress: vscode.Progress<vscode.ChatResponseReferencePart | vscode.ChatResponseProgressPart>, token: vscode.CancellationToken): Promise<RenderPromptResult> {
		this.buildPromptContext = context;

		this.delegatedSetup = await this.delegateHandling();
		if (this.delegatedSetup) {
			return nullRenderPromptResult();
		}

		this.setupConfirmation = await this.getSetupConfirmation();
		const renderer = PromptRenderer.create(this.instantiationService, this.endpoint, SetupTestsPrompt, {
			endpoint: this.endpoint,
			promptContext: context,
			query: this.prompt,
			setupConfirmation: this.setupConfirmation,
		});

		return renderer.render(progress, token);
	}

	async processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
		const enum State {
			LookingForTree,
			FileTree,
			FoundTree,
		}

		const requestId = context.turn.id;

		const pushTokens = (tokens: Iterable<IToken<State>>) => {
			for (const token of tokens) {
				if (token.transitionTo === State.FileTree) {
					// tokens are accumulated into a file tree is seen (generally the first
					// thing in the response) to avoid printing a generic "what framework are
					// you using?" if the user gave a generic questioning prompt
					outputStream.markdown(grammar.accumulate(0, grammar.tokens.length - 1));
				} else if (token.transitionTo === State.FoundTree) {
					const tree = grammar.accumulate(undefined, undefined, State.FileTree);
					this.handleFileTree(requestId, tree, outputStream);
				} else if (token.transitionTo === undefined && token.state !== State.FileTree && grammar.visited(State.FileTree)) {
					outputStream.markdown(token.token);
				}
			}
		};

		const grammar = new StreamingGrammar(State.LookingForTree, {
			[State.LookingForTree]: { '```filetree': State.FileTree },
			[State.FileTree]: { '```': State.FoundTree },
		});

		for await (const { delta } of inputStream) {
			pushTokens(grammar.append(delta.text));
		}
		pushTokens(grammar.flush());

		if (this.delegatedSetup) {
			outputStream.markdown(this.delegatedSetup.message);
		}

		const command = this.setupConfirmation?.command || this.delegatedSetup?.command;
		if (command) {
			// prompt will already include the `message` at the end, just add the button as needed
			outputStream.button(command);
		} else if (grammar.visited(State.FileTree)) {
			await this.recommendExtension(grammar.accumulate(undefined, undefined, State.LookingForTree), outputStream, token);
		} else {
			// if we never saw a file tree, automatically do the generic test setup
			await this.doFrameworkQuery(context, outputStream, token);
		}
	}

	private async doFrameworkQuery(context: IResponseProcessorContext, outputStream: vscode.ChatResponseStream, token: CancellationToken) {
		const invocation = this.instantiationService.createInstance(SetupTestsFrameworkQueryInvocationRaw, this.endpoint, undefined);
		const prompt = await invocation.buildPrompt(this.buildPromptContext, undefined, token);
		const inputStream = new FetchStreamSource();
		const responseProcessing = invocation.processResponse(context, inputStream.stream, outputStream, token);
		await this.endpoint.makeChatRequest(
			'testSetupAutomaticFrameworkID',
			prompt.messages,
			(text, _, delta) => {
				inputStream.update(text, delta);
				return Promise.resolve(undefined);
			},
			token,
			this.location,
		);

		inputStream.resolve();
		await responseProcessing;
	}

	private async getSetupConfirmation() {
		const extensionInfo = this.recommendedExtension.value;
		const extension = extensionInfo ? this.extensionsService.getExtension(extensionInfo.id) : undefined;
		const command = (extension?.packageJSON as IPackageJson)?.copilot?.tests?.getSetupConfirmation;
		if (!command) {
			return;
		}

		let result: SetupConfirmationResult | undefined;
		try {
			result = await this.commandService.executeCommand(command);
		} catch {
			// ignored
		}

		return result;
	}

	private async delegateHandling() {
		const extensionInfo = this.recommendedExtension.value;
		const extension = extensionInfo ? this.extensionsService.getExtension(extensionInfo.id) : undefined;
		const command = (extension?.packageJSON as IPackageJson)?.copilot?.tests?.setupTests;
		return command ? await this.commandService.executeCommand(command) : undefined;
	}

	private recommendedExtension = new Lazy(() => getKnownExtensionInText(this.prompt));

	private async recommendExtension(outputText: string, outputStream: vscode.ChatResponseStream, token: CancellationToken) {
		let searchText: string;
		let extensionInfo: ISetupTestExtension | undefined;
		if (this.recommendedExtension.value) {
			searchText = this.prompt;
			extensionInfo = this.recommendedExtension.value;
		} else {
			searchText = await this.deriveFrameworkFromResponse(outputText, token);
			extensionInfo = getKnownExtensionInText(searchText);
		}

		if (extensionInfo && this.extensionsService.getExtension(extensionInfo.id)) {
			return; // extension already installed
		}

		outputStream.markdown('\n\n');

		if (extensionInfo) {
			outputStream.markdown(l10n.t('I also recommend installing the {0} extension to make tests easy to run in VS Code:', extensionInfo.name));
			outputStream.markdown('\n\n');
			outputStream.push(new ChatResponseExtensionsPart([extensionInfo.id]));
		} else {
			outputStream.markdown(l10n.t('You can also search for an extension to make tests easy to run in VS Code:'));
			outputStream.button({
				command: 'workbench.extensions.search',
				title: l10n.t('Search Extensions'),
				arguments: [`@category:testing ${this.prompt}`]
			});
		}
	}

	private async deriveFrameworkFromResponse(outputText: string, token: CancellationToken) {
		const deriveResponsePrompt = await PromptRenderer.create(this.instantiationService, this.endpoint, TestFrameworkFromResponsePrompt, {
			query: outputText,
		}).render();
		const fetchResult = await this.endpoint.makeChatRequest(
			'setupTestDeriveName',
			deriveResponsePrompt.messages,
			undefined,
			token,
			ChatLocation.Panel
		);


		if (fetchResult.type !== ChatFetchResponseType.Success) {
			return '';
		}

		return fetchResult.value.replaceAll('`', '');
	}

	private handleFileTree(requestId: string, tree: string, outputStream: vscode.ChatResponseStream) {
		const workspaceFolder = this.workspaceService.getWorkspaceFolders().at(0);
		if (!workspaceFolder) {
			return;
		}

		// todo: make the preview URI a diff for existing files
		const { chatResponseTree } = convertFileTreeToChatResponseFileTree(tree, () => makePreviewUri(requestId));

		// Handle a root '[project-name]' or similar fake root node
		const first = chatResponseTree.value[0];
		if (chatResponseTree.value.length === 1 && /^\[.+\]$/.test(first.name) && first.children) {
			chatResponseTree.value = first.children!;
		}

		this.workspaceMutationManager.create(requestId, {
			baseURI: workspaceFolder,
			files: listFilesInResponseFileTree(chatResponseTree.value),
			fileTree: tree,
			query: this.prompt,
		});
		outputStream.push(chatResponseTree);
		outputStream.button({
			command: 'github.copilot.tests.applyMutations',
			title: l10n.t('Apply Changes'),
			arguments: [requestId],
		});
	}
}

const projectNameToken = '[project-name]';

function makePreviewUri(requestId: string, filePath?: string) {
	return URI.from({
		scheme: SetupTestFileScheme,
		authority: requestId,
		path: filePath ? `/${filePath}` : '/'
	});
}

interface SetupTestsPromptProps extends BasePromptElementProps {
	promptContext: IBuildPromptContext;
	query: string;
	endpoint: IChatEndpoint;
	setupConfirmation: SetupConfirmationResult | undefined;
}

class SetupTestsPrompt extends PromptElement<SetupTestsPromptProps> {
	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const { query, setupConfirmation } = this.props;
		return <>
			<SystemMessage priority={1000}>
				You are a software engineer with expert knowledge around software testing frameworks.<br />
				<br />
				<CopilotIdentityRules />
				<SafetyRules />
				<EditorIntegrationRules />
				<ResponseTranslationRules />
				# Additional Rules<br />
				1. The user will tell you what testing framework they want to set up, and provide you their workspace structure.<br />
				2. Determine how to test up the desired testing framework.<br />
				3. Generate a markdown file tree structure listing files you want to create or edit in order to set up the testing framework. The tree MUST NOT include files that don't need to be modified.<br />
				4. Make sure to include a basic "hello world" test to help the user get started. If you see existing test files in the workspace, make sure to try to match their naming convention.<br />
				5. Do not attempt to modify the file content yourself and simply respond with the file tree structure.<br />
				6. After listing the file tree structure, respond with any terminal commands the user should execute to finish installing the testing framework. Terminal commands should be wrapped in a code fence tagged with the "sh" language.<br />
				7. Finally, provide a command line a user can execute to run their tests.<br />
				{setupConfirmation && <>
					8. At the end, include a phrase that conveys '{setupConfirmation.message}', but rephrase this to indicate that this is the last step the user needs to take to enable rich UI integration in VS Code.{setupConfirmation.command && ` This message will be followed by a button that says "${setupConfirmation.command.title}".`}<br />
				</>}
				<br />
				# Example<br />
				## Question:<br />
				I want to: set up mocha tests in the workspace<br />
				I am working in a workspace that has the following structure:<br />{`\`\`\`
src/
  index.ts
package.json
tsconfig.json
\`\`\``}
				<br />
				## Response:<br />
				Let's create a `.mocharc.js` file to configure your test settings, as well as a "hello world" test:<br /><br />{`\`\`\`filetree
${projectNameToken}
├── src
│   └── index.test.ts
└── mocha.opts
\`\`\``}<br />
				Then, we'll need to install Mocha in your workspace:
				<br />
				```sh<br />
				npm install --save-dev mocha
				```<br />
				<br />
				Finally, you can run your tests with the following command:<br />
				```sh<br />
				npx mocha<br />
				```<br />
			</SystemMessage>
			<UserMessage flexGrow={2}>
				<SetupWorkspaceStructure />
			</UserMessage>
			<ChatVariablesAndQuery flexGrow={2} priority={900} chatVariables={this.props.promptContext.chatVariables} query={`I want to: ${query}`} embeddedInsideUserMessage={false} />
		</>;
	}
}

class SetupWorkspaceStructure extends PromptElement {
	override render(_state: void, sizing: PromptSizing): PromptPiece {
		return <WorkspaceStructure maxSize={(sizing.tokenBudget * 4) / 3} />;
	}
}


class TestFrameworkFromResponsePrompt extends PromptElement<{ query: string } & BasePromptElementProps> {
	override render(): PromptPiece<any, any> | undefined {
		const { query } = this.props;
		return <>
			<InstructionMessage priority={1000}>
				# Rules:<br />
				1. The user will give you instructions they were told regarding how to set up a testing framework.<br />
				2. Your job is to print the name of the testing framework referred to in the response.<br />
				3. Do not print any other information except for the name of the framework.<br />
				<br />
				# Example<br />
				## Question:<br />
				Given the structure of your workspace, I recommend using Mocha for testing. To set up Mocha, you should create a `.mocharc.js` file to configure your test settings, as well as a "hello world" test.
				<br />
				## Response:<br />
				mocha
			</InstructionMessage>
			<UserMessage>
				{query}
			</UserMessage>
		</>;
	}
}

function getKnownExtensionInText(text: string) {
	const haystack = text.toLowerCase();
	return mapFindFirst(testExtensionsForLanguage.values(), ext => {
		if (ext.forLanguage?.associatedFrameworks?.some(f => haystack.includes(f))) {
			return ext.forLanguage.extension;
		}

		return ext.perFramework && mapFindFirst(ext.perFramework, ([f, ext]) => haystack.includes(f) ? ext : undefined);
	});
}
