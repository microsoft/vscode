/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, PromptPiece, PromptReference, PromptSizing } from '@vscode/prompt-tsx';
import type { Position, Selection, TextDocument } from 'vscode';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { IGitExtensionService } from '../../../../platform/git/common/gitExtensionService';
import { Repository } from '../../../../platform/git/vscode/git';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { ServicesAccessor } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Location, Range, Uri } from '../../../../vscodeTypes';
import { Tag } from '../base/tag';
import { CodeBlock } from '../panel/safeElements';
import { SymbolAtCursor } from '../panel/symbolAtCursor';

export interface CurrentChangeProps extends BasePromptElementProps {
	input: CurrentChangeInput[];
	logService: ILogService;
}

export interface CurrentChangeInput {
	document: TextDocumentSnapshot;
	relativeDocumentPath: string;
	change?: Change;
	selection?: Selection | Range;
}

interface CurrentChangeState extends BasePromptElementProps {
	input: {
		input: CurrentChangeInput;
		hunks: Hunk[];
	}[];
}

export interface Change {
	repository: Repository;
	uri: Uri;
	hunks: Hunk[];
}

export interface Hunk {
	range: Range;
	text: string;
}

interface GitHunk {
	startDeletedLine: number; // 1-based
	deletedLines: number;
	startAddedLine: number; // 1-based
	addedLines: number;
	additions: { start: number; length: number }[];
	diffText: string;
}

interface Text {
	input: CurrentChangeInput;
	hunks: Hunk[];
	tokens: number;
}

export class CurrentChange extends PromptElement<CurrentChangeProps, CurrentChangeState> {
	constructor(
		props: CurrentChangeProps,
		@IParserService private readonly parserService: IParserService,
		@IIgnoreService private readonly ignoreService: IIgnoreService
	) {
		super(props);
	}

	override async prepare(sizing: PromptSizing): Promise<CurrentChangeState> {
		const allowed = [];
		for (const input of this.props.input) {
			if (!await this.ignoreService.isCopilotIgnored(input.document.uri)) {
				allowed.push(input);
			}
		}

		const texts: Text[] = await Promise.all(allowed.map(async input => {
			const { document, change, selection } = input;
			let textAll: string;
			if (change?.hunks.length) {
				const first = change.hunks[0];
				textAll = [
					first.range.start.line > 0 ? CurrentChange.enumeratedLines(document, 0, first.range.start.line) : '',
					...change.hunks.map((hunk, i, a) => {
						const nextHunkLine = i + 1 < a.length ? a[i + 1].range.start.line : document.lineCount;
						return [
							CurrentChange.enumeratedChangeLines(hunk.text, hunk.range.start.line), '\n',
							hunk.range.end.line < nextHunkLine ? CurrentChange.enumeratedLines(document, hunk.range.end.line, nextHunkLine) : '',
						];
					}).flat(),
				].join('');
			} else if (selection) {
				const selectionEndLine = selection.end.line + (selection.end.character > 0 ? 1 : 0); // Being line-based.
				textAll = CurrentChange.enumeratedSelectedLines(document, 0, document.lineCount, selection.start.line, selectionEndLine);
			} else {
				textAll = CurrentChange.enumeratedLines(document, 0, document.lineCount);
			}
			return {
				input,
				hunks: [{
					range: new Range(0, 0, input.document.lineCount, 0),
					text: textAll,
				}],
				tokens: await sizing.countTokens(textAll),
			};
		}));

		let currentTokens = texts.reduce((acc, { tokens }) => acc + tokens, 0);

		this.props.logService.info(`[CurrentChange] Full documents: ${currentTokens} tokens, ${sizing.tokenBudget} budget`);
		if (currentTokens <= sizing.tokenBudget) {
			return {
				input: texts.map(({ input, hunks }) => ({
					input,
					hunks,
				}))
			};
		}

		const sorted = texts.slice().sort((a, b) => b.tokens - a.tokens);
		for (const text of sorted) {
			const { input, tokens } = text;
			const { document, change, selection } = input;
			if (change?.hunks.length) {
				const definitionHunks = [];
				let definitionTokens = 0;
				for (const hunk of change.hunks) {
					const definition = await SymbolAtCursor.getDefinitionAtRange(this.ignoreService, this.parserService, document, hunk.range, false);
					if (definition) {
						const definitionEndLine = definition.range.end.line + (definition.range.end.character > 0 ? 1 : 0); // Being line-based.
						const hunkEndLine = hunk.range.end.line + (hunk.range.end.character > 0 ? 1 : 0); // Being line-based.
						const textDefinition = [
							hunk.range.start.line > definition.range.start.line ? CurrentChange.enumeratedLines(document, definition.range.start.line, hunk.range.start.line) : '',
							CurrentChange.enumeratedChangeLines(hunk.text, hunk.range.start.line), '\n',
							definitionEndLine > hunkEndLine ? CurrentChange.enumeratedLines(document, hunkEndLine, definitionEndLine) : '',
						].join('');
						definitionHunks.push({
							range: new Range(Math.min(hunk.range.start.line, definition.range.start.line), 0, Math.max(definitionEndLine, hunkEndLine), 0),
							text: textDefinition,
						});
						definitionTokens += await sizing.countTokens(textDefinition);
					} else {
						const hunkText = CurrentChange.enumeratedChangeLines(hunk.text, hunk.range.start.line);
						const hunkEndLine = hunk.range.end.line + (hunk.range.end.character > 0 ? 1 : 0); // Being line-based.
						definitionHunks.push({
							range: new Range(hunk.range.start.line, 0, hunkEndLine, 0),
							text: hunkText,
						});
						definitionTokens += await sizing.countTokens(hunkText);
					}
				}
				text.hunks = definitionHunks;
				text.tokens = definitionTokens;
				currentTokens += text.tokens - tokens;
			} else if (selection) {
				const definition = await SymbolAtCursor.getDefinitionAtRange(this.ignoreService, this.parserService, document, selection, false);
				if (definition) {
					const definitionEndLine = definition.range.end.line + (definition.range.end.character > 0 ? 1 : 0); // Being line-based.
					const selectionEndLine = selection.end.line + (selection.end.character > 0 ? 1 : 0); // Being line-based.
					const textDefinition = CurrentChange.enumeratedSelectedLines(document, definition.range.start.line, definitionEndLine, selection.start.line, selectionEndLine);
					const textDefinitionTokens = await sizing.countTokens(textDefinition);
					text.hunks = [{
						range: definition.range,
						text: textDefinition,
					}];
					text.tokens = textDefinitionTokens;
					currentTokens += text.tokens - tokens;
				} else {
					const selectionEndLine = selection.end.line + (selection.end.character > 0 ? 1 : 0); // Being line-based.
					const hunkText = CurrentChange.enumeratedSelectedLines(document, selection.start.line, selectionEndLine, selection.start.line, selectionEndLine);
					text.hunks = [{
						range: new Range(selection.start.line, 0, selectionEndLine, 0),
						text: hunkText,
					}];
					text.tokens = await sizing.countTokens(hunkText);
					currentTokens += text.tokens - tokens;
				}
			} else {
				text.hunks = [];
				text.tokens = 0;
				currentTokens += text.tokens - tokens;
			}

			this.props.logService.info(`[CurrentChange] Reduced ${input.relativeDocumentPath} to defintions: ${currentTokens} tokens, ${sizing.tokenBudget} budget`);
			if (currentTokens <= sizing.tokenBudget) {
				return {
					input: texts.map(({ input, hunks }) => ({
						input,
						hunks,
					}))
				};
			}
		}

		this.props.logService.info(`[CurrentChange] Still too large: ${currentTokens} tokens, ${sizing.tokenBudget} budget, ${texts.length} inputs`);
		if (texts.length > 1) {
			const err = new Error('Split prompt.');
			(err as any).code = 'split_input';
			throw err;
		}
		return {
			input: texts.map(({ input, hunks }) => ({
				input,
				hunks,
			}))
		};
	}

	override render(state: CurrentChangeState, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const input = state.input.filter(i => i.hunks.length > 0);
		if (!input.length) {
			return;
		}

		return (<>
			<Tag name='currentChange' priority={this.props.priority}>
				{
					input.map(input => (<>
						{input.input.change ? <>
							Change at cursor:<br />
							<br />
							Each line is annotated with the line number in the file.<br />
						</> : <>
							Current selection with the selected lines labeled as such:<br />
						</>}
						<br />
						From the file: {input.input.relativeDocumentPath}<br />
						{
							input.hunks.map(hunk => (
								<CodeBlock references={[new PromptReference(new Location(input.input.document.uri, hunk.range))]} uri={input.input.document.uri} code={hunk.text} languageId={`${input.input.document.languageId}/${input.input.relativeDocumentPath}: FROM_LINE: ${hunk.range.start.line + 1} - TO_LINE: ${hunk.range.end.line}`} />
							))
						}
						<br />
						<br />
					</>))
				}
			</Tag >
		</>);
	}

	static async getCurrentChanges(gitExtensionService: IGitExtensionService, group: 'index' | 'workingTree' | 'all'): Promise<Change[]> {
		const git = gitExtensionService.getExtensionApi();
		if (!git) {
			return [];
		}
		const changes = await Promise.all(git.repositories.map(async repository => {
			const stats = await (
				group === 'index' ? repository.diffIndexWithHEAD() :
					group === 'workingTree' ? repository.diffWithHEAD() :
						repository.diffWith('HEAD')
			);
			const changes = await Promise.all(stats.map(async change => {
				const text = await (group === 'index' ? repository.diffIndexWithHEAD(change.uri.fsPath) : repository.diffWithHEAD(change.uri.fsPath));
				return {
					repository,
					uri: change.uri,
					hunks: CurrentChange.parseDiff(text)
						.map(hunk => CurrentChange.gitHunkToHunk(hunk))
				} satisfies Change;
			}));
			return changes;
		}));
		return changes.flat();
	}

	static async getCurrentChange(accessor: ServicesAccessor, _document: TextDocument, cursor: Position): Promise<Change | undefined> {
		const document = TextDocumentSnapshot.create(_document);
		const gitExtensionService = accessor.get(IGitExtensionService);
		const git = gitExtensionService.getExtensionApi();
		if (!git) {
			return;
		}

		const repository = git.getRepository(document.uri);
		if (!repository) {
			return;
		}

		const diff = await repository.diffWithHEAD(document.uri.fsPath);
		if (!diff) {
			return;
		}

		const hunks = CurrentChange.parseDiff(diff);
		const overlappingHunk = hunks.find(hunk => {
			return hunk.additions.some(addition => {
				const start = addition.start - 1;
				const end = start + addition.length - 1;
				return cursor.line >= start && cursor.line <= end;
			});
		});

		if (!overlappingHunk) {
			return;
		}

		return {
			repository,
			uri: document.uri,
			hunks: [CurrentChange.gitHunkToHunk(overlappingHunk)]
		} satisfies Change;
	}

	static async getChanges(gitExtensionService: IGitExtensionService, repositoryUri: Uri, uri: Uri, diff: string): Promise<Change | undefined> {
		const git = gitExtensionService.getExtensionApi();
		if (!git) {
			return;
		}

		const hunks = CurrentChange.parseDiff(diff);

		const repository = git.repositories.find(r => r.rootUri.toString().toLowerCase() === repositoryUri.toString().toLowerCase());
		if (!repository) {
			return;
		}

		return {
			repository,
			uri,
			hunks: hunks.map(hunk => CurrentChange.gitHunkToHunk(hunk))
		} satisfies Change;
	}

	private static gitHunkToHunk(hunk: GitHunk): Hunk {
		const range = new Range(hunk.startAddedLine - 1, 0, hunk.startAddedLine - 1 + hunk.addedLines, 0);
		return {
			range,
			text: hunk.diffText,
		};
	}

	private static parseDiff(diff: string): GitHunk[] {
		const hunkTexts = diff.split('\n@@');
		if (hunkTexts.length && hunkTexts[hunkTexts.length - 1].endsWith('\n')) {
			hunkTexts[hunkTexts.length - 1] = hunkTexts[hunkTexts.length - 1].slice(0, -1);
		}
		const hunks = hunkTexts.map(chunk => {
			const rangeMatch = chunk.match(/-(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))?/);
			if (rangeMatch) {
				let startDeletedLine = parseInt(rangeMatch[1]);
				const deletedLines = rangeMatch[2] ? parseInt(rangeMatch[2]) : 1;
				let startAddedLine = parseInt(rangeMatch[3]);
				const addedLines = rangeMatch[4] ? parseInt(rangeMatch[4]) : 1;

				const additions: { start: number; length: number }[] = [];
				const lines = chunk.split('\n')
					.slice(1);
				let d = 0;
				let addStart: number | undefined;
				for (const line of lines) {
					const ch = line.charAt(0);
					if (ch === '+') {
						if (addStart === undefined) {
							addStart = startAddedLine + d;
						}
						d++;
					} else {
						if (addStart !== undefined) {
							additions.push({ start: addStart, length: startAddedLine + d - addStart });
							addStart = undefined;
						}
						if (ch === ' ') {
							d++;
						}
					}
				}
				if (addStart !== undefined) {
					additions.push({ start: addStart, length: startAddedLine + d - addStart });
					addStart = undefined;
				}
				if (startDeletedLine === 0) {
					startDeletedLine = 1; // when deletedLines is 0?
				}
				if (startAddedLine === 0) {
					startAddedLine = 1; // when addedLines is 0?
				}
				return {
					startDeletedLine, // 1-based
					deletedLines,
					startAddedLine, // 1-based
					addedLines,
					additions,
					diffText: lines.join('\n'),
				};
			}
			return null;
		}).filter(Boolean as unknown as (<C>(x: C) => x is NonNullable<C>));
		return hunks;
	}

	private static enumeratedLines(document: TextDocumentSnapshot, startLine: number, endLine: number) {
		const text = document.getText(new Range(startLine, 0, endLine, 0));
		const lines = text.split('\n');
		const code = lines
			.map((line, i) => i === endLine - startLine ? line : `/* Line ${startLine + i + 1} */${line}`)
			.join('\n');
		return code;
	}

	private static enumeratedSelectedLines(document: TextDocumentSnapshot, startLine: number, endLine: number, startSelectionLine: number, endSelectionLine: number) {
		const text = document.getText(new Range(startLine, 0, endLine, 0));
		const lines = text.split('\n');
		const code = lines
			.map((line, i) => {
				if (i === endLine - startLine) {
					return line;
				}
				const currentLine = startLine + i;
				return `/* ${startSelectionLine <= currentLine && currentLine < endSelectionLine ? 'Selected ' : ''}Line ${currentLine + 1} */${line}`;
			})
			.join('\n');
		return code;
	}

	private static enumeratedChangeLines(text: string, startLine: number) {
		let removedLines = 0;
		const code = text.split('\n')
			.filter(line => line[0] !== '-') // TODO: Try with removed lines included.
			.map((line, i) => {
				const changeChar = line[0];
				const removal = changeChar === '-';
				if (removal) {
					removedLines++;
				}
				const addition = changeChar === '+';
				return `/* ${removal ? 'Removed Line' : `${addition ? 'Changed ' : ''}Line ${startLine + i - removedLines + 1}`} */${line.substring(1)}`;
			})
			.join('\n');
		return code;
	}
}
