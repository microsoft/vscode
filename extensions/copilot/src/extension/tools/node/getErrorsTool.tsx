/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptElementProps } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ILanguageDiagnosticsService } from '../../../platform/languages/common/languageDiagnosticsService';
import { ILogService } from '../../../platform/log/common/logService';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { getLanguage } from '../../../util/common/languages';
import { findNotebook } from '../../../util/common/notebooks';
import { isLocation } from '../../../util/common/types';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { ResourceSet } from '../../../util/vs/base/common/map';
import { isEqualOrParent } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { DiagnosticSeverity, ExtendedLanguageModelToolResult, LanguageModelPromptTsxPart, MarkdownString, Range } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { Tag } from '../../prompts/node/base/tag';
import { DiagnosticContext, Diagnostics } from '../../prompts/node/inline/diagnosticsContext';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { formatUriForFileWidget } from '../common/toolUtils';
import { checkCancellation, resolveToolInputPath } from './toolUtils';

interface IGetErrorsParams {
	// Note that empty array is not the same as absence; empty array
	// will not return any errors. Absence returns all errors.
	filePaths?: string[];
	// sparse array of ranges, as numbers because it goes through JSON
	// ignored if filePaths is missing / null.
	ranges?: ([a: number, b: number, c: number, d: number] | undefined)[];
}

export class GetErrorsTool extends Disposable implements ICopilotTool<IGetErrorsParams> {
	public static readonly toolName = ToolName.GetErrors;
	public static readonly nonDeferred = true;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageDiagnosticsService private readonly languageDiagnosticsService: ILanguageDiagnosticsService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@INotebookService private readonly notebookService: INotebookService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	/**
	 * Get diagnostics for the given paths and optional ranges.
	 * Note - This is made public for testing purposes only.
	 */
	public getDiagnostics(paths: { uri: URI; range: Range | undefined }[]): Array<{ uri: URI; diagnostics: vscode.Diagnostic[]; inputUri?: URI }> {
		const results: Array<{ uri: URI; diagnostics: vscode.Diagnostic[]; inputUri?: URI }> = [];

		// for notebooks, we need to find the cell matching the range and get diagnostics for that cell
		const nonNotebookPaths = paths.filter(p => {
			const isNotebook = this.notebookService.hasSupportedNotebooks(p.uri);
			if (isNotebook) {
				const diagnostics = this.getNotebookCellDiagnostics(p.uri);
				results.push({ uri: p.uri, diagnostics });
			}

			return !isNotebook;
		});

		if (nonNotebookPaths.length === 0) {
			return results;
		}

		const pendingMatchPaths = new Set(nonNotebookPaths.map(p => p.uri));

		// for non-notebooks, we get all diagnostics and filter down
		for (const [resource, entries] of this.languageDiagnosticsService.getAllDiagnostics()) {
			const pendingDiagnostics = entries.filter(d => d.severity <= DiagnosticSeverity.Warning);
			if (pendingDiagnostics.length === 0) {
				continue;
			}

			// find all path&range pairs and collect the ranges to further filter diagnostics
			// if any path matches the resource without a range, take all diagnostics for that file
			// otherwise, filter diagnostics to those intersecting one of the provided ranges
			const ranges: Range[] = [];
			let shouldTakeAll = false;
			let foundMatch = false;
			let inputUri: URI | undefined;
			let matchedExactPath = false;

			for (const path of nonNotebookPaths) {
				// we support file or folder paths
				if (isEqualOrParent(resource, path.uri)) {
					foundMatch = true;

					// Track the input URI that matched - prefer exact matches, otherwise use the folder
					const isExactMatch = resource.toString() === path.uri.toString();
					if (isExactMatch) {
						// Exact match - this is the file itself, no input folder
						inputUri = undefined;
						matchedExactPath = true;
					} else if (!matchedExactPath) {
						// Folder match - only set if we haven't found an exact match or a previous folder match
						if (inputUri === undefined) {
							inputUri = path.uri;
						}
					}

					if (pendingMatchPaths.has(path.uri)) {
						pendingMatchPaths.delete(path.uri);
					}

					if (path.range) {
						ranges.push(path.range);
					} else {
						// no range, so all diagnostics for this file
						shouldTakeAll = true;
						break;
					}
				}
			}

			if (shouldTakeAll) {
				results.push({ uri: resource, diagnostics: pendingDiagnostics, inputUri });
				continue;
			}

			if (foundMatch && ranges.length > 0) {
				const diagnostics = pendingDiagnostics.filter(d => ranges.some(range => d.range.intersection(range)));
				results.push({ uri: resource, diagnostics, inputUri });
			}
		}

		// for any given paths that didn't match any files, return empty diagnostics for each of them
		for (const uri of pendingMatchPaths) {
			results.push({ uri, diagnostics: [] });
		}

		return results;
	}

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IGetErrorsParams>, token: CancellationToken) {
		const getAll = () => this.languageDiagnosticsService.getAllDiagnostics()
			.map(d => ({ uri: d[0], diagnostics: d[1].filter(e => e.severity <= DiagnosticSeverity.Warning), inputUri: undefined }))
			// filter any documents w/o warnings or errors
			.filter(d => d.diagnostics.length > 0);

		const getSome = (filePaths: string[]) =>
			this.getDiagnostics(filePaths.map((filePath, i) => {
				const uri = resolveToolInputPath(filePath, this.promptPathRepresentationService);
				const range = options.input.ranges?.[i];
				if (!uri) {
					throw new Error(`Invalid input path ${filePath}`);
				}

				return { uri, range: range ? new Range(...range) : undefined };
			}));

		const ds = options.input.filePaths?.length ? getSome(options.input.filePaths) : getAll();

		const diagnostics = coalesce(await Promise.all(ds.map((async ({ uri, diagnostics, inputUri }) => {
			try {
				const document = await this.workspaceService.openTextDocumentAndSnapshot(uri);
				checkCancellation(token);
				return {
					uri,
					diagnostics,
					context: { document, language: getLanguage(document) },
					inputUri
				};
			} catch (e) {
				this.logService.error(e, 'get_errors failed to open doc with diagnostics');
				return undefined;
			}
		}))));
		checkCancellation(token);

		const result = new ExtendedLanguageModelToolResult([
			new LanguageModelPromptTsxPart(
				await renderPromptElementJSON(this.instantiationService, DiagnosticToolOutput, { diagnosticsGroups: diagnostics, maxDiagnostics: 50 }, options.tokenizationOptions, token)
			)
		]);

		const numDiagnostics = diagnostics.reduce((acc, { diagnostics }) => acc + diagnostics.length, 0);

		// For display message, use inputUri if available (indicating file was found via folder input), otherwise use the file uri
		// Deduplicate URIs since multiple files may have the same inputUri
		const displayUriSet = new ResourceSet();
		for (const d of diagnostics) {
			const displayUri = d.inputUri ?? d.uri;
			displayUriSet.add(displayUri);
		}

		const formattedURIs = this.formatURIs(Array.from(displayUriSet));

		if (options.input.filePaths?.length) {
			result.toolResultMessage = numDiagnostics === 0 ?
				new MarkdownString(l10n.t`Checked ${formattedURIs}, no problems found`) :
				numDiagnostics === 1 ?
					new MarkdownString(l10n.t`Checked ${formattedURIs}, 1 problem found`) :
					new MarkdownString(l10n.t`Checked ${formattedURIs}, ${numDiagnostics} problems found`);
		} else {
			result.toolResultMessage = numDiagnostics === 0 ?
				new MarkdownString(l10n.t`Checked workspace, no problems found`) :
				numDiagnostics === 1 ?
					new MarkdownString(l10n.t`Checked workspace, 1 problem found in ${formattedURIs}`) :
					new MarkdownString(l10n.t`Checked workspace, ${numDiagnostics} problems found in ${formattedURIs}`);
		}

		return result;
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IGetErrorsParams>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		if (!options.input.filePaths?.length) {
			// When no file paths provided, check all files with diagnostics
			return {
				invocationMessage: new MarkdownString(l10n.t`Checking workspace for problems`),
			};
		}
		else {
			const uris = options.input.filePaths.map(filePath => resolveToolInputPath(filePath, this.promptPathRepresentationService));
			if (uris.some(uri => uri === undefined)) {
				throw new Error('Invalid file path provided');
			}

			return {
				invocationMessage: new MarkdownString(l10n.t`Checking ${this.formatURIs(uris)}`),
			};
		}
	}

	private formatURIs(uris: URI[]): string {
		return uris.map(uri => formatUriForFileWidget(uri)).join(', ');
	}

	private getNotebookCellDiagnostics(uri: URI) {
		const notebook = findNotebook(uri, this.workspaceService.notebookDocuments);

		if (!notebook) {
			this.logService.error(`Notebook not found: ${uri.toString()}, could not retrieve diagnostics`);
			return [];
		}

		return notebook.getCells()
			.flatMap((cell) => {
				const uri = cell.document.uri;
				return this.languageDiagnosticsService.getDiagnostics(uri);
			});
	}

	async provideInput(promptContext: IBuildPromptContext): Promise<IGetErrorsParams | undefined> {
		const seen = new Set<string>();

		const filePaths: string[] = [];
		const ranges: ([a: number, b: number, c: number, d: number] | undefined)[] = [];

		function addPath(path: string, range: vscode.Range | undefined) {
			if (!seen.has(path)) {
				seen.add(path);
				filePaths.push(path);
				ranges.push(range && [range.start.line, range.start.character, range.end.line, range.end.character]);
			}
		}

		for (const ref of promptContext.chatVariables) {
			if (URI.isUri(ref.value)) {
				addPath(this.promptPathRepresentationService.getFilePath(ref.value), undefined);
			} else if (isLocation(ref.value)) {
				addPath(this.promptPathRepresentationService.getFilePath(ref.value.uri), ref.value.range);
			}
		}

		if (promptContext.workingSet) {
			for (const file of promptContext.workingSet) {
				addPath(this.promptPathRepresentationService.getFilePath(file.document.uri), file.range);
			}
		}

		if (!filePaths.length) {
			for (const [uri, diags] of this.languageDiagnosticsService.getAllDiagnostics()) {
				const path = this.promptPathRepresentationService.getFilePath(uri);
				if (diags.length) {
					let range = diags[0].range;
					for (let i = 1; i < diags.length; i++) {
						range = range.union(diags[i].range);
					}
					addPath(path, range);
				}
			}
		}

		return {
			filePaths,
			ranges
		};
	}
}

ToolRegistry.registerTool(GetErrorsTool);

interface IDiagnosticToolOutputProps extends BasePromptElementProps {
	diagnosticsGroups: { context: DiagnosticContext; uri: URI; diagnostics: vscode.Diagnostic[] }[];
	maxDiagnostics?: number;
}

export class DiagnosticToolOutput extends PromptElement<IDiagnosticToolOutputProps> {
	constructor(
		props: PromptElementProps<IDiagnosticToolOutputProps>,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	render() {
		if (!this.props.diagnosticsGroups.length) {
			return <>No errors found.</>;
		}

		let diagnosticsGroups = this.props.diagnosticsGroups;
		let limitMsg;
		if (typeof this.props.maxDiagnostics === 'number') {
			let remaining = this.props.maxDiagnostics;
			diagnosticsGroups = this.props.diagnosticsGroups.map(group => {
				if (remaining <= 0) {
					return { ...group, diagnostics: [] };
				}
				const take = Math.min(group.diagnostics.length, remaining);
				remaining -= take;
				return { ...group, diagnostics: group.diagnostics.slice(0, take) };
			});
			const totalDiagnostics = this.props.diagnosticsGroups.reduce((acc, group) => acc + group.diagnostics.length, 0);
			limitMsg = totalDiagnostics > this.props.maxDiagnostics
				? <>Showing first {this.props.maxDiagnostics} results out of {totalDiagnostics}<br /></>
				: undefined;
		}

		return <>
			{limitMsg}
			{diagnosticsGroups.map(d =>
				<Tag name='errors' attrs={{ path: this.promptPathRepresentationService.getFilePath(d.uri) }}>
					{d.diagnostics.length
						? <Diagnostics
							documentContext={d.context}
							diagnostics={d.diagnostics}
							includeRelatedInfos={false} // avoid blowing up the prompt #12655
						/>
						: 'No errors found'}
				</Tag>
			)}
		</>;
	}
}