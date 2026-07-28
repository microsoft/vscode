/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptPiece, PromptSizing, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { TreeSitterOffsetRange } from '../../../platform/parser/node/nodes';
import { NodeToDocumentContext } from '../../../platform/parser/node/parserImpl';
import { IParserService, treeSitterOffsetRangeToVSCodeRange as toRange, vscodeToTreeSitterOffsetRange as toTSOffsetRange } from '../../../platform/parser/node/parserService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { CodeContextRegion, CodeContextTracker } from '../../inlineChat/node/codeContextRegion';
import { IDocumentContext } from './documentContext';

export type Props = PromptElementProps<{
	documentContext: IDocumentContext;
	endpointInfo: IChatEndpoint;
	/** if not provided, the component will compute based on `documentContext` */
	nodeToDocument?: NodeToDocument;
}>;

export type State =
	| {
		k: 'found';
		nodeToDocument: NodeToDocument;
		codeExcerptToDocument: CodeContextRegion;
	}
	| {
		k: 'ignored';
	}
	;

export class DefinitionAroundCursor extends PromptElement<Props, State> {

	constructor(
		props: Props,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IParserService private readonly _parserService: IParserService,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
	) {
		super(props);
	}

	override async prepare(sizing: PromptSizing, progress?: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart> | undefined, token?: vscode.CancellationToken | undefined): Promise<State> {
		if (await this._ignoreService.isCopilotIgnored(this.props.documentContext.document.uri)) {
			return { k: 'ignored' };
		}
		const nodeToDocument = this.props.nodeToDocument ?? await determineNodeToDocument(this._parserService, this._telemetryService, this.props.documentContext);
		const contextInfo = generateDocContext(this.props.endpointInfo, this.props.documentContext, nodeToDocument.range);
		return {
			k: 'found',
			nodeToDocument,
			codeExcerptToDocument: contextInfo.range,
		};
	}

	override render(state: State, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		if (state.k === 'ignored') {
			return <ignoredFiles value={[this.props.documentContext.document.uri]} />;
		}
		const codeExcerpt = state.codeExcerptToDocument.generatePrompt().join('\n');
		return (
			<UserMessage>
				I have the following code in the selection:{codeExcerpt !== '' ? <br /> : ''}
				{state.codeExcerptToDocument.generatePrompt().join('\n')}
			</UserMessage>
		);
	}
}

export type NodeToDocument = {
	readonly range: vscode.Range;
	readonly identifier?: string;
};
export async function determineNodeToDocument(parserService: IParserService, telemetryService: ITelemetryService, ctx: IDocumentContext): Promise<{ range: vscode.Range; identifier?: string }> {

	const selectionRange = toTSOffsetRange(ctx.selection, ctx.document);

	const treeSitterAST = parserService.getTreeSitterAST(ctx.document);

	if (treeSitterAST === undefined) {
		return {
			range: ctx.wholeRange,
		};
	}

	const startTime = Date.now();
	const nodeToDocContext = await treeSitterAST.getNodeToDocument(selectionRange);
	const timeSpentMs = Date.now() - startTime;

	const wholeOffsetRange = toTSOffsetRange(ctx.wholeRange, ctx.document);
	sendNodeToDocumentTelemetry(telemetryService, selectionRange, wholeOffsetRange, nodeToDocContext, ctx.document.languageId, timeSpentMs);

	const rangeOfNodeToDocument = toRange(ctx.document, nodeToDocContext.nodeToDocument);
	return {
		identifier: nodeToDocContext.nodeIdentifier,
		range: rangeOfNodeToDocument,
	};
}
function generateDocContext(endpoint: IChatEndpoint, ctx: IDocumentContext, range: vscode.Range) {

	const tracker = new CodeContextTracker((endpoint.modelMaxPromptTokens * 4) / 3);
	const rangeInfo = new CodeContextRegion(tracker, ctx.document, ctx.language);

	// we only want to include the code that's being documented but we need `above` and `below` for the return value's type
	// so we just make these code regions empty
	const above = new CodeContextRegion(new CodeContextTracker(0), ctx.document, ctx.language);
	const below = new CodeContextRegion(new CodeContextTracker(0), ctx.document, ctx.language);

	for (let i = range.start.line, len = range.end.line; i <= len; ++i) {
		if ((i === len && range.end.character === 0) // we don't want to include the end line if it's (end.line, 0)
			|| !rangeInfo.appendLine(i) // didn't fit
		) {
			break;
		}
	}

	rangeInfo.trim(ctx.selection);

	return {
		language: ctx.language,
		above,
		range: rangeInfo,
		below,
	};
}
function sendNodeToDocumentTelemetry(
	telemetryService: ITelemetryService,
	selectionRange: TreeSitterOffsetRange,
	wholeOffsetRange: TreeSitterOffsetRange,
	nodeToDocContext: NodeToDocumentContext,
	languageId: string,
	timeSpentMs: number
) {

	/* __GDPR__
		"getNodeToDocument" : {
			"owner": "ulugbekna",
			"comment": "Info on success and properties of detecting AST node to document",
			"languageId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The language ID of the document" },
			"typeOfNodeToDocument": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Type of the AST node offered to be documented (type defined by tree-sitter grammar for that language)" },
			"nodeToDocumentStart": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Start offset of the AST node offered to be documented (type defined by tree-sitter grammar for that language)" },
			"nodeToDocumentEnd": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "End offset of the AST node offered to be documented (type defined by tree-sitter grammar for that language)" },
			"selectionOffsetRangeStart": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The start offset range of the selection in the document" },
			"selectionOffsetRangeEnd": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The end offset range of the selection in the document" },
			"wholeRangeOffsetRangeStart": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The start offset range of the inline-chat wholeRange" },
			"wholeRangeOffsetRangeEnd": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The end offset range of the inline-chat wholeRange" },
			"timeSpentMs": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time (in milliseconds) spent on finding the AST node to document (approximate as it's an async call)" }
		}
	*/
	telemetryService.sendMSFTTelemetryEvent('getNodeToDocument',
		{
			languageId,
			typeOfNodeToDocument: nodeToDocContext.nodeToDocument.type,
			nodeToDocumentStart: nodeToDocContext.nodeToDocument.startIndex.toString(),
			nodeToDocumentEnd: nodeToDocContext.nodeToDocument.endIndex.toString(),
			selectionOffsetRangeStart: selectionRange.startIndex.toString(),
			selectionOffsetRangeEnd: selectionRange.endIndex.toString(),
			wholeRangeOffsetRangeStart: wholeOffsetRange.startIndex.toString(),
			wholeRangeOffsetRangeEnd: wholeOffsetRange.endIndex.toString(),
		},
		{
			timeSpentMs,
		}
	);
}
