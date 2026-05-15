/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import * as l10n from '@vscode/l10n';
import * as readline from 'readline';
import { Readable } from 'stream';
import type { Selection, TextDocument, TextEditor } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey } from '../../../platform/configuration/common/configurationService';
import { ICustomInstructionsService } from '../../../platform/customInstructions/common/customInstructionsService';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { IEnvService } from '../../../platform/env/common/envService';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { API, Repository } from '../../../platform/git/vscode/git';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService, Response } from '../../../platform/networking/common/fetcherService';
import { Progress } from '../../../platform/notification/common/notificationService';
import { ReviewComment, ReviewRequest } from '../../../platform/review/common/reviewService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import * as path from '../../../util/vs/base/common/path';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { MarkdownString, Range, Uri } from '../../../vscodeTypes';
import { FeedbackResult } from '../../prompt/node/feedbackGenerator';


const testing = false;

/**
 * Represents a file change to be reviewed.
 */
interface FileChange {
	repository: Repository | undefined;
	uri?: Uri;
	relativePath: string;
	before: string;
	after: string;
	selection?: Selection;
	document: TextDocument;
}

/**
 * Normalizes a file path to use forward slashes on all platforms.
 */
export function normalizePath(relativePath: string): string {
	return process.platform === 'win32' ? relativePath.replace(/\\/g, '/') : relativePath;
}

/**
 * Collects file change data for a selection-based review.
 */
function collectSelectionChanges(
	git: API,
	editor: TextEditor,
	workspaceService: IWorkspaceService
): FileChange[] {
	return [{
		repository: git.getRepository(editor.document.uri) || undefined,
		uri: editor.document.uri,
		relativePath: workspaceService.asRelativePath(editor.document.uri),
		before: '',
		after: editor.document.getText(),
		selection: editor.selection,
		document: editor.document,
	}];
}

/**
 * Collects file change data for diff-based reviews (index, workingTree, or all).
 */
async function collectDiffChanges(
	git: API,
	group: 'index' | 'workingTree' | 'all',
	workspaceService: IWorkspaceService
): Promise<(FileChange | undefined)[]> {
	const repositoryChanges = await Promise.all(git.repositories.map(async repository => {
		const uris = new Set<Uri>();
		if (group === 'all' || group === 'index') {
			repository.state.indexChanges.forEach(c => uris.add(c.uri));
		}
		if (group === 'all' || group === 'workingTree') {
			repository.state.workingTreeChanges.forEach(c => uris.add(c.uri));
			repository.state.untrackedChanges.forEach(c => uris.add(c.uri));
		}
		const changes = await Promise.all(Array.from(uris).map(async uri => {
			const document = await workspaceService.openTextDocument(uri).then(undefined, () => undefined);
			if (!document) {
				return undefined; // Deleted files can be skipped.
			}
			const before = await (group === 'index' || group === 'all' ? repository.show('HEAD', uri.fsPath).catch(() => '') : repository.show('', uri.fsPath).catch(() => ''));
			const after = group === 'index' ? await (repository.show('', uri.fsPath).catch(() => '')) : document.getText();
			const relativePath = path.relative(repository.rootUri.fsPath, uri.fsPath);
			return {
				repository,
				uri,
				relativePath: normalizePath(relativePath),
				before,
				after,
				document,
			};
		}));
		return changes;
	}));
	return repositoryChanges.flat();
}

/**
 * Collects file change data for patch-based reviews (e.g., PR reviews).
 */
async function collectPatchChanges(
	git: API,
	group: { repositoryRoot: string; commitMessages: string[]; patches: { patch: string; fileUri: string; previousFileUri?: string }[] },
	workspaceService: IWorkspaceService
): Promise<(FileChange | undefined)[]> {
	return Promise.all(group.patches.map(async patch => {
		const uri = Uri.parse(patch.fileUri);
		const document = await workspaceService.openTextDocument(uri).then(undefined, () => undefined);
		if (!document) {
			return undefined; // Deleted files can be skipped.
		}
		const after = document.getText();
		const before = reversePatch(after, patch.patch);
		const relativePath = path.relative(group.repositoryRoot, uri.fsPath);
		return {
			repository: git.getRepository(Uri.parse(group.repositoryRoot))!,
			relativePath: normalizePath(relativePath),
			before,
			after,
			document,
		};
	}));
}

/**
 * Collects file change data for single-file reviews.
 */
async function collectSingleFileChanges(
	git: API,
	group: { group: 'index' | 'workingTree'; file: Uri },
	workspaceService: IWorkspaceService
): Promise<FileChange[]> {
	const { group: g, file } = group;
	const repository = git.getRepository(file);
	const document = await workspaceService.openTextDocument(file).then(undefined, () => undefined);
	if (!repository || !document) {
		return [];
	}
	const before = await (g === 'index' ? repository.show('HEAD', file.fsPath).catch(() => '') : repository.show('', file.fsPath).catch(() => ''));
	const after = g === 'index' ? await (repository.show('', file.fsPath).catch(() => '')) : document.getText();
	const relativePath = path.relative(repository.rootUri.fsPath, file.fsPath);
	return [{
		repository,
		relativePath: normalizePath(relativePath),
		before,
		after,
		document,
	}];
}

/**
 * Collects all file changes based on the review group type.
 */
async function collectChanges(
	git: API,
	group: 'selection' | 'index' | 'workingTree' | 'all' | { group: 'index' | 'workingTree'; file: Uri } | { repositoryRoot: string; commitMessages: string[]; patches: { patch: string; fileUri: string; previousFileUri?: string }[] },
	editor: TextEditor | undefined,
	workspaceService: IWorkspaceService
): Promise<FileChange[]> {
	if (group === 'selection') {
		return collectSelectionChanges(git, editor!, workspaceService);
	}
	if (typeof group === 'string') {
		const changes = await collectDiffChanges(git, group, workspaceService);
		return changes.filter((change): change is FileChange => !!change);
	}
	if ('repositoryRoot' in group) {
		const changes = await collectPatchChanges(git, group, workspaceService);
		return changes.filter((change): change is FileChange => !!change);
	}
	return collectSingleFileChanges(git, group, workspaceService);
}

export async function githubReview(
	logService: ILogService,
	gitExtensionService: IGitExtensionService,
	authService: IAuthenticationService,
	capiClientService: ICAPIClientService,
	domainService: IDomainService,
	fetcherService: IFetcherService,
	envService: IEnvService,
	ignoreService: IIgnoreService,
	workspaceService: IWorkspaceService,
	customInstructionsService: ICustomInstructionsService,
	group: 'selection' | 'index' | 'workingTree' | 'all' | { group: 'index' | 'workingTree'; file: Uri } | { repositoryRoot: string; commitMessages: string[]; patches: { patch: string; fileUri: string; previousFileUri?: string }[] },
	editor: TextEditor | undefined,
	progress: Progress<ReviewComment[]>,
	cancellationToken: CancellationToken
): Promise<FeedbackResult> {
	const git = gitExtensionService.getExtensionApi();
	if (!git) {
		return { type: 'success', comments: [] };
	}
	const changes = await collectChanges(git, group, editor, workspaceService);

	if (!changes.length) {
		return { type: 'success', comments: [] };
	}

	const ignored = await Promise.all(changes.map(i => ignoreService.isCopilotIgnored(i.document.uri)));
	const filteredChanges = changes.filter((_, i) => !ignored[i]);
	if (filteredChanges.length === 0) {
		logService.info('All input documents are ignored. Skipping feedback generation.');
		return {
			type: 'error',
			severity: 'info',
			reason: l10n.t('All input documents are ignored by configuration. Check your .copilotignore file.')
		};
	}
	logService.debug(`[github review agent] files: ${filteredChanges.map(change => change.relativePath).join(', ')}`);

	const { requestId, rl } = !testing ? await fetchComments(
		logService,
		authService,
		capiClientService,
		fetcherService,
		envService,
		customInstructionsService,
		workspaceService,
		group === 'selection' ? 'selection' : 'diff',
		filteredChanges[0].repository,
		filteredChanges.map(change => ({ path: change.relativePath, content: change.before, languageId: change.document.languageId })),
		filteredChanges.map(change => ({ path: change.relativePath, content: change.after, languageId: change.document.languageId, selection: 'selection' in change ? change.selection : undefined })),
		cancellationToken,
	) : {
		requestId: 'test-request-id',
		rl: [
			'data: ...',
			'data: [DONE]',
		]
	};
	if (!rl || cancellationToken.isCancellationRequested) {
		return { type: 'cancelled' };
	}

	logService.info(`[github review agent] request id: ${requestId}`);

	const request: ReviewRequest = {
		source: 'githubReviewAgent',
		promptCount: -1,
		messageId: requestId || generateUuid(),
		inputType: 'change',
		inputRanges: [],
	};
	const references: ResponseReference[] = [];
	const comments: ReviewComment[] = [];
	for await (const line of rl) {
		if (cancellationToken.isCancellationRequested) {
			return { type: 'cancelled' };
		}
		logService.debug(`[github review agent] response line: ${line}`);
		const refs = parseLine(line);
		references.push(...refs);
		for (const ghComment of refs.filter(ref => ref.type === 'github.generated-pull-request-comment')) {
			const change = filteredChanges.find(change => change.relativePath === ghComment.data.path);
			if (!change) {
				continue;
			}
			const comment = createReviewComment(ghComment, request, change.document, comments.length);
			comments.push(comment);
			progress.report([comment]);
		}
	}
	const excludedComments = references.filter((ref): ref is ExcludedComment => ref.type === 'github.excluded-pull-request-comment')
		.map(ghComment => {
			const change = filteredChanges.find(change => change.relativePath === ghComment.data.path);
			return { ghComment, change };
		}).filter((item): item is { ghComment: ExcludedComment; change: NonNullable<typeof item.change> } => !!item.change)
		.map(({ ghComment, change }, i) => createReviewComment(ghComment, request, change.document, comments.length + i));
	const unsupportedLanguages = !comments.length ? [...new Set(references.filter((ref): ref is ExcludedFile => ref.type === 'github.excluded-file' && ref.data.reason === 'file_type_not_supported')
		.map(ref => ref.data.language))] : [];
	return { type: 'success', comments, excludedComments, reason: unsupportedLanguages.length ? l10n.t('Some of the submitted languages are currently not supported: {0}', unsupportedLanguages.join(', ')) : undefined };
}

/**
 * Review files specified as URI pairs (current + base content).
 * This is the entry point for the `github.copilot.chat.codeReview.run` command,
 * bypassing git-based change collection.
 */
export async function githubReviewFileUris(
	logService: ILogService,
	authService: IAuthenticationService,
	capiClientService: ICAPIClientService,
	fetcherService: IFetcherService,
	envService: IEnvService,
	ignoreService: IIgnoreService,
	workspaceService: IWorkspaceService,
	customInstructionsService: ICustomInstructionsService,
	fileInputs: readonly { readonly currentUri: Uri; readonly baseContent: string }[],
	cancellationToken: CancellationToken,
): Promise<FeedbackResult> {
	const changes: { readonly relativePath: string; readonly before: string; readonly after: string; readonly document: TextDocument; readonly uri: Uri }[] = [];
	for (const input of fileInputs) {
		const document = await workspaceService.openTextDocument(input.currentUri);
		changes.push({
			uri: input.currentUri,
			relativePath: normalizePath(workspaceService.asRelativePath(input.currentUri)),
			before: input.baseContent,
			after: document.getText(),
			document,
		});
	}

	if (!changes.length) {
		return { type: 'success', comments: [] };
	}

	const ignored = await Promise.all(changes.map(c => ignoreService.isCopilotIgnored(c.uri)));
	const filteredChanges = changes.filter((_, i) => !ignored[i]);
	if (filteredChanges.length === 0) {
		logService.info('All input documents are ignored. Skipping feedback generation.');
		return {
			type: 'error',
			severity: 'info',
			reason: l10n.t('All input documents are ignored by configuration. Check your .copilotignore file.')
		};
	}
	logService.debug(`[github review agent] files: ${filteredChanges.map(c => c.relativePath).join(', ')}`);

	const { requestId, rl } = await fetchComments(
		logService, authService, capiClientService, fetcherService, envService,
		customInstructionsService, workspaceService,
		'diff',
		undefined,
		filteredChanges.map(c => ({ path: c.relativePath, content: c.before, languageId: c.document.languageId })),
		filteredChanges.map(c => ({ path: c.relativePath, content: c.after, languageId: c.document.languageId })),
		cancellationToken,
	);
	if (!rl || cancellationToken.isCancellationRequested) {
		return { type: 'cancelled' };
	}

	logService.info(`[github review agent] request id: ${requestId}`);

	const request: ReviewRequest = {
		source: 'githubReviewAgent',
		promptCount: -1,
		messageId: requestId || generateUuid(),
		inputType: 'change',
		inputRanges: [],
	};
	const references: ResponseReference[] = [];
	const comments: ReviewComment[] = [];
	for await (const line of rl) {
		if (cancellationToken.isCancellationRequested) {
			return { type: 'cancelled' };
		}
		logService.debug(`[github review agent] response line: ${line}`);
		const refs = parseLine(line);
		references.push(...refs);
		for (const ghComment of refs.filter(ref => ref.type === 'github.generated-pull-request-comment')) {
			const change = filteredChanges.find(c => c.relativePath === ghComment.data.path);
			if (!change) {
				continue;
			}
			const comment = createReviewComment(ghComment, request, change.document, comments.length);
			comments.push(comment);
		}
	}
	const excludedComments = references.filter((ref): ref is ExcludedComment => ref.type === 'github.excluded-pull-request-comment')
		.map(ghComment => {
			const change = filteredChanges.find(c => c.relativePath === ghComment.data.path);
			return { ghComment, change };
		}).filter((item): item is { ghComment: ExcludedComment; change: NonNullable<typeof item.change> } => !!item.change)
		.map(({ ghComment, change }, i) => createReviewComment(ghComment, request, change.document, comments.length + i));
	const unsupportedLanguages = !comments.length ? [...new Set(references.filter((ref): ref is ExcludedFile => ref.type === 'github.excluded-file' && ref.data.reason === 'file_type_not_supported')
		.map(ref => ref.data.language))] : [];
	return { type: 'success', comments, excludedComments, reason: unsupportedLanguages.length ? l10n.t('Some of the submitted languages are currently not supported: {0}', unsupportedLanguages.join(', ')) : undefined };
}

export function createReviewComment(ghComment: ResponseComment | ExcludedComment, request: ReviewRequest, document: TextDocument, index: number) {
	const fromLine = document.lineAt(ghComment.data.line - 1);
	const lastNonWhitespaceCharacterIndex = fromLine.text.trimEnd().length;
	const range = new Range(fromLine.lineNumber, fromLine.firstNonWhitespaceCharacterIndex, fromLine.lineNumber, lastNonWhitespaceCharacterIndex);
	const raw = ghComment.data.body;
	// Remove suggestion because that interfers with our own suggestion rendering later.
	const { content, suggestions } = removeSuggestion(raw);
	const startLine = typeof ghComment.data.start_line === 'number' ? ghComment.data.start_line : ghComment.data.line;
	const suggestionRange = new Range(startLine - 1, 0, ghComment.data.line, 0);
	const comment: ReviewComment = {
		request,
		document: TextDocumentSnapshot.create(document),
		uri: document.uri,
		languageId: document.languageId,
		range,
		body: new MarkdownString(content),
		kind: 'bug',
		severity: 'medium',
		originalIndex: index,
		actionCount: 0,
		skipSuggestion: true,
		suggestion: {
			markdown: '',
			edits: suggestions.map(suggestion => {
				const oldText = document.getText(suggestionRange);
				return {
					range: suggestionRange,
					newText: suggestion,
					oldText,
				};
			}),
		},
	};
	return comment;
}

const SUGGESTION_EXPRESSION = /```suggestion(\u0020*(\r\n|\n))((?<suggestion>[\s\S]*?)(\r\n|\n))?```/g;
export function removeSuggestion(body: string) {
	const suggestions: string[] = [];
	const content = body.replaceAll(SUGGESTION_EXPRESSION, (_match, _ws, _nl, suggestion) => {
		if (suggestion) {
			suggestions.push(suggestion);
		}
		return '';
	});
	return { content, suggestions };
}

// Represents the "before" or "after" state of a file, sent to the agent
interface FileState {
	// The path of the file
	path: string;
	// The file's contents. If the file does not exist in this state, this should be an empty string.
	content: string;
	// The language ID of the file
	languageId: string;
	// The selection within the file, if any
	selection?: Selection;
}

// A generated pull request comment returned by the agent.
//
// NOTE: The shape of these return values is under active development and is likely to change.
//
// Example:
//
// {
//   "type": "github.generated-pull-request-comment",
//   "data": {
//     "path": "packages/issues/test/models/referrer_and_referenceable_model_test.rb",
//     "line": 82,
//     "body": "The word 'Out' should be 'Our'.\n```suggestion\n    # Our batched insert only hits the cross references table twice\n```",
//     "side": "RIGHT"
//   },
//   "id": "",
//   "is_implicit": false,
//   "metadata": {
//     "display_name": "",
//     "display_icon": "",
//     "display_url": ""
//   }
// }

export type ResponseReference = ResponseComment | ExcludedComment | ExcludedFile | { type: 'unknown' };

export interface ResponseComment {
	type: 'github.generated-pull-request-comment';
	data: {
		// The path of the file
		path: string;
		// The right-hand line number the comment relates to
		line: number;
		// The body of the comment, including a ```suggestion block if there is a suggested change
		body: string;
		start_line?: number;
	};
}

export interface ExcludedComment {
	type: 'github.excluded-pull-request-comment';
	data: {
		path: string;
		line: number;
		body: string;
		start_line?: number;
		exclusion_reason: 'denylisted_type' | 'unknown';
	};
}

export interface ExcludedFile {
	type: 'github.excluded-file';
	data: {
		file_path: string;
		language: string;
		reason: 'file_type_not_supported' | 'unknown';
	};
}

/**
 * Raw reference structure from the API response before type validation.
 */
interface RawReference {
	type?: string;
	data?: unknown;
}

/**
 * Raw parsed response structure from the streaming API.
 */
interface ParsedResponse {
	copilot_references?: RawReference[];
}

/**
 * Type guard to check if a raw reference has a valid type field.
 * Matches original behavior: filters to refs where ref.type is truthy.
 */
function hasType(ref: RawReference): ref is RawReference & { type: string } {
	return !!ref.type;
}

export function parseLine(line: string): ResponseReference[] {

	if (line === 'data: [DONE]') { return []; }
	if (line === '') { return []; }

	const parsedLine: ParsedResponse = JSON.parse(line.replace('data: ', ''));

	if (Array.isArray(parsedLine.copilot_references) && parsedLine.copilot_references.length > 0) {
		return parsedLine.copilot_references.filter(hasType) as ResponseReference[];
	} else {
		return [];
	}
}

async function fetchComments(logService: ILogService, authService: IAuthenticationService, capiClientService: ICAPIClientService, fetcherService: IFetcherService, envService: IEnvService, customInstructionsService: ICustomInstructionsService, workspaceService: IWorkspaceService, kind: 'selection' | 'diff', repository: Repository | undefined, baseFileContents: FileState[], headFileContents: FileState[], cancellationToken: CancellationToken) {
	// Collect languageId to file patterns mapping
	const languageIdToFilePatterns = new Map<string, Set<string>>();
	for (const file of [...baseFileContents, ...headFileContents]) {
		const ext = path.extname(file.path);
		if (ext) {
			if (!languageIdToFilePatterns.has(file.languageId)) {
				languageIdToFilePatterns.set(file.languageId, new Set());
			}
			languageIdToFilePatterns.get(file.languageId)!.add(`*${ext}`);
		}
	}

	const customInstructions = await loadCustomInstructions(customInstructionsService, workspaceService, kind, languageIdToFilePatterns, 2);

	const requestBody = {
		messages: [{
			role: 'user',
			...(kind === 'selection' ? {
				review_type: 'snippet',
				snippet_files: headFileContents.map(f => ({
					path: f.path,
					regions: [
						{
							start_line: f.selection!.start.line + 1,
							end_line: f.selection!.end.line + (f.selection!.end.character > 0 ? 1 : 0), // If selection ends at start of line, don't include that line
						}
					]
				})),
			} : {}),
			copilot_references: [
				{
					type: 'github.pull_request',
					id: '1',
					data: {
						type: 'pull-request',
						headFileContents: headFileContents.map(({ path, content }) => ({ path, content })),
						baseFileContents: baseFileContents.map(({ path, content }) => ({ path, content })),
					},
				},
				...customInstructions,
			],
		}]
	};

	const abort = fetcherService.makeAbortController();
	const disposable = cancellationToken.onCancellationRequested(() => abort.abort());
	let response: Response;
	try {
		const copilotToken = await authService.getCopilotToken();
		response = await capiClientService.makeRequest({
			method: 'POST',
			headers: {
				Authorization: 'Bearer ' + copilotToken.token,
				'X-Copilot-Code-Review-Mode': 'ide',
			},
			body: JSON.stringify(requestBody),
			signal: abort.signal,
		}, { type: RequestType.CodeReviewAgent });
	} catch (err) {
		if (fetcherService.isAbortError(err)) {
			return {
				requestId: undefined,
				rl: undefined,
			};
		}
		throw err;
	} finally {
		disposable.dispose();
	}

	const requestId = response.headers.get('x-github-request-id') || undefined;

	if (!response.ok) {
		if (response.status === 402) {
			const err = new Error(`You have reached your Code Review quota limit.`);
			(err as any).severity = 'info';
			throw err;
		}
		throw new Error(`Agent returned an unexpected HTTP ${response.status} error (request id ${requestId || 'unknown'}).`);
	}

	return {
		requestId,
		rl: readline.createInterface({ input: Readable.fromWeb(response.body.toReadableStream()) }),
	};
}

export function reversePatch(after: string, diff: string) {
	const patch = parsePatch(diff.split(/\r?\n/));
	const patchedLines = reverseParsedPatch(after.split(/\r?\n/), patch);
	return patchedLines.join('\n');
}

export interface LineChange {
	beforeLineNumber: number;
	content: string;
	type: 'add' | 'remove';
}

export function parsePatch(patchLines: string[]): LineChange[] {
	const changes: LineChange[] = [];
	let beforeLineNumber = -1;

	for (const line of patchLines) {
		if (line.startsWith('@@')) {
			const match = /@@ -(\d+),\d+ \+\d+,\d+ @@/.exec(line);
			if (match) {
				beforeLineNumber = parseInt(match[1], 10);
			}
		} else if (beforeLineNumber !== -1) {
			if (line.startsWith('+')) {
				changes.push({ beforeLineNumber, content: line.slice(1), type: 'add' });
			} else if (line.startsWith('-')) {
				changes.push({ beforeLineNumber, content: line.slice(1), type: 'remove' });
				beforeLineNumber++;
			} else {
				beforeLineNumber++;
			}
		}
	}

	return changes;
}

export function reverseParsedPatch(fileLines: string[], patch: LineChange[]): string[] {
	for (const change of patch) {
		if (change.type === 'add') {
			fileLines.splice(change.beforeLineNumber - 1, 1);
		} else if (change.type === 'remove') {
			fileLines.splice(change.beforeLineNumber - 1, 0, change.content);
		}
	}

	return fileLines;
}

export interface CodingGuideline {
	type: string;
	id: string;
	data: {
		id: number;
		type: string;
		name: string;
		description: string;
		filePatterns: string[];
	};
}

export async function loadCustomInstructions(customInstructionsService: ICustomInstructionsService, workspaceService: IWorkspaceService, kind: 'selection' | 'diff', languageIdToFilePatterns: Map<string, Set<string>>, firstId: number): Promise<CodingGuideline[]> {
	const customInstructionRefs = [];
	let nextId = firstId;

	// Collect instruction files from agent instructions
	const agentInstructionUris = await customInstructionsService.getAgentInstructions();
	for (const uri of agentInstructionUris) {
		const instructions = await customInstructionsService.fetchInstructionsFromFile(Uri.from(uri));
		if (instructions) {
			const relativePath = workspaceService.asRelativePath(Uri.from(uri));
			for (const instruction of instructions.content) {
				// Skip instructions with languageId if not in map
				if (instruction.languageId && !languageIdToFilePatterns.has(instruction.languageId)) {
					continue;
				}
				const filePatterns = instruction.languageId ? Array.from(languageIdToFilePatterns.get(instruction.languageId)!) : ['*'];
				customInstructionRefs.push({
					type: 'github.coding_guideline',
					id: `${nextId}`,
					data: {
						id: nextId,
						type: 'coding-guideline',
						name: `Instruction from ${relativePath}`,
						description: instruction.instruction,
						filePatterns,
					},
				});
				nextId++;
			}
		}
	}

	// Collect instructions from settings
	const settingsConfigs = [
		{ config: ConfigKey.CodeGenerationInstructions, name: 'Code Generation Instruction' },
		...(kind === 'selection' ? [{ config: ConfigKey.CodeFeedbackInstructions, name: 'Code Review Instruction' }] : []),
	];

	for (const { config, name } of settingsConfigs) {
		const instructionsGroups = await customInstructionsService.fetchInstructionsFromSetting(config);
		for (const instructionsGroup of instructionsGroups) {
			for (const instruction of instructionsGroup.content) {
				// Skip instructions with languageId if not in map
				if (instruction.languageId && !languageIdToFilePatterns.has(instruction.languageId)) {
					continue;
				}
				const filePatterns = instruction.languageId ? Array.from(languageIdToFilePatterns.get(instruction.languageId)!) : ['*'];
				customInstructionRefs.push({
					type: 'github.coding_guideline',
					id: `${nextId}`,
					data: {
						id: nextId,
						type: 'coding-guideline',
						name,
						description: instruction.instruction,
						filePatterns,
					},
				});
				nextId++;
			}
		}
	}

	return customInstructionRefs;
}
