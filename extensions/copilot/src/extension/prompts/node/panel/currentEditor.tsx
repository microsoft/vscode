/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptSizing, UserMessage } from '@vscode/prompt-tsx';
import type { NotebookEditor, TextEditor } from 'vscode';
import { NotebookDocumentSnapshot } from '../../../../platform/editing/common/notebookDocumentSnapshot';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { IAlternativeNotebookContentService } from '../../../../platform/notebook/common/alternativeContent';
import { ITabsAndEditorsService } from '../../../../platform/tabs/common/tabsAndEditorsService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { findCell, findNotebook } from '../../../../util/common/notebooks';
import { Schemas } from '../../../../util/vs/base/common/network';
import * as path from '../../../../util/vs/base/common/path';
import { Position, Range } from '../../../../vscodeTypes';
import { PromptReference } from '../../../prompt/common/conversation';
import { IPromptEndpoint } from '../base/promptRenderer';
import { CodeBlock } from './safeElements';

export interface CurrentEditorPromptProps extends BasePromptElementProps {
}

export class CurrentEditor extends PromptElement<CurrentEditorPromptProps> {
	constructor(
		props: CurrentEditorPromptProps,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@ITabsAndEditorsService private readonly _tabsAndEditorsService: ITabsAndEditorsService,
		@IAlternativeNotebookContentService private readonly _alternativeNotebookContentService: IAlternativeNotebookContentService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IPromptEndpoint private readonly _promptEndpoint: IPromptEndpoint,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const editor = this._tabsAndEditorsService.activeTextEditor;
		if (editor) {
			// TODO@DonJayamanne, need to figure out places relying on this and how its used.
			// E.g. if problems were using this, then we need to translate positions in problems as well, & the like.
			// return editor.document.uri.scheme === Schemas.vscodeNotebookCell ?
			// 	this.renderActiveNotebookCellEditor(editor) :
			// 	this.renderActiveTextEditor(editor);
			return this.renderActiveTextEditor(editor);
		}

		const notebookEditor = this._tabsAndEditorsService.activeNotebookEditor;
		if (notebookEditor) {
			return this.renderActiveNotebookEditor(notebookEditor);
		}
		return undefined;
	}

	async renderActiveTextEditor(editor: TextEditor) {
		const ranges = editor.visibleRanges;
		const document = editor.document;

		const isIgnored = await this._ignoreService.isCopilotIgnored(document.uri);
		if (isIgnored) {
			return <ignoredFiles value={[document.uri]} />;
		}

		if (document.getText().trim().length === 0) {
			// The document is empty or contains only whitespace
			return (<>
				<UserMessage priority={this.props.priority}>
					<references value={[new PromptReference(document.uri)]} />
					The active {document.languageId} file {path.basename(document.uri.path)} is empty.
				</UserMessage >
			</>);
		}

		if (ranges.length === 0) {
			return undefined;
		}

		return (<>
			<UserMessage priority={this.props.priority}>
				{ranges.map(range => (
					<>
						Excerpt from active file {path.basename(document.uri.path)}, lines {range.start.line + 1} to {range.end.line + 1}:<br />
						<CodeBlock code={document.getText(range)} languageId={document.languageId} uri={document.uri} references={[new PromptReference({ uri: document.uri, range })]} />
						<br />
						<br />
					</>
				))}
			</UserMessage >
		</>);
	}

	async renderActiveNotebookCellEditor(editor: TextEditor) {
		if (editor.document.uri.scheme !== Schemas.vscodeNotebookCell) {
			return;
		}
		const notebook = findNotebook(editor.document.uri, this._workspaceService.notebookDocuments);
		const cellIndex = notebook && findCell(editor.document.uri, notebook)?.index;
		if (!notebook || typeof cellIndex === 'undefined' || cellIndex < 0) {
			return;
		}
		const format = this._alternativeNotebookContentService.getFormat(this._promptEndpoint);
		const document = NotebookDocumentSnapshot.create(notebook, format);
		const isIgnored = await this._ignoreService.isCopilotIgnored(document.uri);
		if (isIgnored) {
			return <ignoredFiles value={[document.uri]} />;
		}

		if (document.getText().trim().length === 0) {
			// The document is empty or contains only whitespace
			return (<>
				<UserMessage priority={this.props.priority}>
					<references value={[new PromptReference(document.uri)]} />
					The active {document.languageId} file {path.basename(document.uri.path)} is empty.
				</UserMessage >
			</>);
		}

		if (editor.visibleRanges.length === 0) {
			return undefined;
		}
		const altDocument = this._alternativeNotebookContentService.create(format).getAlternativeDocument(notebook);
		const cell = notebook.cellAt(cellIndex);
		const ranges = editor.visibleRanges.map(range => {
			const start = altDocument.fromCellPosition(cell, range.start);
			const end = altDocument.fromCellPosition(cell, range.end);
			return new Range(start, end);
		});

		return (<>
			<UserMessage priority={this.props.priority}>
				{ranges.map(range => (
					<>
						Excerpt from active file {path.basename(document.uri.path)}, lines {range.start.line + 1} to {range.end.line + 1}:<br />
						<CodeBlock code={document.getText(range)} languageId={document.languageId} uri={document.uri} references={[new PromptReference({ uri: document.uri, range })]} />
						<br />
						<br />
					</>
				))}
			</UserMessage >
		</>);
	}

	async renderActiveNotebookEditor(editor: NotebookEditor) {
		const notebookRanges = editor.visibleRanges;
		const format = this._alternativeNotebookContentService.getFormat(this._promptEndpoint);
		const document = NotebookDocumentSnapshot.create(editor.notebook, format);
		const isIgnored = await this._ignoreService.isCopilotIgnored(document.uri);
		if (isIgnored) {
			return <ignoredFiles value={[document.uri]} />;
		}

		if (document.getText().trim().length === 0) {
			// The document is empty or contains only whitespace
			return (<>
				<UserMessage priority={this.props.priority}>
					<references value={[new PromptReference(document.uri)]} />
					The active {document.languageId} file {path.basename(document.uri.path)} is empty.
				</UserMessage >
			</>);
		}

		if (notebookRanges.length === 0) {
			return undefined;
		}
		const altDocument = this._alternativeNotebookContentService.create(format).getAlternativeDocument(editor.notebook);
		const ranges = notebookRanges.map(range => {
			const cell = editor.notebook.cellAt(range.start);
			const lastLine = cell.document.lineAt(cell.document.lineCount - 1);
			const start = altDocument.fromCellPosition(cell, new Position(0, 0));
			const end = altDocument.fromCellPosition(cell, lastLine.range.end);
			return new Range(start, end);
		});

		return (<>
			<UserMessage priority={this.props.priority}>
				{ranges.map(range => (
					<>
						Excerpt from active file {path.basename(document.uri.path)}, lines {range.start.line + 1} to {range.end.line + 1}:<br />
						<CodeBlock code={document.getText(range)} languageId={document.languageId} uri={document.uri} references={[new PromptReference({ uri: document.uri, range })]} />
						<br />
						<br />
					</>
				))}
			</UserMessage >
		</>);
	}
}
