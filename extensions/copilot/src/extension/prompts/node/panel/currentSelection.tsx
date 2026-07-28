/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AssistantMessage, BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, UserMessage } from '@vscode/prompt-tsx';
import type { Range } from 'vscode';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../../platform/log/common/logService';
import { ITabsAndEditorsService } from '../../../../platform/tabs/common/tabsAndEditorsService';
import * as path from '../../../../util/vs/base/common/path';
import { Location } from '../../../../vscodeTypes';
import { PromptReference } from '../../../prompt/common/conversation';
import { CurrentEditor } from './currentEditor';
import { CodeBlock } from './safeElements';

interface CurrentSelectionProps extends BasePromptElementProps {
	document?: TextDocumentSnapshot;
	range?: Range;
	includeFilepath?: boolean;
}

interface CurrentSelectionState {
	exceedsTokenBudget: boolean;
	isIgnored: boolean;
}

export class CurrentSelection extends PromptElement<CurrentSelectionProps, CurrentSelectionState> {

	constructor(
		props: CurrentSelectionProps,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@ILogService private readonly logger: ILogService,
		@ITabsAndEditorsService private readonly _tabsAndEditorsService: ITabsAndEditorsService,
	) {
		super(props);
	}

	override async prepare(sizing: PromptSizing): Promise<CurrentSelectionState> {
		if (!this.props.document) {
			return { isIgnored: false, exceedsTokenBudget: false };
		}
		const isIgnored = await this.ignoreService.isCopilotIgnored(this.props.document.uri);

		let exceedsTokenBudget = false;
		const selection = CurrentSelection.getCurrentSelection(this._tabsAndEditorsService);
		if (selection && (await sizing.countTokens(selection?.selectedText)) * 1.1 > sizing.tokenBudget) {
			exceedsTokenBudget = true;
		}

		return { isIgnored, exceedsTokenBudget };
	}

	override render(state: CurrentSelectionState, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const selection = CurrentSelection.getCurrentSelection(this._tabsAndEditorsService);
		if (!selection) {
			return <CurrentEditor />;
		}

		const references = [new PromptReference(new Location(selection.activeDocument.uri, selection.range))];
		const urisUsed = [selection.activeDocument.uri];

		if (state.isIgnored) {
			return <ignoredFiles value={urisUsed} />;
		}
		if (state.exceedsTokenBudget) {
			this.logger.info(`Dropped current selection (${sizing.tokenBudget} / ${sizing.endpoint.modelMaxPromptTokens} tokens)`);
			return (<>
				<AssistantMessage priority={this.props.priority} name='selection-too-large'>
					Your active selection ({selection.fileName && <>{selection.selectedText.split('\n').length} lines from {path.basename(selection.fileName)}</>}) exceeded my maximum context size and was dropped. Please reduce the selection to the most relevant part.
				</AssistantMessage>
			</>);
		}

		return (<>
			<UserMessage priority={this.props.priority}>
				Active selection:<br />
				<br />
				<br />
				{selection.fileName && <>From the file: {path.basename(selection.fileName)}<br /></>}
				<CodeBlock code={selection.selectedText} languageId={selection.languageId} uri={selection.activeDocument.uri} references={references} />
				<br />
				<br />
			</UserMessage >
		</>);
	}

	static getCurrentSelection(tabsAndEditorsService: ITabsAndEditorsService, allowEmptySelection = false) {
		const editor = tabsAndEditorsService.activeTextEditor;
		const activeDocument = editor?.document;
		if (activeDocument) {
			const activeDocumentSelection = editor.selection;
			if (activeDocumentSelection && (!activeDocumentSelection.isEmpty
				|| activeDocumentSelection.isEmpty && allowEmptySelection)) {
				const languageId = activeDocument.languageId;
				const selectedText = activeDocument.getText(activeDocumentSelection);
				return {
					languageId,
					selectedText,
					activeDocument,
					range: activeDocumentSelection,
					fileName: activeDocument.fileName
				};
			}
		}
	}
}
