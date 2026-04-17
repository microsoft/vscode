/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { basename, extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { SymbolKind } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { OutlineModel } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { IFileService, IFileStat } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { getWorkspaceSymbols } from '../../../search/common/search.js';
import { IPlanningFileSnippet, IPlanningRepositoryContext, IPlanningSymbolReference, PlanningPhase, PlanningQuestionStage, PlanningRepositoryScope } from '../../common/planning/chatPlanningTransition.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.html', '.md']);
const STOP_WORDS = new Set([
	'about',
	'after',
	'before',
	'build',
	'change',
	'class',
	'code',
	'debug',
	'file',
	'from',
	'function',
	'into',
	'mode',
	'plan',
	'planner',
	'planning',
	'should',
	'that',
	'this',
	'update',
	'using',
	'with',
]);

export interface IPlanningContextCollectionInput {
	readonly phase: PlanningPhase;
	readonly questionStage: PlanningQuestionStage;
	readonly userRequest: string;
	readonly plannerNotes?: string;
	readonly recentConversation: readonly string[];
	readonly planningAnswers: readonly string[];
	readonly activeEditor: ICodeEditor | undefined;
}

interface IPlanningFocusState {
	readonly phase: PlanningPhase;
	readonly questionStage: PlanningQuestionStage;
	readonly scope: PlanningRepositoryScope;
	readonly queries: readonly string[];
	readonly terms: readonly string[];
	readonly summary: string;
}

export async function collectPlanningRepositoryContext(
	input: IPlanningContextCollectionInput,
	services: {
		readonly fileService: IFileService;
		readonly textModelService: ITextModelService;
		readonly workspaceContextService: IWorkspaceContextService;
		readonly languageFeaturesService: ILanguageFeaturesService;
	}
): Promise<IPlanningRepositoryContext | undefined> {
	const model = input.activeEditor?.getModel();
	if (!model) {
		return undefined;
	}

	const activeResource = model.uri;
	const workspaceFolder = services.workspaceContextService.getWorkspaceFolder(activeResource);
	const workspaceRoot = workspaceFolder?.uri;
	const selection = input.activeEditor?.getSelection();
	const selectedText = selection && !selection.isEmpty() ? model.getValueInRange(selection) : undefined;
	const activeDocumentSymbols = await getActiveDocumentSymbols(services.languageFeaturesService, model);
	const focus = buildFocusState(input, selectedText, activeResource, activeDocumentSymbols);
	const workspaceSymbolMatches = workspaceRoot
		? await getWorkspaceSymbolMatches(focus)
		: [];
	const nearbyFiles = workspaceRoot
		? await getNearbyFiles(services.fileService, workspaceRoot, activeResource, focus)
		: [];
	const relevantSnippets = await getRelevantSnippets(
		services.textModelService,
		workspaceRoot,
		activeResource,
		workspaceSymbolMatches,
		nearbyFiles,
		selection && !selection.isEmpty() ? selection : undefined,
		focus
	);

	return {
		workspaceRoot: workspaceRoot?.toString(),
		scope: focus.scope,
		focusSummary: focus.summary,
		focusQueries: focus.queries,
		activeDocumentSymbols,
		workspaceSymbolMatches,
		nearbyFiles,
		relevantSnippets,
	};
}

async function getActiveDocumentSymbols(languageFeaturesService: ILanguageFeaturesService, model: ITextModel): Promise<IPlanningSymbolReference[]> {
	const outline = await OutlineModel.create(languageFeaturesService.documentSymbolProvider, model, CancellationToken.None);
	return outline.asListOfDocumentSymbols().slice(0, 20).map((symbol): IPlanningSymbolReference => ({
		name: symbol.name,
		kind: describeSymbolKind(symbol.kind),
		file: model.uri.toString(),
		containerName: symbol.containerName || undefined,
	}));
}

function buildFocusState(
	input: IPlanningContextCollectionInput,
	selectedText: string | undefined,
	activeResource: URI,
	activeSymbols: readonly IPlanningSymbolReference[],
): IPlanningFocusState {
	const scope = mapPhaseToScope(input.phase, input.questionStage);
	const queries = extractQueries(getStageOrderedInputs(input, selectedText, activeResource, activeSymbols), getQueryLimitForScope(scope, input.questionStage));

	return {
		phase: input.phase,
		questionStage: input.questionStage,
		scope,
		queries,
		terms: queries.map(query => query.toLowerCase()),
		summary: buildFocusSummary(input.phase, input.questionStage, input.planningAnswers, input.userRequest, input.plannerNotes, input.recentConversation, activeResource, selectedText),
	};
}

async function getWorkspaceSymbolMatches(focus: IPlanningFocusState): Promise<IPlanningSymbolReference[]> {
	const maxMatches = focus.scope === 'detailed' ? 4 : focus.scope === 'focused' ? 6 : 12;
	const matches = new Map<string, IPlanningSymbolReference & { score: number }>();

	for (const query of focus.queries) {
		const provided = await getWorkspaceSymbols(query, CancellationToken.None);
		for (const item of provided) {
			const symbol = item.symbol;
			const candidate: IPlanningSymbolReference & { score: number } = {
				name: symbol.name,
				kind: describeSymbolKind(symbol.kind),
				file: symbol.location.uri.toString(),
				containerName: symbol.containerName || undefined,
				score: scoreCandidate(
					[symbol.name, symbol.containerName || '', symbol.location.uri.toString()],
					focus.terms,
				),
			};
			const key = `${candidate.name}:${candidate.file}`;
			const existing = matches.get(key);
			if (!existing || candidate.score > existing.score) {
				matches.set(key, candidate);
			}
		}
	}

	return [...matches.values()]
		.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
		.slice(0, maxMatches)
		.map(({ score: _score, ...symbol }) => symbol);
}

async function getNearbyFiles(fileService: IFileService, workspaceRoot: URI, activeResource: URI, focus: IPlanningFocusState): Promise<string[]> {
	const maxFiles = focus.scope === 'detailed' ? 4 : focus.scope === 'focused' ? 6 : 12;
	const directoryStat = await fileService.resolve(extUri.dirname(activeResource));
	const children = directoryStat.children ?? [];

	return children
		.filter((child: IFileStat) => child.isFile)
		.filter((child: IFileStat) => SOURCE_EXTENSIONS.has(extUri.extname(child.resource)))
		.map((child: IFileStat) => extUri.relativePath(workspaceRoot, child.resource) ?? child.resource.toString())
		.sort((left: string, right: string) => {
			const rightScore = scoreCandidate([right, basenameLabel(right)], focus.terms);
			const leftScore = scoreCandidate([left, basenameLabel(left)], focus.terms);
			return rightScore - leftScore || left.localeCompare(right);
		})
		.slice(0, maxFiles);
}

async function getRelevantSnippets(
	textModelService: ITextModelService,
	workspaceRoot: URI | undefined,
	activeResource: URI,
	workspaceSymbols: readonly IPlanningSymbolReference[],
	nearbyFiles: readonly string[],
	selection: { readonly startLineNumber: number; readonly endLineNumber: number } | undefined,
	focus: IPlanningFocusState,
): Promise<IPlanningRepositoryContext['relevantSnippets']> {
	const snippets: IPlanningFileSnippet[] = [];
	const seen = new Set<string>();
	const maxSnippets = focus.scope === 'detailed' ? 5 : focus.scope === 'focused' ? 4 : 3;

	const activeSnippet = await createSnippet(textModelService, activeResource, workspaceRoot, selection, focus, activeResource.toString(), focus.scope === 'detailed'
		? focus.questionStage === 'task-decomposition'
			? 'Decomposition anchor from the active selection and narrowed implementation slice.'
			: 'Goal-clarity anchor from the active selection and narrowed context.'
		: focus.scope === 'focused'
			? focus.questionStage === 'task-decomposition'
				? 'Focused around the active selection and the strongest decomposition signals.'
				: 'Focused around the active selection and the strongest goal-clarity signals.'
			: focus.questionStage === 'task-decomposition'
				? 'Early decomposition anchor from the active editor.'
				: 'Broad goal-clarity anchor from the active editor.');
	if (activeSnippet) {
		snippets.push(activeSnippet);
		seen.add(activeResource.toString());
	}

	for (const symbol of workspaceSymbols) {
		if (!symbol.file || seen.has(symbol.file)) {
			continue;
		}

		const snippet = await createSnippet(textModelService, URI.parse(symbol.file), workspaceRoot, undefined, focus, symbol.file, focus.scope === 'detailed'
			? focus.questionStage === 'task-decomposition'
				? `Deep dive candidate because ${symbol.name} remains central to the narrowed implementation breakdown.`
				: `Deep dive candidate because ${symbol.name} remains central to clarifying the goal and scope.`
			: focus.scope === 'focused'
				? focus.questionStage === 'task-decomposition'
					? `Expanded because ${symbol.name} aligns with the current breakdown and insertion-point signals.`
					: `Expanded because ${symbol.name} aligns with the current goal-clarity answers.`
				: focus.questionStage === 'task-decomposition'
					? `Included because ${symbol.name} looks relevant to the initial decomposition pass.`
					: `Included because ${symbol.name} looks relevant to the initial goal-clarity pass.`);
		if (!snippet) {
			continue;
		}

		snippets.push(snippet);
		seen.add(symbol.file);
		if (snippets.length >= maxSnippets) {
			return snippets;
		}
	}

	for (const relativePath of nearbyFiles) {
		if (!workspaceRoot) {
			break;
		}

		const candidate = extUri.joinPath(workspaceRoot, relativePath);
		if (seen.has(candidate.toString())) {
			continue;
		}

		const snippet = await createSnippet(textModelService, candidate, workspaceRoot, undefined, focus, relativePath, focus.scope === 'detailed'
			? focus.questionStage === 'task-decomposition'
				? 'Retained for the detailed implementation breakdown.'
				: 'Retained because it still informs the final clarified scope.'
			: focus.scope === 'focused'
				? focus.questionStage === 'task-decomposition'
					? 'Expanded because the file remains in the narrowed implementation working set.'
					: 'Expanded because the file still informs the narrowed goal-clarity slice.'
				: focus.questionStage === 'task-decomposition'
					? 'Nearby file from the early decomposition pass.'
					: 'Nearby file from the broad goal-clarity pass.');
		if (!snippet) {
			continue;
		}

		snippets.push(snippet);
		seen.add(candidate.toString());
		if (snippets.length >= maxSnippets) {
			return snippets;
		}
	}

	return snippets;
}

async function createSnippet(
	textModelService: ITextModelService,
	resource: URI,
	workspaceRoot: URI | undefined,
	selection: { readonly startLineNumber: number; readonly endLineNumber: number } | undefined,
	focus: IPlanningFocusState,
	pathLabel: string,
	reason: string,
): Promise<IPlanningRepositoryContext['relevantSnippets'][number] | undefined> {
	try {
		const ref = await textModelService.createModelReference(resource);
		try {
			const model = ref.object.textEditorModel;
			const preview = getDocumentPreview(model.getLineCount(), (line) => model.getLineContent(line), selection, focus);
			if (!preview) {
				return undefined;
			}

			return {
				path: workspaceRoot ? extUri.relativePath(workspaceRoot, resource) ?? pathLabel : pathLabel,
				preview,
				detailLevel: focus.scope,
				reason,
			};
		} finally {
			ref.dispose();
		}
	} catch {
		return undefined;
	}
}

function getStageOrderedInputs(
	input: IPlanningContextCollectionInput,
	selectedText: string | undefined,
	activeResource: URI,
	activeSymbols: readonly IPlanningSymbolReference[],
): string[] {
	const activeFileName = basename(activeResource);
	if (input.questionStage === 'task-decomposition') {
		switch (input.phase) {
			case 'detailed-inspection':
				return [
					...input.planningAnswers,
					selectedText ?? '',
					...activeSymbols.map(symbol => `${symbol.name} ${symbol.containerName ?? ''}`),
					activeFileName,
					input.userRequest,
					input.plannerNotes ?? '',
					...input.recentConversation,
				];
			case 'focused-slice':
				return [
					...input.planningAnswers,
					selectedText ?? '',
					activeFileName,
					...activeSymbols.map(symbol => `${symbol.name} ${symbol.containerName ?? ''}`),
					input.userRequest,
					input.plannerNotes ?? '',
					...input.recentConversation,
				];
			default:
				return [
					...input.planningAnswers,
					input.userRequest,
					selectedText ?? '',
					activeFileName,
					...activeSymbols.map(symbol => symbol.name),
					input.plannerNotes ?? '',
					...input.recentConversation,
				];
		}
	}

	switch (input.phase) {
		case 'focused-slice':
			return [
				input.userRequest,
				input.plannerNotes ?? '',
				...input.planningAnswers,
				selectedText ?? '',
				...input.recentConversation,
				...activeSymbols.map(symbol => `${symbol.name} ${symbol.containerName ?? ''}`),
				activeFileName,
			];
		case 'detailed-inspection':
			return [
				input.userRequest,
				...input.planningAnswers,
				input.plannerNotes ?? '',
				selectedText ?? '',
				...activeSymbols.map(symbol => `${symbol.name} ${symbol.containerName ?? ''}`),
				activeFileName,
				...input.recentConversation,
			];
		default:
			return [
				input.userRequest,
				input.plannerNotes ?? '',
				selectedText ?? '',
				...input.recentConversation,
				...activeSymbols.map(symbol => symbol.name),
				activeFileName,
				...input.planningAnswers,
			];
	}
}

function buildFocusSummary(
	phase: PlanningPhase,
	questionStage: PlanningQuestionStage,
	planningAnswers: readonly string[],
	userRequest: string,
	plannerNotes: string | undefined,
	recentConversation: readonly string[],
	activeResource: URI,
	selectedText: string | undefined,
): string {
	const stageLabel = questionStage === 'goal-clarity' ? 'Goal clarity' : 'Task decomposition';
	const selected = planningAnswers.slice(0, questionStage === 'goal-clarity' ? 3 : 4).join(', ');
	const anchors = [selected, plannerNotes?.trim() || '', userRequest.trim(), recentConversation[0] || ''].filter(value => value.length > 0);
	const selectionAnchor = getSelectionAnchor(selectedText);
	const fileAnchor = basename(activeResource);

	if (phase === 'focused-slice') {
		return anchors.length > 0
			? `${stageLabel} focus for the focused slice around ${anchors[0]}. Anchored in ${fileAnchor}${selectionAnchor ? ` near ${selectionAnchor}` : ''}.`
			: `${stageLabel} focus for the focused slice in ${fileAnchor}.`;
	}

	if (phase === 'detailed-inspection') {
		return anchors.length > 0
			? `${stageLabel} focus for detailed inspection around ${anchors[0]}. Deepened in ${fileAnchor}${selectionAnchor ? ` near ${selectionAnchor}` : ''}.`
			: `${stageLabel} focus for detailed inspection in ${fileAnchor}.`;
	}

	return anchors.length > 0
		? `${stageLabel} focus for the broad scan around ${anchors[0]}. Starting in ${fileAnchor}${selectionAnchor ? ` near ${selectionAnchor}` : ''}.`
		: `${stageLabel} focus for the broad scan in ${fileAnchor}.`;
}

function extractQueries(inputs: readonly string[], limit: number): string[] {
	const seen = new Set<string>();
	const queries: string[] = [];

	for (const input of inputs) {
		for (const candidate of extractQueryCandidates(input)) {
			const normalized = candidate.trim();
			const lower = normalized.toLowerCase();
			if (!normalized || normalized.length < 3 || STOP_WORDS.has(lower) || seen.has(lower)) {
				continue;
			}

			seen.add(lower);
			queries.push(normalized);
			if (queries.length >= limit) {
				return queries;
			}
		}
	}

	return queries.length > 0 ? queries : ['editor'];
}

function extractQueryCandidates(input: string): string[] {
	const candidates = [
		...extractPhraseQueries(input),
		...tokenize(input),
	];

	return candidates;
}

function extractPhraseQueries(input: string): string[] {
	const words = input.match(/[A-Za-z][A-Za-z0-9_-]*/g) ?? [];
	const phrases: string[] = [];

	for (let index = 0; index < words.length - 1; index++) {
		const pair = `${words[index]} ${words[index + 1]}`;
		const normalized = pair.toLowerCase();
		if (STOP_WORDS.has(words[index].toLowerCase()) && STOP_WORDS.has(words[index + 1].toLowerCase())) {
			continue;
		}
		if (normalized.length >= 7) {
			phrases.push(pair);
		}
	}

	return phrases.slice(0, 4);
}

function tokenize(input: string): string[] {
	return input.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? [];
}

function basenameLabel(value: string): string {
	const normalized = value.replace(/\\/g, '/');
	const segments = normalized.split('/');
	return segments[segments.length - 1] || normalized;
}

function describeSymbolKind(kind: SymbolKind): string {
	switch (kind) {
		case SymbolKind.File: return 'File';
		case SymbolKind.Module: return 'Module';
		case SymbolKind.Namespace: return 'Namespace';
		case SymbolKind.Package: return 'Package';
		case SymbolKind.Class: return 'Class';
		case SymbolKind.Method: return 'Method';
		case SymbolKind.Property: return 'Property';
		case SymbolKind.Field: return 'Field';
		case SymbolKind.Constructor: return 'Constructor';
		case SymbolKind.Enum: return 'Enum';
		case SymbolKind.Interface: return 'Interface';
		case SymbolKind.Function: return 'Function';
		case SymbolKind.Variable: return 'Variable';
		case SymbolKind.Constant: return 'Constant';
		case SymbolKind.String: return 'String';
		case SymbolKind.Number: return 'Number';
		case SymbolKind.Boolean: return 'Boolean';
		case SymbolKind.Array: return 'Array';
		case SymbolKind.Object: return 'Object';
		case SymbolKind.Key: return 'Key';
		case SymbolKind.Null: return 'Null';
		case SymbolKind.EnumMember: return 'EnumMember';
		case SymbolKind.Struct: return 'Struct';
		case SymbolKind.Event: return 'Event';
		case SymbolKind.Operator: return 'Operator';
		case SymbolKind.TypeParameter: return 'TypeParameter';
		default: return 'Symbol';
	}
}

function mapPhaseToScope(phase: PlanningPhase, questionStage: PlanningQuestionStage): PlanningRepositoryScope {
	const baseScope = phase === 'focused-slice'
		? 'focused'
		: phase === 'detailed-inspection'
			? 'detailed'
			: 'broad';

	if (questionStage !== 'task-decomposition') {
		return baseScope;
	}

	switch (baseScope) {
		case 'broad':
			return 'focused';
		case 'focused':
			return 'detailed';
		default:
			return 'detailed';
	}
}

function getQueryLimitForScope(scope: PlanningRepositoryScope, questionStage: PlanningQuestionStage): number {
	switch (scope) {
		case 'focused':
			return questionStage === 'task-decomposition' ? 4 : 5;
		case 'detailed':
			return questionStage === 'task-decomposition' ? 3 : 4;
		default:
			return 7;
	}
}

function getSelectionAnchor(selectedText: string | undefined): string | undefined {
	if (!selectedText?.trim()) {
		return undefined;
	}

	const line = selectedText
		.split(/\r?\n/g)
		.map(value => value.trim())
		.find(value => value.length > 0);

	return line ? truncate(line, 64) : undefined;
}

function truncate(value: string, maxLength: number): string {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function scoreCandidate(chunks: readonly string[], focusTerms: readonly string[]): number {
	if (focusTerms.length === 0) {
		return 0;
	}

	const haystack = chunks.join(' ').toLowerCase();
	let score = 0;
	for (const term of focusTerms) {
		if (!term) {
			continue;
		}

		if (haystack.includes(term)) {
			score += 4;
		}

		score += computeTokenOverlap(haystack, term);
	}

	return score;
}

function computeTokenOverlap(haystack: string, query: string): number {
	const haystackTokens = new Set(tokenize(haystack.toLowerCase()).map(token => token.toLowerCase()));
	const queryTokens = tokenize(query.toLowerCase());
	if (!haystackTokens.size || !queryTokens.length) {
		return 0;
	}

	let matches = 0;
	for (const token of queryTokens) {
		if (haystackTokens.has(token)) {
			matches += 1;
		}
	}

	return matches / queryTokens.length;
}

function getDocumentPreview(
	lineCount: number,
	getLineContent: (lineNumber: number) => string,
	selection: { readonly startLineNumber: number; readonly endLineNumber: number } | undefined,
	focus: IPlanningFocusState,
): string {
	const detailLineBudget = focus.scope === 'detailed' ? 40 : focus.scope === 'focused' ? 28 : 16;
	const detailCharBudget = focus.scope === 'detailed' ? 3200 : focus.scope === 'focused' ? 2200 : 1400;

	let startLine = 1;
	let endLine = Math.min(lineCount, detailLineBudget);

	if (selection) {
		const leading = focus.scope === 'detailed' ? 8 : focus.scope === 'focused' ? 6 : 4;
		const trailing = focus.scope === 'detailed' ? 20 : focus.scope === 'focused' ? 14 : 8;
		startLine = Math.max(1, selection.startLineNumber - leading);
		endLine = Math.min(lineCount, selection.endLineNumber + trailing);
	} else if (focus.scope !== 'broad') {
		const matchingLine = findFirstMatchingLine(lineCount, getLineContent, focus.terms);
		if (matchingLine >= 1) {
			const leading = focus.scope === 'detailed' ? 10 : 8;
			const trailing = focus.scope === 'detailed' ? 24 : 18;
			startLine = Math.max(1, matchingLine - leading);
			endLine = Math.min(lineCount, matchingLine + trailing);
		}
	}

	const lines: string[] = [];
	for (let line = startLine; line <= endLine; line++) {
		lines.push(getLineContent(line));
	}

	return lines.join('\n').trim().slice(0, detailCharBudget);
}

function findFirstMatchingLine(lineCount: number, getLineContent: (lineNumber: number) => string, terms: readonly string[]): number {
	for (let line = 1; line <= lineCount; line++) {
		const text = getLineContent(line).toLowerCase();
		if (terms.some(term => text.includes(term))) {
			return line;
		}
	}

	return -1;
}
