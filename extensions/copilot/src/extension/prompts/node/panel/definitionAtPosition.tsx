/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptPiece, PromptSizing } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { isScenarioAutomation } from '../../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILanguageFeaturesService, isLocationLink } from '../../../../platform/languages/common/languageFeaturesService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { getWasmLanguage } from '../../../../platform/parser/node/treeSitterLanguages';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { getLanguage } from '../../../../util/common/languages';
import * as arrays from '../../../../util/vs/base/common/arrays';
import { ExtensionMode, Selection, Uri } from '../../../../vscodeTypes';
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

export type State =
	| {
		k: 'found';
		definitions: CodeExcerpt[];
	}
	| {
		/** Document should be ignored by Copilot */
		k: 'ignored';
	}
	;


/**
 * @remark Excludes definitions that are in copilot-ignored files.
 */
export class DefinitionAtPosition extends PromptElement<Props, State> {

	private static DEFAULT_TIMEOUT_MS = 200;

	constructor(
		props: Props,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IVSCodeExtensionContext private readonly _vscodeExtensionCtxService: IVSCodeExtensionContext,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@ILogService private readonly _logService: ILogService,
		@IParserService private readonly _parserService: IParserService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super(props);
	}

	override async prepare(): Promise<State> {
		if (await this._ignoreService.isCopilotIgnored(this.props.document.uri)) {
			return { k: 'ignored' };
		}

		const timeout = this._vscodeExtensionCtxService.extensionMode === ExtensionMode.Test && !isScenarioAutomation
			? 0
			: (this.props.timeoutMs === undefined ? DefinitionAtPosition.DEFAULT_TIMEOUT_MS : this.props.timeoutMs);

		const definitions = await this.findDefinition(timeout);

		this._logService.debug(`Found ${definitions.length} implementation(s)/definition(s)`);
		if (definitions.length > 0) {
			this._logService.debug(`Implementation(s)/definition(s) found:` + JSON.stringify(definitions, null, '\t'));
		}

		return {
			k: 'found',
			definitions
		};
	}

	override render(state: State, sizing: PromptSizing): PromptPiece<any, any> | undefined {

		if (state.k === 'ignored') {
			return <ignoredFiles value={[this.props.document.uri]} />;
		}

		const { document, position } = this.props;

		const { definitions } = state;

		if (definitions.length === 0) {
			const line = document.lineAt(position.line);
			definitions.push({
				languageId: document.languageId,
				uri: document.uri,
				code: line.text,
				excerptRange: line.range,
			});
		}

		return (
			<>
				Relevant definition{definitions.length > 1 ? 's' : ''}: <br />
				<br />
				{definitions.map(codeBlock => {
					const lineCommentStart = getLanguage(codeBlock.languageId).lineComment.start;
					const filePath = `${lineCommentStart} FILEPATH: ${codeBlock.uri.path}`;
					const code = `${filePath}\n${codeBlock.code}`;
					return (
						<CodeBlock uri={codeBlock.uri} languageId={codeBlock.languageId} code={code} />
					);
				})}
			</>
		);
	}


	private async findDefinition(timeoutMs: number): Promise<CodeExcerpt[]> {
		const { document, position } = this.props;

		// find implementation or, if not found, definition
		const findImplOrDefinition = async (position: vscode.Position) => {
			try {
				const impls = await this._languageFeaturesService.getImplementations(document.uri, position);

				this._logService.debug(`Found ${impls.length} implementations` + JSON.stringify(impls, null, '\t'));

				if (impls.length > 0) {
					return impls;
				}
			} catch { }

			try {
				const defs = await this._languageFeaturesService.getDefinitions(document.uri, position);

				this._logService.debug(`Found ${defs.length} definitions` + JSON.stringify(defs, null, '\t'));

				if (defs.length > 0) {
					return defs;
				}
			} catch { }

			this._logService.debug(`No definitions or implementations found`);

			return [];
		};

		const foundDefs = await asyncComputeWithTimeBudget(this._logService, this._telemetryService, document, timeoutMs * 3, () => findImplOrDefinition(position), []);

		const nonIgnoredDefs = arrays.coalesce(
			await Promise.all(
				foundDefs.map(async def => {
					const uri = isLocationLink(def) ? def.targetUri : document.uri;
					return await this._ignoreService.isCopilotIgnored(uri) ? undefined : def;
				})
			)
		);

		// since language service gives us only links to identifiers, expand to whole implementation/definition using tree-sitter

		return Promise.all(
			nonIgnoredDefs.map(async def => {

				const { uri, range } = isLocationLink(def) ? { uri: def.targetUri, range: def.targetRange } : def;

				const docContainingDef = await this._workspaceService.openTextDocumentAndSnapshot(uri);

				const wasmLanguage = getWasmLanguage(docContainingDef.languageId);

				let code: string;
				let excerptRange: vscode.Range;
				if (wasmLanguage === undefined) { // capture at least the line of the definition
					const line = docContainingDef.lineAt(range.start.line);
					code = line.text;
					excerptRange = line.range;
				} else {
					const nodeToDocument = await determineNodeToDocument(this._parserService, this._telemetryService, {
						document: docContainingDef,
						language: getLanguage(document.languageId),
						wholeRange: range,
						selection: new Selection(range.start, range.end),
						fileIndentInfo: undefined,
					});
					excerptRange = nodeToDocument.range;
					code = docContainingDef.getText(excerptRange);
				}

				return {
					languageId: docContainingDef.languageId,
					uri: docContainingDef.uri,
					code,
					excerptRange,
				} satisfies CodeExcerpt;
			})
		);
	}
}
