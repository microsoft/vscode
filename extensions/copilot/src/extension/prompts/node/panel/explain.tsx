/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { ILanguageFeaturesService } from '../../../../platform/languages/common/languageFeaturesService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { DiagnosticSeverity } from '../../../../vscodeTypes';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { InstructionMessage } from '../base/instructionMessage';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { LegacySafetyRules } from '../base/safetyRules';
import { ChatToolReferences, ChatVariablesAndQuery } from './chatVariables';
import { CodeBlockFormattingRules } from './codeBlockFormattingRules';
import { HistoryWithInstructions } from './conversationHistory';
import { CurrentSelection } from './currentSelection';
import { CustomInstructions } from './customInstructions';
import { EditorIntegrationRules } from './editorIntegrationRules';
import { ProjectLabels } from './projectLabels';
import { SymbolAtCursor } from './symbolAtCursor';
import { SymbolDefinitions } from './symbolDefinitions';

export interface ExplainPromptProps extends BasePromptElementProps {
	promptContext: IBuildPromptContext;
	endpoint: IChatEndpoint;

	// We want these upfront if possible because these could change during async prompt rendering
	document?: TextDocumentSnapshot;
	selection?: vscode.Selection;
	isInlineChat?: boolean;
}

export interface ExplainPromptState {
	explainingDiagnostic: boolean;
}

export class ExplainPrompt extends PromptElement<ExplainPromptProps, ExplainPromptState> {

	constructor(
		props: ExplainPromptProps,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
	) {
		super(props);
	}

	override async prepare() {
		let explainingDiagnostic = false;
		const { document, selection } = this.props;
		if (document?.uri && selection) {
			const severeDiagnostics = this.languageService.getDiagnostics(document.uri);
			const diagnosticsInSelection = severeDiagnostics.filter(d => !!d.range.intersection(selection));
			const filteredDiagnostics = diagnosticsInSelection.filter(d => d.severity <= DiagnosticSeverity.Warning);
			explainingDiagnostic = filteredDiagnostics.length > 0;
		}
		return { explainingDiagnostic };
	}

	override render(state: ExplainPromptState, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		let { query, history, chatVariables, } = this.props.promptContext;
		chatVariables = chatVariables.filter(v => !v.reference.id.startsWith('vscode.implicit'));
		return (
			<>
				<SystemMessage priority={1000}>
					You are a world-class coding tutor. Your code explanations perfectly balance high-level concepts and granular details. Your approach ensures that students not only understand how to write code, but also grasp the underlying principles that guide effective programming.<br />
					<CopilotIdentityRules />
					<LegacySafetyRules />
				</SystemMessage>
				<HistoryWithInstructions inline={this.props.isInlineChat} historyPriority={600} passPriority history={history}>
					<InstructionMessage priority={1000}>
						<EditorIntegrationRules />
						<ResponseTranslationRules />
						<br />
						Additional Rules<br />
						Think step by step:<br />
						1. Examine the provided code selection and any other context like user question, related errors, project details, class definitions, etc.<br />
						2. If you are unsure about the code, concepts, or the user's question, ask clarifying questions.<br />
						3. If the user provided a specific question or error, answer it based on the selected code and additional provided context. Otherwise focus on explaining the selected code.<br />
						4. Provide suggestions if you see opportunities to improve code readability, performance, etc.<br />
						<br />
						Focus on being clear, helpful, and thorough without assuming extensive prior knowledge.<br />
						Use developer-friendly terms and analogies in your explanations.<br />
						Identify 'gotchas' or less obvious parts of the code that might trip up someone new.<br />
						Provide clear and relevant examples aligned with any provided context.<br />
						Use Markdown formatting in your answers.<br />
						<CodeBlockFormattingRules />
					</InstructionMessage>
				</HistoryWithInstructions>
				<ProjectLabels priority={700} embeddedInsideUserMessage={false} />
				<UserMessage priority={750}>
					<CustomInstructions languageId={undefined} chatVariables={chatVariables} />
				</UserMessage>
				<CurrentSelection document={this.props.document} range={this.props.selection} priority={900} />
				<SymbolDefinitions document={this.props.document} range={this.props.selection} priority={800} embeddedInsideUserMessage={false} />
				{!state.explainingDiagnostic && <SymbolAtCursor document={this.props.document} selection={this.props.selection} priority={800} />}
				<ChatToolReferences priority={899} flexGrow={2} promptContext={this.props.promptContext} embeddedInsideUserMessage={false} />
				<ChatVariablesAndQuery priority={900} chatVariables={chatVariables} query={query} embeddedInsideUserMessage={false} />
			</>
		);
	}
}
