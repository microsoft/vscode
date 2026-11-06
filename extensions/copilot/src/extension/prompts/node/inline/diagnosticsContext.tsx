/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, PromptReference, PromptSizing } from '@vscode/prompt-tsx';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IParserService, treeSitterOffsetRangeToVSCodeRange, treeSitterToVSCodeRange, vscodeToTreeSitterOffsetRange, vscodeToTreeSitterRange } from '../../../../platform/parser/node/parserService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { Diagnostic, Location, Range, Uri } from '../../../../vscodeTypes';
import { asyncComputeWithTimeBudget } from '../../../context/node/resolvers/selectionContextHelpers';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { Tag } from '../base/tag';
import { ReferencesAtPosition } from '../panel/referencesAtPosition';
import { CodeBlock } from '../panel/safeElements';
import { ContextLocation, Cookbook, IFixCookbookService } from './fixCookbookService';

// #region Diagnostics

export type DiagnosticContext = Pick<IDocumentContext, 'document' | 'language'>;

interface DiagnosticsProps extends BasePromptElementProps {
	readonly documentContext: DiagnosticContext;
	readonly diagnostics: Diagnostic[];
	readonly includeRelatedInfos?: boolean;
}

const LINE_CONTEXT_MAX_SIZE = 200;
const RELATED_INFO_MAX_SIZE = 300;

export class Diagnostics extends PromptElement<DiagnosticsProps> {

	constructor(
		props: DiagnosticsProps,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IFixCookbookService private readonly fixCookbookService: IFixCookbookService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const { diagnostics, documentContext } = this.props;
		const isIgnored = await this.ignoreService.isCopilotIgnored(documentContext.document.uri);
		if (isIgnored) {
			return <ignoredFiles value={[documentContext.document.uri]} />;
		}

		return (
			diagnostics.length > 0 &&
			<>
				{
					diagnostics.map((d, idx) => {
						const cookbook = this.fixCookbookService.getCookbook(documentContext.language.languageId, d);
						return <>
							<DiagnosticDescription diagnostic={d} cookbook={cookbook} maxLength={LINE_CONTEXT_MAX_SIZE} documentContext={documentContext} />
							{this.props.includeRelatedInfos !== false && <DiagnosticRelatedInfo diagnostic={d} cookbook={cookbook} document={documentContext.document} />}
							<DiagnosticSuggestedFix cookbook={cookbook} />
						</>;
					})
				}
			</>
		);
	}
}
// #endregion Diagnostics

// #region DiagnosticDescription

interface DiagnosticDescriptionProps extends BasePromptElementProps {
	readonly documentContext: DiagnosticContext;
	readonly diagnostic: Diagnostic;
	readonly cookbook?: Cookbook;
	readonly maxLength: number;
}


class DiagnosticDescription extends PromptElement<DiagnosticDescriptionProps> {
	render(state: void, sizing: PromptSizing) {
		const d = this.props.diagnostic;
		const document = this.props.documentContext.document;
		const range = d.range;
		const content = document.getText(new Range(range.start.line, 0, range.end.line + 1, 0)).trimEnd();
		const code = (content.length > this.props.maxLength) ?
			content.slice(0, this.props.maxLength) + ' (truncated…)' :
			content;
		return <>
			{code
				? <>This code at line {range.start.line + 1}<br />
					<CodeBlock code={code} uri={document.uri} shouldTrim={false} /><br /></>
				: <>At line {range.start.line + 1}<br /></>}
			has the problem reported:<br />
			<Tag name='compileError'>
				{d.message}
			</Tag>
		</>;
	}
}

// #endregion DiagnosticDescription

// #region DiagnosticRelatedInfo

interface DiagnosticRelatedInfoProps extends BasePromptElementProps {
	readonly diagnostic: Diagnostic;
	readonly cookbook: Cookbook;
	readonly document: TextDocumentSnapshot;
}

type RelatedInfo = {
	readonly content: string;
	readonly uri: Uri;
	readonly range: Range;
};

interface DiagnosticRelatedInfoState {
	readonly infos: RelatedInfo[];
	readonly definitionRanges: Range[];
	readonly ignoredFiles: Uri[];
}

export class DiagnosticRelatedInfo extends PromptElement<DiagnosticRelatedInfoProps> {


	constructor(
		props: DiagnosticRelatedInfoProps,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IParserService private readonly parserService: IParserService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,

	) {
		super(props);
	}

	async render(_state: void, sizing: PromptSizing) {
		const { infos, ignoredFiles, definitionRanges } = await this.getRelatedInfos();
		if (!infos.length && !definitionRanges.length) {
			return <ignoredFiles value={ignoredFiles} />;
		}
		return <>
			This diagnostic has some related code:<br />
			{
				infos.map(info => <CodeBlock code={info.content} uri={info.uri} references={[new PromptReference(new Location(info.uri, info.range))]} includeFilepath={true} />)
			}
			{
				definitionRanges.map(range => <ReferencesAtPosition document={this.props.document} position={range.start} />)
			}
			<ignoredFiles value={ignoredFiles} />
		</>;
	}

	private async getRelatedInfos(): Promise<DiagnosticRelatedInfoState> {
		const infos: RelatedInfo[] = [];
		const definitionRanges: Range[] = [];
		const ignoredFiles: Uri[] = [];
		const diagnostic = this.props.diagnostic;

		if (diagnostic.relatedInformation) {
			for (const relatedInformation of diagnostic.relatedInformation) {
				try {
					const location = relatedInformation.location;
					if (await this.ignoreService.isCopilotIgnored(location.uri)) {
						ignoredFiles.push(location.uri);
						continue;
					}
					const document = await this.workspaceService.openTextDocument(location.uri);
					const locationRange = location.range;
					const treeSitterAST = this.parserService.getTreeSitterAST(document);
					let relatedCodeText: string | undefined;
					if (treeSitterAST) {
						const treeSitterLocationRange = vscodeToTreeSitterRange(locationRange);
						const rangeOfInterest = await treeSitterAST.getCoarseParentScope(treeSitterLocationRange);
						relatedCodeText = document.getText(treeSitterToVSCodeRange(rangeOfInterest));
					}
					if (!relatedCodeText || relatedCodeText.length > RELATED_INFO_MAX_SIZE) {
						relatedCodeText = document.getText(locationRange);
					}
					if (relatedCodeText.length <= RELATED_INFO_MAX_SIZE) {
						infos.push({ content: relatedCodeText, uri: location.uri, range: location.range });
					}
				} catch (e) {
					// ignore
				}
			}
		}
		const definitionLocations = this.props.cookbook.additionalContext();
		for (const location of definitionLocations) {
			switch (location) {
				case ContextLocation.ParentCallDefinition: {
					const treeSitterAST = this.parserService.getTreeSitterAST(this.props.document);
					if (treeSitterAST) {
						const diagnosticOffsetRange = vscodeToTreeSitterOffsetRange(this.props.diagnostic.range, this.props.document);
						const expressionInfos = await asyncComputeWithTimeBudget(this.logService, this.telemetryService, this.props.document, 500, () => treeSitterAST.getCallExpressions(diagnosticOffsetRange), []);
						for (const expressionInfo of expressionInfos) {
							const expressionRange = treeSitterOffsetRangeToVSCodeRange(this.props.document, expressionInfo);
							definitionRanges.push(expressionRange);
						}
					}
					break;
				}
				case ContextLocation.DefinitionAtLocation: {
					definitionRanges.push(this.props.diagnostic.range);
					break;
				}
			}
		}
		return { infos, definitionRanges, ignoredFiles };
	}
}

// #endregion DiagnosticRelatedInfo

// #region DiagnosticSuggestedFix

export interface DiagnosticSuggestedFixProps extends BasePromptElementProps {
	readonly cookbook: Cookbook;
}

export class DiagnosticSuggestedFix extends PromptElement<DiagnosticSuggestedFixProps> {

	render(state: void, sizing: PromptSizing) {
		const suggestedFixes = this.props.cookbook.fixes;
		if (suggestedFixes.length) {
			const prompt = suggestedFixes[0];
			return <Tag name='suggestedFix'>{prompt.title + prompt.message}</Tag>;
		}
		return null;
	}
}

// #endregion DiagnosticSuggestedFix
