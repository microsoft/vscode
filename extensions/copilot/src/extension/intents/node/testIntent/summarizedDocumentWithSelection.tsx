/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptSizing, Raw } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { VsCodeTextDocument } from '../../../../platform/editing/common/abstractText';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../../platform/log/common/logService';
import { OverlayNode } from '../../../../platform/parser/node/nodes';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { isFalsyOrWhitespace } from '../../../../util/vs/base/common/strings';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { ServicesAccessor } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { getStructure } from '../../../context/node/resolvers/selectionContextHelpers';
import { PromptMetadata } from '../../../prompt/common/conversation';
import { EarlyStopping, LeadingMarkdownStreaming, ReplyInterpreter, ReplyInterpreterMetaData } from '../../../prompt/node/intents';
import { TextPieceClassifiers } from '../../../prompt/node/streamingEdits';
import { Tag } from '../../../prompts/node/base/tag';
import { getAdjustedSelection } from '../../../prompts/node/inline/adjustSelection';
import { MarkdownBlock } from '../../../prompts/node/inline/inlineChatGenerateMarkdownPrompt';
import { SummarizedDocumentSplit } from '../../../prompts/node/inline/promptingSummarizedDocument';
import { getCharLimit, summarizeDocumentSync } from '../../../prompts/node/inline/summarizedDocument/summarizeDocumentHelpers';
import { CodeBlock, Uri, UriMode } from '../../../prompts/node/panel/safeElements';


export enum SelectionSplitKind {
	Adjusted,
	OriginalEnd,
}

function isServiceAccessor(obj: any): obj is ServicesAccessor {
	return obj !== null && typeof obj === 'object' && typeof obj.get === 'function';
}

export class SummarizedDocumentData {

	/**
	 * Create new summarized document data that is be used for the `SummarizedDocumentWithSelection`-element,
	 * the data should also be used for other parts of the prompt, e.g to know if there is selected code, etc pp
	 *
	 * @param document the document to summarize
	 * @param formattingOptions (optional) formatting options
	 * @param selection The selection or whole range
	 * @param selectionSplitKind Split around adjusted or original selection.
	 * @returns
	 */
	static async create(
		parserService: IParserService | ServicesAccessor,
		document: TextDocumentSnapshot,
		formattingOptions: vscode.FormattingOptions | undefined,
		selection: vscode.Range,
		selectionSplitKind: SelectionSplitKind,
	): Promise<SummarizedDocumentData> {

		if (isServiceAccessor(parserService)) {
			parserService = parserService.get(IParserService);
		}

		const structure = await getStructure(parserService, document, formattingOptions);
		selection = document.validateRange(selection);
		const offsetSelections = getAdjustedSelection(structure, new VsCodeTextDocument(document), selection);
		return new SummarizedDocumentData(document, formattingOptions, structure, selection, offsetSelections, selectionSplitKind);
	}

	readonly hasCodeWithoutSelection: boolean;
	readonly hasContent: boolean;
	readonly placeholderText: string;

	private constructor(
		readonly document: TextDocumentSnapshot,
		private readonly formattingOptions: vscode.FormattingOptions | undefined,
		private readonly structure: OverlayNode,
		private readonly selection: vscode.Range,
		readonly offsetSelections: { adjusted: OffsetRange; original: OffsetRange },
		private readonly kind: SelectionSplitKind,
	) {

		const offsetSelection = kind === SelectionSplitKind.Adjusted
			? offsetSelections.adjusted
			: offsetSelections.original;

		const text = document.getText();
		const codeSelected = text.substring(offsetSelection.start, offsetSelection.endExclusive);
		const codeAbove = text.substring(0, offsetSelection.start);
		const codeBelow = text.substring(offsetSelection.endExclusive);

		this.hasCodeWithoutSelection = codeAbove.trim().length > 0 || codeBelow.trim().length > 0;
		this.hasContent = codeSelected.trim().length > 0 || codeAbove.trim().length > 0 || codeBelow.trim().length > 0;
		this.placeholderText = offsetSelection.isEmpty ? '$PLACEHOLDER$' : '$SELECTION_PLACEHOLDER$';
	}

	summarizeDocument(tokenBudget: number): SummarizedDocumentSplit {

		const doc = summarizeDocumentSync(
			getCharLimit(tokenBudget),
			this.document,
			this.selection,
			this.structure
		);

		let selection: OffsetRange;
		if (this.kind === SelectionSplitKind.Adjusted) {
			selection = doc.projectOffsetRange(this.offsetSelections.adjusted);
		} else {
			selection = doc.projectOffsetRange(new OffsetRange(this.offsetSelections.original.endExclusive, this.offsetSelections.original.endExclusive));
		}

		return new SummarizedDocumentSplit(
			doc,
			this.document.uri,
			this.formattingOptions,
			selection
		);
	}
}

export type SummarizedDocumentWithSelectionProps = PromptElementProps<{

	/**
	 * The summarized document data to render.
	 * @see {SummarizedDocumentData.create}
	 */
	documentData: SummarizedDocumentData;

	/**
	 * The token budget to use for summarization.
	 *
	 * If set to 'usePromptSizingBudget', the token budget will be read from the component's `PromptSizing` budget, which is updated only when `flex*` props are used.
	 * So we allow just passing a number here.
	 */
	tokenBudget: number | 'usePromptSizingBudget';

	/**
	 * Optional function to create a custom `ReplyInterpreter` for the split document.
	 */
	createReplyInterpreter?: (splitDoc: SummarizedDocumentSplit) => ReplyInterpreter;

	_allowEmptySelection?: boolean;
}>;

export class SummarizedDocumentSplitMetadata extends PromptMetadata {
	constructor(
		readonly split: SummarizedDocumentSplit,
	) {
		super();
	}
}

export class SummarizedDocumentWithSelection extends PromptElement<SummarizedDocumentWithSelectionProps> {

	constructor(
		props: SummarizedDocumentWithSelectionProps,
		@ILogService private readonly logger: ILogService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
	) {
		super(props);
	}

	override async render(_state: void, sizing: PromptSizing) {

		const { createReplyInterpreter, documentData } = this.props;
		const isIgnored = await this.ignoreService.isCopilotIgnored(documentData.document.uri);

		if (isIgnored) {
			return <ignoredFiles value={[documentData.document.uri]} />;
		}

		let { tokenBudget } = this.props;
		if (tokenBudget === 'usePromptSizingBudget') {
			// some hard coded value to account for the message padding below,
			// e.g the placeholder message, the path, etc
			tokenBudget = (sizing.tokenBudget * .85) - 300;
		}

		let splitDoc = documentData.summarizeDocument(tokenBudget);
		for (let tries = 0; tries < 5; tries++) {
			const text = splitDoc.codeAbove + splitDoc.codeSelected + splitDoc.codeBelow;
			const actualTokens = await sizing.countTokens({ type: Raw.ChatCompletionContentPartKind.Text, text });
			if (actualTokens <= tokenBudget) {
				break;
			}
			tokenBudget *= 0.85;
			splitDoc = documentData.summarizeDocument(tokenBudget);
		}

		this.logger.info(`Summarized doc to fit token budget (${tokenBudget} / ${sizing.endpoint.modelMaxPromptTokens}): ${splitDoc.codeAbove.length} + ${splitDoc.codeSelected.length} + ${splitDoc.codeBelow.length}`);

		const { uri, languageId } = documentData.document;

		const isMarkdown = languageId === 'markdown';
		const type = isMarkdown ? 'markdown' : 'code';

		const { codeAbove, codeSelected, codeBelow, hasCodeWithoutSelection, hasContent } = splitDoc;

		const codeWithoutSelection = `${codeAbove}${documentData.placeholderText}${codeBelow}`;

		const replyInterpreter = createReplyInterpreter
			? createReplyInterpreter(splitDoc)
			: splitDoc.createReplyInterpreter(
				LeadingMarkdownStreaming.Mute,
				EarlyStopping.StopAfterFirstCodeBlock,
				splitDoc.replaceSelectionStreaming,
				TextPieceClassifiers.createCodeBlockClassifier(),
				line => line.value.trim() !== documentData.placeholderText
			);

		return (<Tag name='currentDocument'>
			<meta value={new ReplyInterpreterMetaData(replyInterpreter)} />
			<meta value={new SummarizedDocumentSplitMetadata(splitDoc)} />
			{!hasContent && <>I am in an empty file `<Uri value={uri} mode={UriMode.Path} />`.</>}
			{hasContent && <>I have the following {type} in a file called `<Uri value={uri} mode={UriMode.Path} />`:<br /></>}
			{(!isMarkdown && hasCodeWithoutSelection) && <><CodeBlock uri={uri} languageId={languageId} code={codeWithoutSelection} shouldTrim={false} /><br /></>}
			{(isMarkdown && hasCodeWithoutSelection) && <><MarkdownBlock uri={uri} code={codeWithoutSelection} /><br /></>}
			{
				(!isFalsyOrWhitespace(codeSelected) || this.props._allowEmptySelection) &&
				<Tag name='selection'>
					{(!isMarkdown && hasCodeWithoutSelection) && <>The {documentData.placeholderText} code is:<br /></>}
					{(isMarkdown && hasCodeWithoutSelection) && <>I need your help with the following content:</>}
					{!isMarkdown && <CodeBlock uri={uri} languageId={languageId} code={codeSelected} shouldTrim={false} />}
					{isMarkdown && <MarkdownBlock uri={uri} code={codeSelected} />}
				</Tag>
			}
		</Tag>);
	}
}
