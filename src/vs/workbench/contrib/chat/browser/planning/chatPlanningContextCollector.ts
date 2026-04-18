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
import { IPlanningFileSnippet, IPlanningRepositoryContext, IPlanningSymbolReference, IPlanningTarget, PlanningPhase, PlanningQuestionStage, PlanningRepositoryScope } from '../../common/planning/chatPlanningTransition.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.html', '.md', '.txt', '.csv', '.tsv', '.yaml', '.yml', '.sql']);
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
	readonly confirmedPlanningTarget?: IPlanningTarget;
	readonly activeEditor: ICodeEditor | undefined;
	readonly contextEditors?: readonly ICodeEditor[];
}

interface IPlanningFocusState {
	readonly phase: PlanningPhase;
	readonly questionStage: PlanningQuestionStage;
	readonly scope: PlanningRepositoryScope;
	readonly planningTarget?: IPlanningTarget;
	readonly queries: readonly string[];
	readonly terms: readonly string[];
	readonly summary: string;
}

interface IWorkspaceFolderInfo {
	readonly name: string;
	readonly uri: URI;
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
	const workspaceFolders = getWorkspaceFolders(services.workspaceContextService);
	const contextEditors = getContextEditors(input);
	const primaryEditor = getPrimaryContextEditor(input.activeEditor, contextEditors);
	const model = primaryEditor?.getModel();
	if (!model && workspaceFolders.length === 0) {
		return undefined;
	}

	const activeResource = model?.uri;
	const workspaceFolder = activeResource ? services.workspaceContextService.getWorkspaceFolder(activeResource) : undefined;
	const workspaceRoot = workspaceFolder?.uri ?? workspaceFolders[0]?.uri;
	const selection = primaryEditor?.getSelection();
	const selectedText = model && selection && !selection.isEmpty() ? model.getValueInRange(selection) : undefined;
	const activeDocumentSymbols = model ? await getActiveDocumentSymbols(services.languageFeaturesService, model) : [];
	const workingSetFiles = getWorkingSetFiles(contextEditors, workspaceFolders);
	const workspaceFolderLabels = workspaceFolders.map(folder => folder.name);
	const workspaceTopLevelEntries = workspaceFolders.length > 0
		? await getWorkspaceTopLevelEntries(services.fileService, workspaceFolders)
		: undefined;
	const planningTarget = inferPlanningTarget(
		input.confirmedPlanningTarget,
		activeResource,
		selectedText,
		workingSetFiles,
		workspaceFolder?.name,
		workspaceFolderLabels,
		workspaceRoot,
	);
	const focus = buildFocusState(input, selectedText, activeResource, activeDocumentSymbols, planningTarget, workingSetFiles, workspaceFolderLabels, workspaceTopLevelEntries);
	const workspaceSymbolMatches = workspaceRoot
		? await getWorkspaceSymbolMatches(focus)
		: [];
	const nearbyFiles = workspaceRoot && activeResource
		? await getNearbyFiles(services.fileService, workspaceRoot, activeResource, focus, workspaceFolders)
		: [];
	const relevantSnippets = activeResource ? await getRelevantSnippets(
		services.textModelService,
		workspaceFolders,
		activeResource,
		workspaceSymbolMatches,
		nearbyFiles,
		selection && !selection.isEmpty() ? selection : undefined,
		focus
	) : [];

	return {
		workspaceRoot: workspaceRoot?.toString(),
		scope: focus.scope,
		planningTarget,
		focusSummary: focus.summary,
		focusQueries: focus.queries,
		workspaceFolders: workspaceFolderLabels.length > 0 ? workspaceFolderLabels : undefined,
		workspaceTopLevelEntries,
		workingSetFiles: workingSetFiles.length > 0 ? workingSetFiles : undefined,
		activeDocumentSymbols,
		workspaceSymbolMatches,
		nearbyFiles,
		relevantSnippets,
	};
}

function getWorkspaceFolders(workspaceContextService: IWorkspaceContextService): IWorkspaceFolderInfo[] {
	return workspaceContextService.getWorkspace().folders.map(folder => ({
		name: folder.name,
		uri: folder.uri,
	}));
}

function getContextEditors(input: IPlanningContextCollectionInput): ICodeEditor[] {
	const editors = input.contextEditors?.length ? input.contextEditors : (input.activeEditor ? [input.activeEditor] : []);
	const seen = new Set<string>();
	const result: ICodeEditor[] = [];

	for (const editor of editors) {
		const resource = editor.getModel()?.uri;
		if (!resource) {
			continue;
		}

		const key = resource.toString();
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		result.push(editor);
	}

	return result;
}

function getPrimaryContextEditor(activeEditor: ICodeEditor | undefined, contextEditors: readonly ICodeEditor[]): ICodeEditor | undefined {
	if (activeEditor?.getModel()) {
		return activeEditor;
	}

	return contextEditors[0];
}

async function getWorkspaceTopLevelEntries(fileService: IFileService, workspaceFolders: readonly IWorkspaceFolderInfo[]): Promise<string[] | undefined> {
	const entries: string[] = [];
	for (const folder of workspaceFolders) {
		const stat = await fileService.resolve(folder.uri);
		for (const child of stat.children ?? []) {
			const label = workspaceFolders.length > 1 ? `${folder.name}/${basename(child.resource)}` : basename(child.resource);
			entries.push(label);
			if (entries.length >= 12) {
				return entries;
			}
		}
	}

	return entries.length > 0 ? entries : undefined;
}

function getWorkingSetFiles(contextEditors: readonly ICodeEditor[], workspaceFolders: readonly IWorkspaceFolderInfo[]): string[] {
	return contextEditors
		.map(editor => editor.getModel()?.uri)
		.filter((resource): resource is URI => !!resource)
		.map(resource => toWorkspaceLabel(resource, workspaceFolders, resource.toString()))
		.filter((value, index, values) => values.indexOf(value) === index)
		.slice(0, 8);
}

function inferPlanningTarget(
	confirmedPlanningTarget: IPlanningTarget | undefined,
	activeResource: URI | undefined,
	selectedText: string | undefined,
	workingSetFiles: readonly string[],
	workspaceFolderName: string | undefined,
	workspaceFolders: readonly string[],
	workspaceRoot: URI | undefined,
): IPlanningTarget | undefined {
	if (confirmedPlanningTarget) {
		return {
			...confirmedPlanningTarget,
			confidence: 'high',
		};
	}

	if (selectedText?.trim() && activeResource) {
		return {
			kind: 'selection',
			label: `${basename(activeResource)}: ${truncate(getSelectionAnchor(selectedText) ?? 'Selected code', 96)}`,
			resource: activeResource.toString(),
			confidence: 'high',
		};
	}

	if (activeResource) {
		return {
			kind: 'file',
			label: toWorkspaceLabel(activeResource, workspaceRoot ? [{ name: workspaceFolderName ?? basename(workspaceRoot), uri: workspaceRoot }] : [], activeResource.toString()),
			resource: activeResource.toString(),
			confidence: 'medium',
		};
	}

	if (workingSetFiles.length > 1) {
		return {
			kind: 'working-set',
			label: `${workingSetFiles[0]} +${workingSetFiles.length - 1} more`,
			confidence: 'medium',
		};
	}

	if (workingSetFiles.length === 1) {
		return {
			kind: 'file',
			label: workingSetFiles[0],
			confidence: 'medium',
		};
	}

	if (workspaceFolderName) {
		return {
			kind: 'folder',
			label: workspaceFolderName,
			resource: workspaceRoot?.toString(),
			confidence: 'low',
		};
	}

	if (workspaceFolders.length > 0) {
		return {
			kind: 'workspace',
			label: workspaceFolders.length === 1 ? workspaceFolders[0] : `${workspaceFolders.length} workspace folders`,
			confidence: 'low',
		};
	}

	return undefined;
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
	activeResource: URI | undefined,
	activeSymbols: readonly IPlanningSymbolReference[],
	planningTarget: IPlanningTarget | undefined,
	workingSetFiles: readonly string[],
	workspaceFolders: readonly string[],
	workspaceTopLevelEntries: readonly string[] | undefined,
): IPlanningFocusState {
	const scope = mapPhaseToScope(input.phase, input.questionStage);
	const queries = extractQueries(getStageOrderedInputs(input, selectedText, activeResource, activeSymbols, planningTarget, workingSetFiles, workspaceFolders, workspaceTopLevelEntries), getQueryLimitForScope(scope, input.questionStage));

	return {
		phase: input.phase,
		questionStage: input.questionStage,
		scope,
		planningTarget,
		queries,
		terms: queries.map(query => query.toLowerCase()),
		summary: buildFocusSummary(input.phase, input.questionStage, input.planningAnswers, input.userRequest, input.plannerNotes, input.recentConversation, activeResource, selectedText, planningTarget),
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

async function getNearbyFiles(fileService: IFileService, workspaceRoot: URI, activeResource: URI, focus: IPlanningFocusState, workspaceFolders: readonly IWorkspaceFolderInfo[]): Promise<string[]> {
	const maxFiles = focus.scope === 'detailed' ? 4 : focus.scope === 'focused' ? 6 : 12;
	const directoryStat = await fileService.resolve(extUri.dirname(activeResource));
	const children = directoryStat.children ?? [];

	return children
		.filter((child: IFileStat) => child.isFile)
		.filter((child: IFileStat) => SOURCE_EXTENSIONS.has(extUri.extname(child.resource)))
		.map((child: IFileStat) => toWorkspaceLabel(child.resource, workspaceFolders, extUri.relativePath(workspaceRoot, child.resource) ?? child.resource.toString()))
		.sort((left: string, right: string) => {
			const rightScore = scoreCandidate([right, basenameLabel(right)], focus.terms);
			const leftScore = scoreCandidate([left, basenameLabel(left)], focus.terms);
			return rightScore - leftScore || left.localeCompare(right);
		})
		.slice(0, maxFiles);
}

async function getRelevantSnippets(
	textModelService: ITextModelService,
	workspaceFolders: readonly IWorkspaceFolderInfo[],
	activeResource: URI,
	workspaceSymbols: readonly IPlanningSymbolReference[],
	nearbyFiles: readonly string[],
	selection: { readonly startLineNumber: number; readonly endLineNumber: number } | undefined,
	focus: IPlanningFocusState,
): Promise<IPlanningRepositoryContext['relevantSnippets']> {
	const snippets: IPlanningFileSnippet[] = [];
	const seen = new Set<string>();
	const maxSnippets = focus.scope === 'detailed' ? 5 : focus.scope === 'focused' ? 4 : 3;

	const activeSnippet = await createSnippet(textModelService, activeResource, workspaceFolders, selection, focus, activeResource.toString(), focus.scope === 'detailed'
		? focus.questionStage === 'goal-clarity'
			? 'Goal-clarity anchor from the active selection and narrowed context.'
			: 'Implementation anchor from the active selection and narrowed plan context.'
		: focus.scope === 'focused'
			? focus.questionStage === 'goal-clarity'
				? 'Focused around the active selection and the strongest goal-clarity signals.'
				: 'Focused around the active selection and the strongest plan-refinement signals.'
			: focus.questionStage === 'goal-clarity'
				? 'Broad goal-clarity anchor from the active editor.'
				: 'Early refinement anchor from the active editor.');
	if (activeSnippet) {
		snippets.push(activeSnippet);
		seen.add(activeResource.toString());
	}

	for (const symbol of workspaceSymbols) {
		if (!symbol.file || seen.has(symbol.file)) {
			continue;
		}

		const snippet = await createSnippet(textModelService, URI.parse(symbol.file), workspaceFolders, undefined, focus, symbol.file, focus.scope === 'detailed'
			? focus.questionStage === 'goal-clarity'
				? `Deep dive candidate because ${symbol.name} remains central to clarifying the goal and scope.`
				: `Deep dive candidate because ${symbol.name} remains central to the narrowed plan refinement.`
			: focus.scope === 'focused'
				? focus.questionStage === 'goal-clarity'
					? `Expanded because ${symbol.name} aligns with the current goal-clarity answers.`
					: `Expanded because ${symbol.name} aligns with the current refinement answers and insertion-point signals.`
				: focus.questionStage === 'goal-clarity'
					? `Included because ${symbol.name} looks relevant to the initial goal-clarity pass.`
					: `Included because ${symbol.name} looks relevant to the current refinement pass.`);
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
		const candidate = resolveWorkspaceLabel(relativePath, workspaceFolders);
		if (!candidate) {
			continue;
		}
		if (seen.has(candidate.toString())) {
			continue;
		}

		const snippet = await createSnippet(textModelService, candidate, workspaceFolders, undefined, focus, relativePath, focus.scope === 'detailed'
			? focus.questionStage === 'goal-clarity'
				? 'Retained because it still informs the final clarified scope.'
				: 'Retained for the detailed refinement pass.'
			: focus.scope === 'focused'
				? focus.questionStage === 'goal-clarity'
					? 'Expanded because the file still informs the narrowed goal-clarity slice.'
					: 'Expanded because the file remains in the narrowed refinement working set.'
				: focus.questionStage === 'goal-clarity'
					? 'Nearby file from the broad goal-clarity pass.'
					: 'Nearby file from the early refinement pass.');
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
	workspaceFolders: readonly IWorkspaceFolderInfo[],
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
				path: toWorkspaceLabel(resource, workspaceFolders, pathLabel),
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
	activeResource: URI | undefined,
	activeSymbols: readonly IPlanningSymbolReference[],
	planningTarget: IPlanningTarget | undefined,
	workingSetFiles: readonly string[],
	workspaceFolders: readonly string[],
	workspaceTopLevelEntries: readonly string[] | undefined,
): string[] {
	const activeFileName = activeResource ? basename(activeResource) : '';
	const planningTargetLabel = planningTarget?.label ?? '';
	const workingSetPreview = workingSetFiles.slice(0, 4).join(' ');
	const workspaceFolderPreview = workspaceFolders.slice(0, 3).join(' ');
	const topLevelPreview = workspaceTopLevelEntries?.slice(0, 4).join(' ') ?? '';
	if (input.questionStage !== 'goal-clarity') {
		switch (input.phase) {
			case 'detailed-inspection':
				return [
					...input.planningAnswers,
					planningTargetLabel,
					selectedText ?? '',
					...activeSymbols.map(symbol => `${symbol.name} ${symbol.containerName ?? ''}`),
					workingSetPreview,
					activeFileName,
					topLevelPreview,
					input.userRequest,
					input.plannerNotes ?? '',
					...input.recentConversation,
				];
			case 'focused-slice':
				return [
					...input.planningAnswers,
					planningTargetLabel,
					selectedText ?? '',
					activeFileName,
					...activeSymbols.map(symbol => `${symbol.name} ${symbol.containerName ?? ''}`),
					workingSetPreview,
					input.userRequest,
					input.plannerNotes ?? '',
					...input.recentConversation,
				];
			default:
				return [
					...input.planningAnswers,
					planningTargetLabel,
					input.userRequest,
					selectedText ?? '',
					activeFileName,
					...activeSymbols.map(symbol => symbol.name),
					workingSetPreview,
					topLevelPreview,
					input.plannerNotes ?? '',
					...input.recentConversation,
				];
		}
	}

	switch (input.phase) {
		case 'focused-slice':
			return [
				input.userRequest,
				planningTargetLabel,
				input.plannerNotes ?? '',
				...input.planningAnswers,
				selectedText ?? '',
				...input.recentConversation,
				...activeSymbols.map(symbol => `${symbol.name} ${symbol.containerName ?? ''}`),
				activeFileName,
				workingSetPreview,
			];
		case 'detailed-inspection':
			return [
				input.userRequest,
				planningTargetLabel,
				...input.planningAnswers,
				input.plannerNotes ?? '',
				selectedText ?? '',
				...activeSymbols.map(symbol => `${symbol.name} ${symbol.containerName ?? ''}`),
				activeFileName,
				workingSetPreview,
				...input.recentConversation,
			];
		default:
			return [
				input.userRequest,
				planningTargetLabel,
				input.plannerNotes ?? '',
				selectedText ?? '',
				...input.recentConversation,
				...activeSymbols.map(symbol => symbol.name),
				activeFileName,
				workspaceFolderPreview,
				topLevelPreview,
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
	activeResource: URI | undefined,
	selectedText: string | undefined,
	planningTarget: IPlanningTarget | undefined,
): string {
	const stageLabel = questionStage === 'goal-clarity'
		? 'Goal clarity'
		: questionStage === 'task-decomposition'
			? 'Task decomposition'
			: 'Plan focus';
	const selected = planningAnswers.slice(0, questionStage === 'goal-clarity' ? 3 : 4).join(', ');
	const anchors = [selected, plannerNotes?.trim() || '', userRequest.trim(), recentConversation[0] || ''].filter(value => value.length > 0);
	const selectionAnchor = getSelectionAnchor(selectedText);
	const fileAnchor = planningTarget?.label || (activeResource ? basename(activeResource) : 'the current workspace');

	if (questionStage === 'plan-focus') {
		return anchors.length > 0
			? `Plan focus around ${anchors[0]}. Tighten the revised plan in ${fileAnchor}${selectionAnchor ? ` near ${selectionAnchor}` : ''}.`
			: `Plan focus in ${fileAnchor}.`;
	}

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
		...extractFileLikeQueries(input),
		...extractPhraseQueries(input),
		...tokenize(input),
	];

	return candidates;
}

function extractFileLikeQueries(input: string): string[] {
	return input.match(/(?:[A-Za-z0-9_.-]+[\\/])*[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g) ?? [];
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

function toWorkspaceLabel(resource: URI, workspaceFolders: readonly IWorkspaceFolderInfo[], fallback: string): string {
	for (const folder of workspaceFolders) {
		if (!extUri.isEqualOrParent(resource, folder.uri)) {
			continue;
		}

		const relativePath = extUri.relativePath(folder.uri, resource);
		if (!relativePath) {
			return workspaceFolders.length > 1 ? folder.name : fallback;
		}

		return workspaceFolders.length > 1 ? `${folder.name}/${relativePath}` : relativePath;
	}

	return fallback;
}

function resolveWorkspaceLabel(label: string, workspaceFolders: readonly IWorkspaceFolderInfo[]): URI | undefined {
	const normalized = label.replace(/\\/g, '/');
	for (const folder of workspaceFolders) {
		if (workspaceFolders.length > 1) {
			const prefix = `${folder.name}/`;
			if (normalized.startsWith(prefix)) {
				return extUri.joinPath(folder.uri, normalized.slice(prefix.length));
			}
			if (normalized === folder.name) {
				return folder.uri;
			}
			continue;
		}

		return extUri.joinPath(folder.uri, normalized);
	}

	return undefined;
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

	if (questionStage === 'plan-focus') {
		return 'detailed';
	}

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
	if (questionStage === 'plan-focus') {
		return scope === 'detailed' ? 3 : 4;
	}

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
