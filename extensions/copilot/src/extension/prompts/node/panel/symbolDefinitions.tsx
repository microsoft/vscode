/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptPiece, PromptSizing, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { isScenarioAutomation } from '../../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILanguageFeaturesService } from '../../../../platform/languages/common/languageFeaturesService';
import { ILogService } from '../../../../platform/log/common/logService';
import { TreeSitterExpressionInfo, TreeSitterExpressionLocationInfo } from '../../../../platform/parser/node/nodes';
import { IParserService, treeSitterOffsetRangeToVSCodeRange } from '../../../../platform/parser/node/parserService';
import { ITabsAndEditorsService } from '../../../../platform/tabs/common/tabsAndEditorsService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { ExtensionMode, Location, Uri } from '../../../../vscodeTypes';
import { findAllReferencedClassDeclarationsInSelection, findAllReferencedFunctionImplementationsInSelection, findAllReferencedTypeDeclarationsInSelection } from '../../../context/node/resolvers/selectionContextHelpers';
import { PromptReference } from '../../../prompt/common/conversation';
import { EmbeddedInsideUserMessage, embeddedInsideUserMessageDefault } from '../base/promptElement';
import { Tag } from '../base/tag';
import { CodeBlock } from './safeElements';

type Props = PromptElementProps<EmbeddedInsideUserMessage & {
	// We want this upfront if possible because these could change during async prompt rendering
	document?: TextDocumentSnapshot;
	/**
	 * Range of interest for which definitions are to be found.
	 * @remark if not provided, will use active selection in currently active editor
	 */
	range?: vscode.Range;
	/**
	 * Timeout for finding implementations in milliseconds. Defaults to 200ms.
	 */
	timeoutMs?: number;
}>;

interface State {
	activeDocument: TextDocumentSnapshot | undefined;
	isIgnored: boolean;
	implementations: [/* header/description */ string, TreeSitterExpressionLocationInfo[]][];
}

export class SymbolDefinitions extends PromptElement<Props, State> {

	private static DEFAULT_TIMEOUT_MS = 200;

	constructor(
		props: Props,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@IParserService private readonly parserService: IParserService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) {
		super(props);
	}

	override async prepare(): Promise<State> {
		const emptyState: State = { implementations: [], activeDocument: undefined, isIgnored: false };

		let { document: activeDocument, range: selection } = this.props;

		if (!activeDocument) {
			const activeEditor = this.tabsAndEditorsService.activeTextEditor;
			if (!activeEditor) {
				return emptyState;
			}
			activeDocument ??= TextDocumentSnapshot.create(activeEditor.document);
			selection ??= activeEditor.selection;
		}

		if (!selection || selection.isEmpty) {
			return emptyState;
		}

		if (await this.ignoreService.isCopilotIgnored(activeDocument.uri)) {
			return { ...emptyState, isIgnored: true };
		}

		const timeout = this.extensionContext.extensionMode === ExtensionMode.Test && !isScenarioAutomation
			? 0
			: (this.props.timeoutMs === undefined ? SymbolDefinitions.DEFAULT_TIMEOUT_MS : this.props.timeoutMs);

		const refFinders = [
			{ header: 'Relevant function implementations', findImpls: findAllReferencedFunctionImplementationsInSelection },
			{ header: 'Relevant class declarations', findImpls: findAllReferencedClassDeclarationsInSelection },
			{ header: 'Relevant type declarations', findImpls: findAllReferencedTypeDeclarationsInSelection }
		];

		const implementations: [string, TreeSitterExpressionInfo[]][] = [];
		for (const { header, findImpls } of refFinders) {
			const impls = await findImpls(this.parserService, this.logService, this.telemetryService, this.languageFeaturesService, this.workspaceService, activeDocument, selection, timeout);
			implementations.push([header, impls]);
		}
		return { implementations, activeDocument, isIgnored: false };
	}

	override render(state: State, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		if (!state.implementations.length || !state.activeDocument) {
			return;
		}

		const activeDocumentUri = state.activeDocument.uri;
		if (state.isIgnored) {
			return <ignoredFiles value={[activeDocumentUri]} />;
		}

		const combinedElements: UserMessage[] = [];

		for (const [header, implementations] of state.implementations) {
			const { references, text, uris } = treeSitterInfoToContext(state.activeDocument, implementations);
			if (text.length === 0) {
				continue;
			}

			const elements = (
				<>
					{header}:<br />
					<br />
					{text.map((t, i) => <>
						<CodeBlock code={t} languageId={state.activeDocument?.languageId} uri={uris[i]} references={[references[i]]} />
						<br />
					</>)}
				</>
			);
			const msg = this.props.embeddedInsideUserMessage ?? embeddedInsideUserMessageDefault ? (
				<Tag name='symbolDefinitions' priority={this.props.priority}>
					{elements}
				</Tag>
			) : (
				<UserMessage priority={this.props.priority}>
					{elements}
				</UserMessage>
			);

			combinedElements.push(msg);
		}

		return (<>
			{...combinedElements}
		</>);
	}
}

export function treeSitterInfoToContext(activeDocument: TextDocumentSnapshot, info: TreeSitterExpressionLocationInfo[]) {
	const references = [];
	const seenReferences = new Set<string>();
	const text: string[] = [];
	const uris: Uri[] = [];
	for (const impl of info) {
		const uri = impl.uri ?? activeDocument.uri;
		const range = impl.range ?? treeSitterOffsetRangeToVSCodeRange(activeDocument, impl);
		const key = `${uri.toString()}-${range.start.line}-${range.start.character}-${range.end.line}-${range.end.character}`;
		if (seenReferences.has(key)) {
			continue;
		}
		seenReferences.add(key);

		references.push(new PromptReference(new Location(uri, range)));
		text.push(impl.text);
		uris.push(uri);
	}
	return { references, text, uris };
}
