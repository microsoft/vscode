/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, RenderPromptResult, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IResponsePart } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { IRunCommandExecutionService } from '../../../../platform/commands/common/runCommandExecutionService';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { testExtensionsForLanguage } from '../../../../platform/testing/common/setupTestExtensions';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../../common/constants';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { IToken, StreamingGrammar } from '../../../prompt/common/streamingGrammar';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { IIntent, IIntentInvocation, IResponseProcessorContext } from '../../../prompt/node/intents';
import { CopilotIdentityRules } from '../../../prompts/node/base/copilotIdentity';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';
import { ResponseTranslationRules } from '../../../prompts/node/base/responseTranslationRules';
import { SafetyRules } from '../../../prompts/node/base/safetyRules';
import { ChatVariablesAndQuery } from '../../../prompts/node/panel/chatVariables';
import { EditorIntegrationRules } from '../../../prompts/node/panel/editorIntegrationRules';
import { WorkspaceStructure } from '../../../prompts/node/panel/workspace/workspaceStructure';

export class SetupTestsFrameworkQueryInvocationRaw {
	constructor(
		public readonly endpoint: IChatEndpoint,
		private readonly documentContext: IDocumentContext | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IRunCommandExecutionService private readonly commandService: IRunCommandExecutionService,
	) {
	}
	public async buildPrompt(
		context: IBuildPromptContext,
		progress: vscode.Progress<vscode.ChatResponseReferencePart | vscode.ChatResponseProgressPart> | undefined,
		token: vscode.CancellationToken,
	): Promise<RenderPromptResult> {
		const renderer = PromptRenderer.create(this.instantiationService, this.endpoint, SetupTestsPrompt, {
			endpoint: this.endpoint,
			promptContext: context,
			document: this.documentContext?.document,
			selection: this.documentContext?.selection,
		});

		return renderer.render(progress, token);
	}

	public async processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
		const enum State {
			Reasoning,
			Frameworks,
		}

		const pushTokens = (tokens: Iterable<IToken<State>>) => {
			for (const token of tokens) {
				if (token.state === State.Reasoning && token.transitionTo === undefined) {
					outputStream.markdown(token.token);
				}
			}
		};

		const grammar = new StreamingGrammar(State.Reasoning, {
			[State.Reasoning]: { [frameworkPrefix]: State.Frameworks },
		});

		for await (const { delta } of inputStream) {
			if (token.isCancellationRequested) {
				return;
			}

			pushTokens(grammar.append(delta.text));
		}
		pushTokens(grammar.flush());

		const frameworks = grammar.accumulate(undefined, undefined, State.Frameworks)
			.split('\n')
			.map(line => line.replace(frameworkPrefix, '').trim())
			.filter(l => !!l);

		if (frameworks.length) {
			outputStream.confirmation(
				l10n.t('Pick a testing framework'),
				l10n.t('Pick from these options, or use chat to tell me what you\'d prefer:'),
				undefined,
				frameworks,
			);
		} else {
			outputStream.markdown(l10n.t('Use chat to tell me which framework you\'d prefer.'));
		}

		await this.commandService.executeCommand('workbench.action.chat.open', {
			query: `/${Intent.SetupTests} `,
			isPartialQuery: true,
		});
	}
}

/**
 * Asks the user what framework they want to use to set up their tests.
 */
export class SetupTestsFrameworkQueryInvocation extends SetupTestsFrameworkQueryInvocationRaw implements IIntentInvocation {
	constructor(
		public readonly intent: IIntent,
		endpoint: IChatEndpoint,
		public readonly location: ChatLocation,
		documentContext: IDocumentContext | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IRunCommandExecutionService commandService: IRunCommandExecutionService,
	) {
		super(endpoint, documentContext, instantiationService, commandService);
	}
}

const frameworkPrefix = 'FRAMEWORK: ';

interface WorkspacePromptProps extends BasePromptElementProps {
	promptContext: IBuildPromptContext;
	document?: TextDocumentSnapshot;
	selection?: vscode.Selection;
	endpoint: IChatEndpoint;
}

class SetupTestsPrompt extends PromptElement<WorkspacePromptProps> {
	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const { query, chatVariables } = this.props.promptContext;
		return <>
			<SystemMessage priority={1000}>
				You are a software engineer with expert knowledge around software testing frameworks.<br />
				<br />
				<CopilotIdentityRules />
				<SafetyRules />
				<EditorIntegrationRules />
				<ResponseTranslationRules />
				# Additional Rules<br />
				1. Examine the workspace structure the user is giving you.<br />
				2. Determine the best testing frameworks that should be used for the project.<br />
				3. Give a brief explanation why a user would choose one framework over the other, but be concise and never give the user steps to set up the framework.<br />
				4. If you're unsure which specific framework is best, you can suggest multiple frameworks.<br />
				5. Suggest only frameworks that are used to run tests. Do not suggest things like assertion libraries or build tools.<br />
				6. After determining the best framework to use, write out the name of 1 to 3 suggested frameworks prefixed by the phrase "{frameworkPrefix}", for example: "{frameworkPrefix}vitest".<br />
				<br />
				DO NOT mention that you cannot read files in the workspace.<br />
				DO NOT ask the user to provide additional information about files in the workspace.<br />
				<br />
				# Example<br />
				## Question:<br />
				I am working in a workspace that has the following structure:<br />{`\`\`\`
src/
  index.ts
package.json
tsconfig.json
vite.config.ts
\`\`\``}
				<br />
				## Response:<br />
				Because you have a `vite.config.ts` file, it looks like you're working on a browser or Node.js application. If you're working on a browser application, I recommend using Playwright. Otherwise, Vitest is a good choice for Node.js.<br />
				{frameworkPrefix}playwright<br />
				{frameworkPrefix}vitest<br />
			</SystemMessage>
			{this.props.document && <PreferredExtensions document={this.props.document} />}
			<UserMessage flexGrow={2}>
				<SetupWorkspaceStructure />
			</UserMessage>
			<ChatVariablesAndQuery flexGrow={2} priority={900} chatVariables={chatVariables} query={query} embeddedInsideUserMessage={false} />
		</>;
	}
}

class SetupWorkspaceStructure extends PromptElement {
	override render(_state: void, sizing: PromptSizing): PromptPiece {
		return <WorkspaceStructure maxSize={(sizing.tokenBudget * 4) / 3} />;
	}
}

class PreferredExtensions extends PromptElement<{ document: TextDocumentSnapshot } & BasePromptElementProps> {
	override render(): PromptPiece | undefined {
		const extensions = testExtensionsForLanguage.get(this.props.document.languageId);
		if (!extensions?.perFramework) {
			return;
		}

		return <SystemMessage priority={600}>
			These are the preferred test frameworks for {this.props.document.languageId}:<br />
			<br />
			{[...extensions.perFramework.keys()].map(f => `- ${f}`).join('\n')}<br />
		</SystemMessage>;
	}
}
