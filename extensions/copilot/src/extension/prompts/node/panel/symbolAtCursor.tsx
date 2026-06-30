/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PrioritizedList, PromptElement, PromptPiece, PromptSizing, UserMessage } from '@vscode/prompt-tsx';
import type { CancellationToken, ChatResponseReferencePart, Progress, Uri } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILanguageFeaturesService, isLocationLink } from '../../../../platform/languages/common/languageFeaturesService';
import { TreeSitterExpressionLocationInfo } from '../../../../platform/parser/node/nodes';
import { IParserService, treeSitterOffsetRangeToVSCodeRange, vscodeToTreeSitterOffsetRange } from '../../../../platform/parser/node/parserService';
import { IScopeSelector } from '../../../../platform/scopeSelection/common/scopeSelection';
import { ITabsAndEditorsService } from '../../../../platform/tabs/common/tabsAndEditorsService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { basename } from '../../../../util/vs/base/common/path';
import { ChatResponseProgressPart, Range, Selection } from '../../../../vscodeTypes';
import { CodeBlock } from './safeElements';
import { treeSitterInfoToContext } from './symbolDefinitions';

export interface SymbolAtCursorProps extends BasePromptElementProps {
	document?: TextDocumentSnapshot;
	selection?: Selection;
	priority: number;
}

export type SelectedScope = {
	symbolAtCursorState: SymbolAtCursorState;
	definition?: {
		identifier: string | undefined;
		text: string;
		range: Range;
		uri: Uri;
		startIndex: number;
		endIndex: number;
	};
	symbolAtCursor?: {
		selectedText: string;
		document: TextDocumentSnapshot;
		range: Range;
	};
} | undefined;

type SymbolAtCursorState = {
	document: TextDocumentSnapshot;
	range: Range;
	codeAtCursor: string;
	definitions: TreeSitterExpressionLocationInfo[];
	references: TreeSitterExpressionLocationInfo[];
} | undefined;

export class SymbolAtCursor extends PromptElement<SymbolAtCursorProps, SymbolAtCursorState> {

	constructor(
		props: SymbolAtCursorProps,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITabsAndEditorsService private readonly _tabsAndEditorsService: ITabsAndEditorsService,
		@IScopeSelector private readonly _scopeSelector: IScopeSelector,
		@IParserService private readonly _parserService: IParserService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
		super(props);
	}

	private static getSymbolAtCursor(tabsAndEditorsService: ITabsAndEditorsService, props: Omit<SymbolAtCursorProps, 'priority'>): {
		selectedText: string;
		document: TextDocumentSnapshot;
		range: Range;
	} | undefined {
		let { selection, document } = props;

		// If not provided, fall back to the active editor
		if (!selection || !document) {
			const editor = tabsAndEditorsService.activeTextEditor;
			if (!editor) {
				return;
			}

			selection = editor.selection;
			document = TextDocumentSnapshot.create(editor.document);
		}

		// This component should not return anything if we have a real selection
		if (!selection.isEmpty) {
			return;
		}

		const range = document.getWordRangeAtPosition(selection.active) ?? selection;
		const selectedText = document.getText(range);
		return { selectedText, document, range };
	}

	static async getDefinitionAtRange(ignoreService: IIgnoreService, parserService: IParserService, document: TextDocumentSnapshot, range: Range, preferDefinitions: boolean) {
		const fileIsIgnored = await ignoreService.isCopilotIgnored(document.uri);
		if (fileIsIgnored) {
			return undefined;
		}

		const treeSitterAST = parserService.getTreeSitterAST(document);
		if (treeSitterAST === undefined) {
			return undefined;
		}

		const treeSitterOffsetRange = vscodeToTreeSitterOffsetRange(range, document);
		let nodeContext;
		if (preferDefinitions) {
			nodeContext = await treeSitterAST.getNodeToExplain(treeSitterOffsetRange);
		}
		nodeContext ??= await treeSitterAST.getNodeToDocument(treeSitterOffsetRange);
		const { startIndex, endIndex } = 'nodeToDocument' in nodeContext ? nodeContext.nodeToDocument : nodeContext.nodeToExplain;
		const expandedRange = treeSitterOffsetRangeToVSCodeRange(document, { startIndex, endIndex });

		return { identifier: nodeContext.nodeIdentifier, text: document.getText(expandedRange), range: expandedRange, uri: document.uri, startIndex, endIndex };
	}

	static async getSelectedScope(ignoreService: IIgnoreService, configurationService: IConfigurationService, tabsAndEditorsService: ITabsAndEditorsService, scopeSelector: IScopeSelector, parserService: IParserService, props: Omit<SymbolAtCursorProps, 'priority'>): Promise<SelectedScope> {
		if (!props.document || await ignoreService.isCopilotIgnored(props.document.uri)) {
			return undefined;
		}

		const symbolAtCursor = SymbolAtCursor.getSymbolAtCursor(tabsAndEditorsService, props);
		let symbolAtCursorState: SymbolAtCursorState | undefined;
		const definition = symbolAtCursor ? await SymbolAtCursor.getDefinitionAtRange(ignoreService, parserService, symbolAtCursor.document, symbolAtCursor.range, false) : undefined;
		const isExplicitScopeSelectionEnabled = configurationService.getConfig(ConfigKey.ExplainScopeSelection);
		if (isExplicitScopeSelectionEnabled || symbolAtCursor && (definition?.identifier !== symbolAtCursor.selectedText || !symbolAtCursor.selectedText)) {
			// The cursor wasn't somewhere that clearly indicates intent
			const editor = tabsAndEditorsService.activeTextEditor;
			if (!editor) {
				return;
			}
			const rangeOfEnclosingSymbol = await scopeSelector.selectEnclosingScope(editor, { reason: l10n.t('Select an enclosing range to explain'), includeBlocks: true });
			if (rangeOfEnclosingSymbol) {
				const document = TextDocumentSnapshot.create(editor.document);
				const definitionText = document.getText(rangeOfEnclosingSymbol);
				if (!definitionText) {
					return;
				}

				symbolAtCursorState = { codeAtCursor: definitionText, document, range: rangeOfEnclosingSymbol, definitions: [], references: [] };
			}
		}

		return { symbolAtCursorState, definition, symbolAtCursor };
	}

	override async prepare(sizing: PromptSizing, progress: Progress<ChatResponseReferencePart | ChatResponseProgressPart>, token: CancellationToken): Promise<SymbolAtCursorState> {
		const selectedScope = await SymbolAtCursor.getSelectedScope(this._ignoreService, this._configurationService, this._tabsAndEditorsService, this._scopeSelector, this._parserService, this.props).catch(() => undefined);
		if (!selectedScope) {
			return;
		}
		let { symbolAtCursorState, definition, symbolAtCursor } = selectedScope;
		if (!symbolAtCursor) {
			return;
		}

		if (definition?.identifier === symbolAtCursor?.selectedText) {
			// If the cursor is on a symbol reference, include the line of code that the cursor is on and the definition
			symbolAtCursorState ??= {
				codeAtCursor: definition.text,
				document: symbolAtCursor.document,
				range: definition.range,
				definitions: [],
				references: [],
			};
		} else {
			// Use the current line of code that the cursor is on
			symbolAtCursorState ??= {
				codeAtCursor: symbolAtCursor.document.lineAt(symbolAtCursor.range.start).text,
				document: symbolAtCursor.document,
				range: symbolAtCursor.document.lineAt(symbolAtCursor.range.start).range,
				definitions: [],
				references: []
			};
		}

		// Enrich symbol state with definitions
		progress.report(new ChatResponseProgressPart(l10n.t("Searching for relevant definitions...")));
		try {
			for (const link of await this._languageFeaturesService.getDefinitions(symbolAtCursor.document.uri, symbolAtCursor.range.start)) {
				const { uri, range } = isLocationLink(link) ? { uri: link.targetUri, range: link.targetRange } : link;
				if (range.isEqual(symbolAtCursor.range)) {
					continue;
				}
				const textDocument = await this._workspaceService.openTextDocumentAndSnapshot(uri);
				const definition = await SymbolAtCursor.getDefinitionAtRange(this._ignoreService, this._parserService, textDocument, range, true);
				if (definition) {
					symbolAtCursorState.definitions.push(definition);
				}
			}
		} catch { }

		// Enrich symbol state with references
		progress.report(new ChatResponseProgressPart(l10n.t("Searching for relevant references...")));
		try {
			const seenReferences = new Set<string>();
			for (const link of await this._languageFeaturesService.getReferences(symbolAtCursor.document.uri, symbolAtCursor.range.start)) {
				const { uri, range } = isLocationLink(link) ? { uri: link.targetUri, range: link.targetRange } : link;
				if (range.isEqual(symbolAtCursor.range)) {
					continue;
				}
				const key = `${uri.toString()}-${range.start.line}-${range.start.character}-${range.end.line}-${range.end.character}`;
				if (seenReferences.has(key)) {
					continue;
				}
				seenReferences.add(key);
				const textDocument = await this._workspaceService.openTextDocumentAndSnapshot(uri);
				const reference = await SymbolAtCursor.getDefinitionAtRange(this._ignoreService, this._parserService, textDocument, range, false);
				if (reference) {
					symbolAtCursorState.references.push(reference);
				}
			}
		} catch { }

		return symbolAtCursorState;
	}

	override render(state: SymbolAtCursorState, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		if (!state) {
			return;
		}

		// Include a reference for the code on the line that the cursor is on
		const info = [...state.definitions, ...state.references];
		if (state.codeAtCursor) {
			const { startIndex, endIndex } = vscodeToTreeSitterOffsetRange(state.range, state.document);
			info.push({ version: state.document.version, uri: state.document.uri, range: state.range, text: state.codeAtCursor, startIndex, endIndex });
		}

		const { references } = treeSitterInfoToContext(state.document, info);

		return (<>
			<references value={references} />
			<UserMessage>
				I have the following  code in the active editor:<br />
				<CodeBlock uri={state.document.uri} languageId={state.document.languageId} code={state.codeAtCursor} />
				<br />
				{Boolean(state.definitions.length) && <>Here are some relevant definitions for the symbols in my code:<br /></>}
				{Boolean(state.definitions.length) && <PrioritizedList priority={this.props.priority} descending={true}>{state.definitions.map(def => <CodeBlock uri={state.document.uri} languageId={state.document.languageId} code={def.text} />)}</PrioritizedList >}
				{/* Priority for references should be lower than priority for definitions */}
				{Boolean(state.references.length) && <><br />Here are some places where the the symbols in my code are referenced:<br /></>}
				{Boolean(state.references.length) &&
					<PrioritizedList priority={this.props.priority - state.definitions.length} descending={true}>
						{state.references.map(ref => <>
							{Boolean(ref.uri) && <>From the file {basename(ref.uri!.toString())}:<br /></>}
							<CodeBlock uri={state.document.uri} languageId={state.document.languageId} code={ref.text} /><br />
						</>)}
					</PrioritizedList>}
			</UserMessage>
		</>);
	}
}
