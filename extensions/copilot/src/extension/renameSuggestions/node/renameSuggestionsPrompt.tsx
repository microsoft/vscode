/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptPiece, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { getLanguage } from '../../../util/common/languages';
import { SyncDescriptor } from '../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Selection } from '../../../vscodeTypes';
import { DefinitionAroundCursor, State as DefinitionAroundCursorState } from '../../prompt/node/definitionAroundCursor';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { LegacySafetyRules } from '../../prompts/node/base/safetyRules';
import { DefinitionAtPosition, State as DefinitionAtPositionState } from '../../prompts/node/panel/definitionAtPosition';

type Props = PromptElementProps<{

	/** Document rename happening in */
	document: TextDocumentSnapshot;

	/** Range corresponding to the symbol that's being renamed */
	range: vscode.Range;
}>;

type State = {
	defAtPositionState: DefinitionAtPositionState;
	defAroundCursorState: DefinitionAroundCursorState | undefined;
};

export class RenameSuggestionsPrompt extends PromptElement<Props, State> {

	private readonly _defAtPos: DefinitionAtPosition;
	private _defAroundCursor: DefinitionAroundCursor | undefined;

	constructor(
		props: Props,
		@IInstantiationService private readonly instaService: IInstantiationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
	) {
		super(props);

		const { document, range } = this.props;

		this._defAtPos = instaService.createInstance(new SyncDescriptor(DefinitionAtPosition, [{ document, position: range.start }]));
	}

	override async prepare(sizing: PromptSizing, progress?: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart> | undefined, token?: vscode.CancellationToken | undefined): Promise<State> {

		const { document, range } = this.props;

		const defState = await this._defAtPos.prepare();

		const isDefinitionBeingRenamed = defState.k === 'found' && defState.definitions.some(def => def.excerptRange.contains(this.props.range));

		if (!isDefinitionBeingRenamed) {
			const endpointInfo = await this.endpointProvider.getChatEndpoint('copilot-fast');
			const documentContext: IDocumentContext = {
				document,
				fileIndentInfo: undefined,
				language: getLanguage(document.languageId),
				wholeRange: range,
				selection: new Selection(range.start, range.end),
			};
			this._defAroundCursor = this.instaService.createInstance(DefinitionAroundCursor, { documentContext, endpointInfo });
		}

		const state: State = {
			defAtPositionState: defState,
			defAroundCursorState: this._defAroundCursor ? await this._defAroundCursor.prepare(sizing) : undefined,
		};

		return state;
	}

	override render(state: State, sizing: PromptSizing): PromptPiece<any, any> | undefined {

		const { document, range } = this.props;

		const symbolName = document.getText(range);

		const prefix = extractIdentifierPrefix(symbolName);
		const instructionToKeepPrefix = prefix ? ` keeping prefix '${prefix}'` : '';

		const renderedDef = this._defAtPos.render(state.defAtPositionState, sizing);

		const renderedDefAroundCursor = state.defAroundCursorState !== undefined && this._defAroundCursor?.render(state.defAroundCursorState, sizing);

		return (
			<>
				<SystemMessage>
					You are a distinguished software engineer.<br />
					<LegacySafetyRules />
					You must reply with a JSON array of strings of at least four new names, e.g., `["first", "second", "third", "fourth"]`.<br />
					You must respect existing naming conventions{instructionToKeepPrefix}.
				</SystemMessage>
				{renderedDefAroundCursor}
				<UserMessage>
					{renderedDef !== undefined && <>
						{renderedDef}<br />
					</>}
					Think of the purpose of `{symbolName}` in the given code. Think of several names that reflect what `{symbolName}` is and what it does{instructionToKeepPrefix}. Follow existing naming conventions. Reply with a JSON array of strings of at least four new names for `{symbolName}`.
				</UserMessage>
			</>
		);
	}
}

/**
 * Extracts the prefix of an identifier. The prefix is defined as the leading sequence of dots, dollar signs, and underscores.
 *
 * @param identifier - The identifier to extract the prefix from.
 * @returns The prefix of the identifier, or undefined if no prefix is found.
 */
function extractIdentifierPrefix(identifier: string): string | undefined {
	const prefix = identifier.match(/^([\\.\\$\\_]+)/)?.[0];
	return prefix;
}
