/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptPiece, PromptReference, PromptSizing } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { isScenarioAutomation } from '../../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILanguageFeaturesService } from '../../../../platform/languages/common/languageFeaturesService';
import { ILogService } from '../../../../platform/log/common/logService';
import { TreeSitterOffsetRange } from '../../../../platform/parser/node/nodes';
import { IParserService, treeSitterOffsetRangeToVSCodeRange, vscodeToTreeSitterOffsetRange } from '../../../../platform/parser/node/parserService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { getLanguage } from '../../../../util/common/languages';
import { ExtensionMode, Location, Selection, Uri } from '../../../../vscodeTypes';
import { asyncComputeWithTimeBudget } from '../../../context/node/resolvers/selectionContextHelpers';
import { determineNodeToDocument } from '../../../prompt/node/definitionAroundCursor';
import { CodeBlock } from './safeElements';

type Props = PromptElementProps<{
	document: TextDocumentSnapshot;
	/**
	 * Range of interest for which definitions are to be found.
	 * @remark if not provided, will use active selection in currently active editor
	 */
	position: vscode.Position;
	/**
	 * Timeout for finding implementations in milliseconds. Defaults to 200ms.
	 */
	timeoutMs?: number;
}>;

type CodeExcerpt = {
	languageId: string;
	uri: Uri;
	code: string;
	excerptRange: vscode.Range;
};

/**
 * @remark Excludes references that are in copilot-ignored files.
 */
export class ReferencesAtPosition extends PromptElement<Props> {
	private static DEFAULT_TIMEOUT_MS = 200;

	constructor(
		props: Props,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ILogService private readonly logService: ILogService,
		@IParserService private readonly parserService: IParserService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		if (await this.ignoreService.isCopilotIgnored(this.props.document.uri)) {
			return <ignoredFiles value={[this.props.document.uri]} />;
		}

		const timeout = this.extensionContext.extensionMode === ExtensionMode.Test && !isScenarioAutomation
			? 0
			: (this.props.timeoutMs === undefined ? ReferencesAtPosition.DEFAULT_TIMEOUT_MS : this.props.timeoutMs);

		const [definitions, usages] = await this.findReferences(timeout);

		this.logService.debug(`Found ${definitions.length} implementation(s)/definition(s), ${usages.length} usages`);
		if (definitions.length > 0) {
			this.logService.debug(`Implementation(s)/definition(s) found:` + JSON.stringify(definitions, null, '\t'));
		}
		if (usages.length > 0) {
			this.logService.debug(`Usages found:` + JSON.stringify(usages, null, '\t'));
		}

		return (
			<>
				{this.renderCodeExcerpts(`Relevant definition${definitions.length > 1 ? 's' : ''}:`, definitions)}
				{this.renderCodeExcerpts(`Other usages:`, usages)}
			</>
		);
	}

	private renderCodeExcerpts(title: string, excerts: CodeExcerpt[]): PromptPiece<any, any> | undefined {
		if (excerts.length > 0) {
			return (
				<>
					{title}<br /><br />
					{excerts.map(excerpt => {
						const lineCommentStart = getLanguage(excerpt.languageId).lineComment.start;
						const filePath = `${lineCommentStart} FILEPATH: ${excerpt.uri.path}`;
						const code = `${filePath}\n${excerpt.code}`;
						return (
							<CodeBlock uri={excerpt.uri} languageId={excerpt.languageId} code={code} references={[new PromptReference(new Location(excerpt.uri, excerpt.excerptRange))]} />
						);
					})}
					<br /><br />
				</>
			);
		}
		return undefined;
	}

	private async findReferences(timeoutMs: number): Promise<[CodeExcerpt[], CodeExcerpt[]]> {
		const { document, position } = this.props;

		const findReference = async () => {
			try {
				const refs = await this.languageFeaturesService.getReferences(document.uri, position);
				this.logService.debug(`Found ${refs.length} references: ` + JSON.stringify(refs, null, '\t'));
				return refs;
			} catch (e) {
				return [];
			}
		};

		const foundRefs = await asyncComputeWithTimeBudget(this.logService, this.telemetryService, document, timeoutMs * 3, findReference, []);

		const nonIgnoredDefs = [];
		const nonIgnoredRefs = [];
		for (const ref of foundRefs) {
			if (await this.ignoreService.isCopilotIgnored(ref.uri)) {
				continue;
			}

			const docContainingRef = await this.workspaceService.openTextDocumentAndSnapshot(ref.uri);
			const treeSitterAST = this.parserService.getTreeSitterAST(docContainingRef);
			if (!treeSitterAST) {
				continue;
			}

			const range = vscodeToTreeSitterOffsetRange(ref.range, docContainingRef);
			const calls = await treeSitterAST.getCallExpressions(range);
			const functions = await treeSitterAST.getFunctionDefinitions();
			if (calls.length > 0) {
				nonIgnoredRefs.push({
					languageId: docContainingRef.languageId,
					uri: docContainingRef.uri,
					code: calls[0].text,
					excerptRange: treeSitterOffsetRangeToVSCodeRange(docContainingRef, calls[0]),
				} as CodeExcerpt);
			} else if (functions.some(f => TreeSitterOffsetRange.doIntersect(f, range))) {
				// since language service gives us only links to identifiers, expand to whole implementation/definition using tree-sitter
				const nodeToDocument = await determineNodeToDocument(this.parserService, this.telemetryService, {
					document: docContainingRef,
					language: getLanguage(document.languageId),
					wholeRange: ref.range,
					selection: new Selection(ref.range.start, ref.range.end),
					fileIndentInfo: undefined,
				});
				const excerptRange = nodeToDocument.range;
				nonIgnoredDefs.push({
					languageId: docContainingRef.languageId,
					uri: docContainingRef.uri,
					code: docContainingRef.getText(excerptRange),
					excerptRange,
				} satisfies CodeExcerpt);
			}
		}
		return [nonIgnoredDefs, nonIgnoredRefs];
	}
}
