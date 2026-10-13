/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VsCodeTextDocument } from '../../../../../platform/editing/common/abstractText';
import { TextDocumentSnapshot } from '../../../../../platform/editing/common/textDocumentSnapshot';
import { OverlayNode } from '../../../../../platform/parser/node/nodes';
import { StringEdit } from '../../../../../util/vs/editor/common/core/edits/stringEdit';
import { Range } from '../../../../../vscodeTypes';
import { ICostFnFactory, IProjectedDocumentDebugInfo, ISummarizedDocumentSettings as ISummarizedDocumentSettingsImpl, RemovableNode, summarizeDocumentsSyncImpl } from './implementation';
import { ProjectedText } from './projectedText';

export type ISummarizedDocumentSettings = ISummarizedDocumentSettingsImpl<VsCodeTextDocument>;

export class ProjectedDocument extends ProjectedText {
	constructor(
		originalText: string,
		edits: StringEdit,
		public readonly languageId: string,
	) {
		super(originalText, edits);
	}
}

export interface IDocumentSummarizationItem {
	document: TextDocumentSnapshot;
	selection: Range | undefined;
	overlayNodeRoot: OverlayNode;
}

export { ICostFnFactory, RemovableNode };

export function summarizeDocumentsSync(
	charLimit: number,
	settings: ISummarizedDocumentSettings,
	items: IDocumentSummarizationItem[],
): ProjectedDocument[] {
	const result = summarizeDocumentsSyncImpl(charLimit, settings, items.map(i => ({
		document: new VsCodeTextDocument(i.document),
		selection: i.selection,
		overlayNodeRoot: i.overlayNodeRoot,
	})));
	return result.map(r => {
		const d = new ProjectedDocument(r.originalText, r.edits, r.baseDocument.languageId);
		(d as IProjectedDocumentDebugInfo).getVisualization = (r as IProjectedDocumentDebugInfo).getVisualization;
		return d;
	});
}
