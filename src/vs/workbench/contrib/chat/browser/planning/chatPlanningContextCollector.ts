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
import { IPlanningFileSnippet, IPlanningRepositoryContext, IPlanningSymbolReference, IPlanningTarget, IPlanningTaskLens, isConcretePlanningArtifactReference, PlanningArtifactType, PlanningDeliverableType, PlanningPhase, PlanningQuestionStage, PlanningRepositoryScope, PlanningRequestIntent } from '../../common/planning/chatPlanningTransition.js';

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
	readonly currentPlan?: string;
	readonly focusHint?: string;
	readonly previousRepositoryContext?: IPlanningRepositoryContext;
	readonly confirmedPlanningTarget?: IPlanningTarget;
	readonly activeEditor: ICodeEditor | undefined;
	readonly contextEditors?: readonly ICodeEditor[];
}

interface IPlanningFocusState {
	readonly phase: PlanningPhase;
	readonly questionStage: PlanningQuestionStage;
	readonly scope: PlanningRepositoryScope;
	readonly planningTarget?: IPlanningTarget;
	readonly requestIntent: PlanningRequestIntent;
	readonly taskLens?: IPlanningTaskLens;
	readonly primaryArtifactHint?: string;
	readonly relatedArtifactHints: readonly string[];
	readonly queries: readonly string[];
	readonly terms: readonly string[];
	readonly summary: string;
}

interface IWorkspaceFolderInfo {
	readonly name: string;
	readonly uri: URI;
}

interface IArtifactInference {
	readonly primaryArtifactHint?: string;
	readonly relatedArtifactHints: readonly string[];
	readonly inferredTarget?: IPlanningTarget;
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
	const previousRepositoryContext = input.previousRepositoryContext;
	if (!model && workspaceFolders.length === 0) {
		return undefined;
	}

	const activeResource = model?.uri ?? resolvePreviousPlanningResource(previousRepositoryContext, workspaceFolders);
	const workspaceFolder = activeResource ? services.workspaceContextService.getWorkspaceFolder(activeResource) : undefined;
	const workspaceRoot = workspaceFolder?.uri ?? workspaceFolders[0]?.uri;
	const selection = primaryEditor?.getSelection();
	const selectedText = model && selection && !selection.isEmpty() ? model.getValueInRange(selection) : undefined;
	const activeDocumentSymbols = model ? await getActiveDocumentSymbols(services.languageFeaturesService, model) : previousRepositoryContext?.activeDocumentSymbols ?? [];
	const workingSetFiles = mergeStringArrays(
		getWorkingSetFiles(contextEditors, workspaceFolders),
		previousRepositoryContext?.workingSetFiles ?? []
	).slice(0, 8);
	const workspaceFolderLabels = workspaceFolders.map(folder => folder.name);
	const workspaceTopLevelEntries = previousRepositoryContext?.workspaceTopLevelEntries?.length
		? [...previousRepositoryContext.workspaceTopLevelEntries]
		: workspaceFolders.length > 0
			? await getWorkspaceTopLevelEntries(services.fileService, workspaceFolders)
			: undefined;
	const requestIntent = inferRequestIntent(input);
	const artifactInference = inferArtifactHints(
		input,
		requestIntent,
		activeResource,
		workingSetFiles,
		workspaceFolders,
		workspaceTopLevelEntries,
		previousRepositoryContext,
		workspaceRoot,
	);
	const taskLens = buildPlanningTaskLens(
		input,
		requestIntent,
		artifactInference.primaryArtifactHint,
		artifactInference.relatedArtifactHints,
		artifactInference.inferredTarget,
		activeResource,
		selectedText,
		activeDocumentSymbols,
	);
	const planningTarget = inferPlanningTarget(
		input.confirmedPlanningTarget,
		activeResource,
		selectedText,
		workingSetFiles,
		workspaceFolder?.name,
		workspaceFolderLabels,
		workspaceRoot,
		artifactInference.inferredTarget,
	);
	const focus = buildFocusState(
		input,
		selectedText,
		activeResource,
		activeDocumentSymbols,
		planningTarget,
		requestIntent,
		taskLens,
		artifactInference.primaryArtifactHint,
		artifactInference.relatedArtifactHints,
		workingSetFiles,
		workspaceFolderLabels,
		workspaceTopLevelEntries
	);
	const workspaceSymbolMatches = workspaceRoot
		? await getWorkspaceSymbolMatches(focus, previousRepositoryContext?.workspaceSymbolMatches)
		: previousRepositoryContext?.workspaceSymbolMatches ?? [];
	const nearbyFiles = workspaceRoot && activeResource
		? await getNearbyFiles(services.fileService, workspaceRoot, activeResource, focus, workspaceFolders, previousRepositoryContext?.nearbyFiles)
		: previousRepositoryContext?.nearbyFiles ?? [];
	const relevantSnippets = activeResource ? await getRelevantSnippets(
		services.textModelService,
		workspaceFolders,
		activeResource,
		workspaceSymbolMatches,
		nearbyFiles,
		selection && !selection.isEmpty() ? selection : undefined,
		focus,
		previousRepositoryContext?.relevantSnippets
	) : previousRepositoryContext?.relevantSnippets ?? [];

	return {
		workspaceRoot: workspaceRoot?.toString(),
		scope: focus.scope,
		planningTarget,
		requestIntent,
		taskLens,
		primaryArtifactHint: artifactInference.primaryArtifactHint,
		relatedArtifactHints: artifactInference.relatedArtifactHints.length > 0 ? artifactInference.relatedArtifactHints : undefined,
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
	inferredArtifactTarget: IPlanningTarget | undefined,
): IPlanningTarget | undefined {
	if (confirmedPlanningTarget) {
		return {
			...confirmedPlanningTarget,
			confidence: 'high',
		};
	}

	if (inferredArtifactTarget) {
		return inferredArtifactTarget;
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
	requestIntent: PlanningRequestIntent,
	taskLens: IPlanningTaskLens | undefined,
	primaryArtifactHint: string | undefined,
	relatedArtifactHints: readonly string[],
	workingSetFiles: readonly string[],
	workspaceFolders: readonly string[],
	workspaceTopLevelEntries: readonly string[] | undefined,
): IPlanningFocusState {
	const scope = mapPhaseToScope(input.phase, input.questionStage);
	const queries = extractQueries(
		getStageOrderedInputs(input, selectedText, activeResource, activeSymbols, planningTarget, requestIntent, taskLens, primaryArtifactHint, relatedArtifactHints, workingSetFiles, workspaceFolders, workspaceTopLevelEntries),
		getQueryLimitForScope(scope, input.questionStage, !!input.previousRepositoryContext)
	);

	return {
		phase: input.phase,
		questionStage: input.questionStage,
		scope,
		planningTarget,
		requestIntent,
		taskLens,
		primaryArtifactHint,
		relatedArtifactHints,
		queries,
		terms: queries.map(query => query.toLowerCase()),
		summary: buildFocusSummary(input.phase, input.questionStage, input.planningAnswers, input.userRequest, input.plannerNotes, input.recentConversation, input.currentPlan, input.focusHint, activeResource, selectedText, planningTarget, requestIntent, taskLens, primaryArtifactHint, relatedArtifactHints),
	};
}

async function getWorkspaceSymbolMatches(focus: IPlanningFocusState, previousMatches: readonly IPlanningSymbolReference[] = []): Promise<IPlanningSymbolReference[]> {
	const maxMatches = focus.scope === 'detailed' ? 4 : focus.scope === 'focused' ? 6 : 12;
	const matches = new Map<string, IPlanningSymbolReference & { score: number }>();
	const seedMatches = previousMatches
		.map(symbol => ({
			...symbol,
			score: scoreCandidate([symbol.name, symbol.containerName ?? '', symbol.file ?? ''], focus.terms),
		}))
		.filter(symbol => symbol.score > 0)
		.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
		.slice(0, maxMatches);

	for (const symbol of seedMatches) {
		matches.set(`${symbol.name}:${symbol.file ?? ''}`, symbol);
	}

	const queryBudget = matches.size >= Math.min(2, maxMatches)
		? focus.questionStage === 'goal-clarity'
			? focus.queries.length
			: Math.min(focus.queries.length, focus.questionStage === 'plan-focus' ? 1 : 2)
		: focus.queries.length;

	for (const query of focus.queries.slice(0, queryBudget)) {
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

async function getNearbyFiles(
	fileService: IFileService,
	workspaceRoot: URI,
	activeResource: URI,
	focus: IPlanningFocusState,
	workspaceFolders: readonly IWorkspaceFolderInfo[],
	previousNearbyFiles: readonly string[] = [],
): Promise<string[]> {
	const maxFiles = focus.scope === 'detailed' ? 4 : focus.scope === 'focused' ? 6 : 12;
	const directoryStat = await fileService.resolve(extUri.dirname(activeResource));
	const children = directoryStat.children ?? [];
	const nearbyFiles = children
		.filter((child: IFileStat) => child.isFile)
		.filter((child: IFileStat) => SOURCE_EXTENSIONS.has(extUri.extname(child.resource)))
		.map((child: IFileStat) => toWorkspaceLabel(child.resource, workspaceFolders, extUri.relativePath(workspaceRoot, child.resource) ?? child.resource.toString()))
		.sort((left: string, right: string) => {
			const rightScore = scoreCandidate([right, basenameLabel(right)], focus.terms);
			const leftScore = scoreCandidate([left, basenameLabel(left)], focus.terms);
			return rightScore - leftScore || left.localeCompare(right);
		})
		.slice(0, maxFiles);

	return mergeStringArrays(nearbyFiles, previousNearbyFiles).slice(0, maxFiles);
}

async function getRelevantSnippets(
	textModelService: ITextModelService,
	workspaceFolders: readonly IWorkspaceFolderInfo[],
	activeResource: URI,
	workspaceSymbols: readonly IPlanningSymbolReference[],
	nearbyFiles: readonly string[],
	selection: { readonly startLineNumber: number; readonly endLineNumber: number } | undefined,
	focus: IPlanningFocusState,
	previousSnippets: readonly IPlanningFileSnippet[] = [],
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

	for (const snippet of previousSnippets) {
		if (seen.has(snippet.path)) {
			continue;
		}

		if (scoreCandidate([snippet.path, snippet.preview, snippet.reason ?? ''], focus.terms) <= 0) {
			continue;
		}

		snippets.push(snippet);
		seen.add(snippet.path);
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

function inferRequestIntent(input: IPlanningContextCollectionInput): PlanningRequestIntent {
	const combined = [
		input.userRequest,
		input.plannerNotes ?? '',
		input.focusHint ?? '',
		input.currentPlan ?? '',
		...input.planningAnswers,
		...input.recentConversation,
	].join('\n').toLowerCase();

	if (/\b(csv|tsv|dataset|data file|table|spreadsheet|query result|summari[sz]e data|profile data|schema)\b/.test(combined)) {
		return 'data-analysis';
	}

	if (/\b(test|spec|coverage|assert|harness|snapshot)\b/.test(combined)) {
		return 'test-work';
	}

	if (/\b(fix|bug|broken|failing|failure|error|regression|crash|issue)\b/.test(combined)) {
		return 'bug-fix';
	}

	if (/\b(refactor|cleanup|simplify|rename|extract|restructure|decouple)\b/.test(combined)) {
		return 'refactor';
	}

	if (/\b(script|python|notebook|ipynb|bash|shell script|cli)\b|\.py\b/.test(combined)) {
		return 'script-work';
	}

	if (/\b(add|implement|create|introduce|support|build|design)\b/.test(combined)) {
		return 'feature-work';
	}

	if (/\b(investigate|understand|explore|inspect|trace|look into)\b/.test(combined)) {
		return 'investigation';
	}

	return 'generic';
}

function inferArtifactHints(
	input: IPlanningContextCollectionInput,
	requestIntent: PlanningRequestIntent,
	activeResource: URI | undefined,
	workingSetFiles: readonly string[],
	workspaceFolders: readonly IWorkspaceFolderInfo[],
	workspaceTopLevelEntries: readonly string[] | undefined,
	previousRepositoryContext: IPlanningRepositoryContext | undefined,
	workspaceRoot: URI | undefined,
): IArtifactInference {
	const explicitMentions = extractExplicitArtifactMentions([
		input.userRequest,
		input.plannerNotes ?? '',
		input.focusHint ?? '',
		...input.planningAnswers,
	]);
	const requestedExtension = inferRequestedArtifactExtension(input.userRequest, requestIntent);
	const activeResourceLabel = activeResource ? toWorkspaceLabel(activeResource, workspaceFolders, activeResource.toString()) : undefined;
	const matchingWorkingSet = requestedExtension
		? workingSetFiles.filter(file => file.toLowerCase().endsWith(requestedExtension))
		: [];
	const matchingTopLevelEntries = requestedExtension
		? (workspaceTopLevelEntries ?? []).filter(entry => entry.toLowerCase().endsWith(requestedExtension))
		: [];
	const previousPrimaryArtifactHint = isConcretePlanningArtifactReference(previousRepositoryContext?.primaryArtifactHint)
		? previousRepositoryContext?.primaryArtifactHint
		: undefined;
	const relatedArtifactHints = mergeStringArrays(
		explicitMentions.slice(1),
		mergeStringArrays(
			mergeStringArrays(
				matchingWorkingSet.filter(file => file !== explicitMentions[0]),
				matchingTopLevelEntries.filter(file => file !== explicitMentions[0])
			),
			mergeStringArrays(
				previousRepositoryContext?.relatedArtifactHints ?? [],
				previousPrimaryArtifactHint && previousPrimaryArtifactHint !== explicitMentions[0] ? [previousPrimaryArtifactHint] : []
			)
		)
	).slice(0, 6);

	let primaryArtifactHint: string | undefined = explicitMentions[0]
		?? (requestedExtension && activeResourceLabel?.toLowerCase().endsWith(requestedExtension) ? activeResourceLabel : undefined)
		?? (matchingWorkingSet.length === 1 ? matchingWorkingSet[0] : undefined)
		?? (matchingTopLevelEntries.length === 1 ? matchingTopLevelEntries[0] : undefined)
		?? previousPrimaryArtifactHint;

	if (!primaryArtifactHint) {
		primaryArtifactHint = buildGenericArtifactHint(requestIntent, requestedExtension, activeResourceLabel, workspaceTopLevelEntries);
	}

	const inferredTarget = explicitMentions[0]
		? {
			kind: 'file',
			label: explicitMentions[0],
			resource: resolveArtifactResource(explicitMentions[0], workspaceFolders)?.toString(),
			confidence: 'high',
		} satisfies IPlanningTarget
		: requestedExtension && activeResource && activeResourceLabel && activeResourceLabel.toLowerCase().endsWith(requestedExtension)
			? {
				kind: 'file',
				label: activeResourceLabel,
				resource: activeResource.toString(),
				confidence: 'high',
			} satisfies IPlanningTarget
			: matchingWorkingSet.length > 0
				? {
					kind: 'file',
					label: matchingWorkingSet[0],
					resource: resolveArtifactResource(matchingWorkingSet[0], workspaceFolders)?.toString() ?? workspaceRoot?.toString(),
					confidence: 'medium',
				} satisfies IPlanningTarget
				: undefined;

	return {
		primaryArtifactHint,
		relatedArtifactHints,
		inferredTarget,
	};
}

function buildPlanningTaskLens(
	input: IPlanningContextCollectionInput,
	requestIntent: PlanningRequestIntent,
	primaryArtifactHint: string | undefined,
	relatedArtifactHints: readonly string[],
	inferredTarget: IPlanningTarget | undefined,
	activeResource: URI | undefined,
	selectedText: string | undefined,
	activeSymbols: readonly IPlanningSymbolReference[],
): IPlanningTaskLens {
	const requestNeedsExplicitArtifact = !!primaryArtifactHint && !isConcretePlanningArtifactReference(primaryArtifactHint);
	const primaryArtifact = isConcretePlanningArtifactReference(primaryArtifactHint)
		? primaryArtifactHint
		: inferredTarget?.label
		?? (!requestNeedsExplicitArtifact && activeResource ? basename(activeResource) : undefined);
	const artifactType = inferArtifactType(requestIntent, inferredTarget, primaryArtifact, selectedText, activeSymbols);
	const desiredOutcome = extractDesiredOutcome(input, requestIntent, primaryArtifact);
	const deliverableType = inferDeliverableType(requestIntent, input.userRequest);
	const planAreas = extractTaskLensPlanAreas(input.currentPlan, input.focusHint, activeSymbols, primaryArtifact);
	const validationTargets = extractValidationTargets(input, requestIntent, relatedArtifactHints, primaryArtifact);
	const riskAreas = extractRiskAreas(input);
	const unknowns = buildTaskLensUnknowns(input, primaryArtifact, relatedArtifactHints, desiredOutcome, validationTargets, riskAreas, planAreas);
	const taskSummary = buildTaskSummary(requestIntent, desiredOutcome, primaryArtifact, input.focusHint);

	return {
		taskKind: requestIntent,
		...(taskSummary ? { taskSummary } : {}),
		...(primaryArtifact ? { primaryArtifact } : {}),
		...(relatedArtifactHints.length > 0 ? { secondaryArtifacts: relatedArtifactHints } : {}),
		...(artifactType ? { artifactType } : {}),
		...(desiredOutcome ? { desiredOutcome } : {}),
		...(deliverableType ? { deliverableType } : {}),
		...(riskAreas.length > 0 ? { riskAreas } : {}),
		...(unknowns.length > 0 ? { unknowns } : {}),
		...(validationTargets.length > 0 ? { validationTargets } : {}),
		...(planAreas.length > 0 ? { planAreas } : {}),
	};
}

function inferArtifactType(
	requestIntent: PlanningRequestIntent,
	inferredTarget: IPlanningTarget | undefined,
	primaryArtifact: string | undefined,
	selectedText: string | undefined,
	activeSymbols: readonly IPlanningSymbolReference[],
): PlanningArtifactType | undefined {
	if (requestIntent === 'data-analysis') {
		return 'dataset';
	}

	if (requestIntent === 'test-work') {
		return 'test';
	}

	switch (inferredTarget?.kind) {
		case 'folder':
			return 'folder';
		case 'workspace':
			return 'workspace';
		case 'selection':
			return activeSymbols.length > 0 ? 'symbol' : 'subsystem';
	}

	if (selectedText && activeSymbols.length > 0) {
		return 'symbol';
	}

	if (primaryArtifact && looksLikeFilePath(primaryArtifact)) {
		return 'file';
	}

	if (primaryArtifact && /\b(api|endpoint|contract|surface)\b/i.test(primaryArtifact)) {
		return 'api-surface';
	}

	if (activeSymbols.length > 0) {
		return 'symbol';
	}

	if (primaryArtifact) {
		return 'subsystem';
	}

	return undefined;
}

function inferDeliverableType(requestIntent: PlanningRequestIntent, userRequest: string): PlanningDeliverableType {
	if (requestIntent === 'data-analysis') {
		return 'analysis';
	}

	if (requestIntent === 'investigation' || /\b(explain|understand|investigate|analy[sz]e)\b/i.test(userRequest)) {
		return 'explanation';
	}

	if (requestIntent === 'refactor') {
		return 'refactor';
	}

	if (requestIntent === 'test-work') {
		return 'validation';
	}

	if (/\bplan\b/i.test(userRequest) && !/\b(add|implement|fix|update|refactor|analy[sz]e)\b/i.test(userRequest)) {
		return 'plan';
	}

	return 'code-change';
}

function extractDesiredOutcome(
	input: IPlanningContextCollectionInput,
	_requestIntent: PlanningRequestIntent,
	_primaryArtifact: string | undefined,
): string | undefined {
	const answerMatch = findMatchingPlanningAnswer(input.planningAnswers, /\b(goal|outcome|success|done|deliverable|result|focus|complete)\b/i);
	if (answerMatch) {
		return answerMatch;
	}

	if (input.questionStage === 'plan-focus' && input.focusHint?.trim()) {
		return summarizeSentence(`Sharpen ${input.focusHint.trim()} in the current plan.`, 180);
	}

	return summarizeSentence(input.userRequest, 180);
}

function extractValidationTargets(
	input: IPlanningContextCollectionInput,
	requestIntent: PlanningRequestIntent,
	relatedArtifactHints: readonly string[],
	primaryArtifact: string | undefined,
): string[] {
	const relatedValidationArtifacts = relatedArtifactHints.filter(artifact => /\b(schema|test|spec|snapshot|fixture)\b|(?:^|\/).+\.(?:spec|test)\.[^.]+$/i.test(artifact));
	const textTargets = extractRelevantFragments([
		input.userRequest,
		input.plannerNotes ?? '',
		input.currentPlan ?? '',
		...input.planningAnswers,
		...input.recentConversation,
	], /\b(test|validate|validation|verify|schema|assert|coverage|regression|check)\b/i, 4);
	const defaults = requestIntent === 'data-analysis' && primaryArtifact
		? [`Analysis output for ${primaryArtifact}`]
		: requestIntent === 'bug-fix'
			? ['Regression coverage']
			: requestIntent === 'feature-work'
				? ['Acceptance validation']
				: [];

	return mergeStringArrays(mergeStringArrays(relatedValidationArtifacts, textTargets), defaults).slice(0, 5);
}

function extractRiskAreas(input: IPlanningContextCollectionInput): string[] {
	return extractRelevantFragments([
		input.userRequest,
		input.plannerNotes ?? '',
		input.currentPlan ?? '',
		...input.planningAnswers,
		...input.recentConversation,
	], /\b(avoid|without|keep|preserve|compatible|unchanged|regression|risk|careful|do not|don't|must not|limit|dependency|migration)\b/i, 4);
}

function extractTaskLensPlanAreas(
	currentPlan: string | undefined,
	focusHint: string | undefined,
	activeSymbols: readonly IPlanningSymbolReference[],
	primaryArtifact: string | undefined,
): string[] {
	const areas = new Set<string>();
	const pushArea = (value: string | undefined) => {
		const normalized = normalizePlanArea(value);
		if (!normalized) {
			return;
		}

		areas.add(normalized);
	};

	pushArea(focusHint);

	for (const line of currentPlan?.split(/\r?\n/g) ?? []) {
		pushArea(line);
		if (areas.size >= 5) {
			break;
		}
	}

	for (const symbol of activeSymbols) {
		pushArea(`${symbol.name}${symbol.containerName ? ` in ${symbol.containerName}` : ''}`);
		if (areas.size >= 5) {
			break;
		}
	}

	pushArea(primaryArtifact ? `Work in ${primaryArtifact}` : undefined);
	return [...areas].slice(0, 5);
}

function buildTaskLensUnknowns(
	input: IPlanningContextCollectionInput,
	primaryArtifact: string | undefined,
	relatedArtifactHints: readonly string[],
	desiredOutcome: string | undefined,
	validationTargets: readonly string[],
	riskAreas: readonly string[],
	planAreas: readonly string[],
): string[] {
	const unknowns: string[] = [];
	if (!primaryArtifact) {
		unknowns.push('Exact file, folder, or subsystem');
	}
	if (!desiredOutcome) {
		unknowns.push('Desired outcome');
	}
	if (validationTargets.length === 0) {
		unknowns.push('Validation path');
	}
	if (riskAreas.length === 0) {
		unknowns.push('Constraints or guardrails');
	}
	if (input.questionStage !== 'goal-clarity' && planAreas.length === 0) {
		unknowns.push('Concrete work breakdown');
	}
	if (relatedArtifactHints.length === 0 && /\b(with|against|alongside|related|dependency|depends on)\b/i.test(input.userRequest)) {
		unknowns.push('Related files or dependencies');
	}
	if (input.questionStage === 'plan-focus' && !input.focusHint?.trim()) {
		unknowns.push('Specific part of the plan to sharpen');
	}
	return unknowns.slice(0, 5);
}

function buildTaskSummary(
	requestIntent: PlanningRequestIntent,
	desiredOutcome: string | undefined,
	primaryArtifact: string | undefined,
	focusHint: string | undefined,
): string | undefined {
	if (desiredOutcome && primaryArtifact) {
		return `${desiredOutcome} Keep ${primaryArtifact} as the main anchor.`;
	}

	if (focusHint?.trim() && primaryArtifact) {
		return `${capitalizeFirstLetter(formatRequestIntent(requestIntent))} around ${focusHint.trim()} in ${primaryArtifact}.`;
	}

	if (desiredOutcome) {
		return desiredOutcome;
	}

	if (primaryArtifact) {
		return `${capitalizeFirstLetter(formatRequestIntent(requestIntent))} around ${primaryArtifact}.`;
	}

	return undefined;
}

function getStageOrderedInputs(
	input: IPlanningContextCollectionInput,
	selectedText: string | undefined,
	activeResource: URI | undefined,
	activeSymbols: readonly IPlanningSymbolReference[],
	planningTarget: IPlanningTarget | undefined,
	requestIntent: PlanningRequestIntent,
	taskLens: IPlanningTaskLens | undefined,
	primaryArtifactHint: string | undefined,
	relatedArtifactHints: readonly string[],
	workingSetFiles: readonly string[],
	workspaceFolders: readonly string[],
	workspaceTopLevelEntries: readonly string[] | undefined,
): string[] {
	const activeFileName = activeResource ? basename(activeResource) : '';
	const planningTargetLabel = planningTarget?.label ?? '';
	const requestIntentLabel = formatRequestIntent(requestIntent);
	const taskSummary = taskLens?.taskSummary ?? '';
	const desiredOutcome = taskLens?.desiredOutcome ?? '';
	const planAreasPreview = taskLens?.planAreas?.slice(0, 3).join(' ') ?? '';
	const validationPreview = taskLens?.validationTargets?.slice(0, 3).join(' ') ?? '';
	const riskPreview = taskLens?.riskAreas?.slice(0, 3).join(' ') ?? '';
	const unknownsPreview = taskLens?.unknowns?.slice(0, 3).join(' ') ?? '';
	const artifactPreview = [primaryArtifactHint ?? '', ...relatedArtifactHints.slice(0, 3)].join(' ');
	const normalizedFocusHint = input.focusHint?.trim() ?? '';
	const planPreview = summarizeCurrentPlan(input.currentPlan);
	const workingSetPreview = workingSetFiles.slice(0, 4).join(' ');
	const previousFocusPreview = input.previousRepositoryContext?.focusQueries.slice(0, 4).join(' ') ?? '';
	const previousNearbyPreview = input.previousRepositoryContext?.nearbyFiles.slice(0, 3).join(' ') ?? '';
	const workspaceFolderPreview = workspaceFolders.slice(0, 3).join(' ');
	const topLevelPreview = workspaceTopLevelEntries?.slice(0, 4).join(' ') ?? '';
	if (input.questionStage === 'plan-focus') {
		return [
			normalizedFocusHint,
			taskSummary,
			desiredOutcome,
			planPreview,
			planAreasPreview,
			validationPreview,
			riskPreview,
			unknownsPreview,
			requestIntentLabel,
			artifactPreview,
			...input.planningAnswers,
			planningTargetLabel,
			selectedText ?? '',
			...activeSymbols.map(symbol => `${symbol.name} ${symbol.containerName ?? ''}`),
			workingSetPreview,
			previousFocusPreview,
			previousNearbyPreview,
			activeFileName,
			topLevelPreview,
			input.userRequest,
			input.plannerNotes ?? '',
			...input.recentConversation,
		];
	}

	if (input.questionStage !== 'goal-clarity') {
		switch (input.phase) {
			case 'detailed-inspection':
				return [
					planPreview,
					taskSummary,
					desiredOutcome,
					planAreasPreview,
					validationPreview,
					riskPreview,
					unknownsPreview,
					requestIntentLabel,
					artifactPreview,
					...input.planningAnswers,
					planningTargetLabel,
					selectedText ?? '',
					...activeSymbols.map(symbol => `${symbol.name} ${symbol.containerName ?? ''}`),
					workingSetPreview,
					previousFocusPreview,
					activeFileName,
					topLevelPreview,
					input.userRequest,
					input.plannerNotes ?? '',
					...input.recentConversation,
				];
			case 'focused-slice':
				return [
					planPreview,
					taskSummary,
					desiredOutcome,
					planAreasPreview,
					validationPreview,
					riskPreview,
					requestIntentLabel,
					artifactPreview,
					...input.planningAnswers,
					planningTargetLabel,
					selectedText ?? '',
					activeFileName,
					...activeSymbols.map(symbol => `${symbol.name} ${symbol.containerName ?? ''}`),
					workingSetPreview,
					previousFocusPreview,
					input.userRequest,
					input.plannerNotes ?? '',
					...input.recentConversation,
				];
			default:
				return [
					planPreview,
					taskSummary,
					desiredOutcome,
					planAreasPreview,
					validationPreview,
					riskPreview,
					unknownsPreview,
					requestIntentLabel,
					artifactPreview,
					...input.planningAnswers,
					planningTargetLabel,
					input.userRequest,
					selectedText ?? '',
					activeFileName,
					...activeSymbols.map(symbol => symbol.name),
					workingSetPreview,
					previousFocusPreview,
					previousNearbyPreview,
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
				taskSummary,
				desiredOutcome,
				planAreasPreview,
				validationPreview,
				riskPreview,
				requestIntentLabel,
				artifactPreview,
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
				taskSummary,
				desiredOutcome,
				planAreasPreview,
				validationPreview,
				riskPreview,
				requestIntentLabel,
				artifactPreview,
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
				taskSummary,
				desiredOutcome,
				validationPreview,
				riskPreview,
				unknownsPreview,
				requestIntentLabel,
				artifactPreview,
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

function extractExplicitArtifactMentions(inputs: readonly string[]): string[] {
	const mentions: string[] = [];
	const seen = new Set<string>();

	for (const input of inputs) {
		for (const query of extractFileLikeQueries(input)) {
			const normalized = query.replace(/\\/g, '/').trim();
			const lower = normalized.toLowerCase();
			if (!normalized || seen.has(lower)) {
				continue;
			}

			seen.add(lower);
			mentions.push(normalized);
		}
	}

	return mentions;
}

function inferRequestedArtifactExtension(userRequest: string, requestIntent: PlanningRequestIntent): string | undefined {
	const normalized = userRequest.toLowerCase();
	if (normalized.includes('.csv') || /\bcsv\b/.test(normalized)) {
		return '.csv';
	}
	if (normalized.includes('.tsv') || /\btsv\b/.test(normalized)) {
		return '.tsv';
	}
	if (normalized.includes('.json') || /\bjson\b/.test(normalized)) {
		return '.json';
	}
	if (normalized.includes('.yaml') || normalized.includes('.yml') || /\byaml\b/.test(normalized)) {
		return '.yaml';
	}
	if (normalized.includes('.sql') || /\bsql\b/.test(normalized)) {
		return '.sql';
	}
	if (normalized.includes('.py') || /\bpython\b/.test(normalized)) {
		return '.py';
	}
	if (normalized.includes('.ipynb') || /\bnotebook\b/.test(normalized)) {
		return '.ipynb';
	}
	if (normalized.includes('.sh') || /\bbash\b|\bshell script\b/.test(normalized)) {
		return '.sh';
	}
	if (normalized.includes('.ts') || /\btypescript\b/.test(normalized)) {
		return '.ts';
	}
	if (normalized.includes('.js') || /\bjavascript\b/.test(normalized)) {
		return '.js';
	}
	if (normalized.includes('.md') || /\bmarkdown\b/.test(normalized)) {
		return '.md';
	}

	return requestIntent === 'data-analysis'
		? '.csv'
		: requestIntent === 'script-work'
			? '.py'
			: undefined;
}

function buildGenericArtifactHint(
	requestIntent: PlanningRequestIntent,
	requestedExtension: string | undefined,
	activeResourceLabel: string | undefined,
	workspaceTopLevelEntries: readonly string[] | undefined,
): string | undefined {
	if (requestedExtension) {
		const artifactType = formatArtifactType(requestedExtension);
		if (activeResourceLabel) {
			return `Requested ${artifactType} near ${activeResourceLabel}`;
		}
		if (workspaceTopLevelEntries?.length) {
			return `Requested ${artifactType} in ${workspaceTopLevelEntries[0]}`;
		}
		return `Requested ${artifactType}`;
	}

	switch (requestIntent) {
		case 'data-analysis':
			return activeResourceLabel ? `Requested data file near ${activeResourceLabel}` : 'Requested data file';
		case 'script-work':
			return activeResourceLabel ? `Requested script near ${activeResourceLabel}` : 'Requested script';
		case 'test-work':
			return activeResourceLabel ? `Requested tests near ${activeResourceLabel}` : 'Requested tests';
		default:
			return activeResourceLabel;
	}
}

function formatArtifactType(extension: string): string {
	switch (extension) {
		case '.csv':
			return 'CSV file';
		case '.tsv':
			return 'TSV file';
		case '.json':
			return 'JSON file';
		case '.yaml':
		case '.yml':
			return 'YAML file';
		case '.sql':
			return 'SQL file';
		case '.py':
			return 'Python file';
		case '.ipynb':
			return 'Notebook';
		case '.sh':
			return 'Shell script';
		case '.ts':
			return 'TypeScript file';
		case '.js':
			return 'JavaScript file';
		case '.md':
			return 'Markdown file';
		default:
			return `${extension.replace(/^\./, '').toUpperCase()} file`;
	}
}

function resolveArtifactResource(label: string, workspaceFolders: readonly IWorkspaceFolderInfo[]): URI | undefined {
	if (/^[a-z][a-z0-9+.-]*:/i.test(label)) {
		try {
			return URI.parse(label);
		} catch {
			return undefined;
		}
	}

	return resolveWorkspaceLabel(label, workspaceFolders);
}

function formatRequestIntent(intent: PlanningRequestIntent): string {
	switch (intent) {
		case 'data-analysis':
			return 'data analysis';
		case 'script-work':
			return 'script work';
		case 'bug-fix':
			return 'bug fix';
		case 'refactor':
			return 'refactor';
		case 'feature-work':
			return 'feature work';
		case 'test-work':
			return 'test work';
		case 'investigation':
			return 'investigation';
		default:
			return 'general coding work';
	}
}

function buildFocusSummary(
	phase: PlanningPhase,
	questionStage: PlanningQuestionStage,
	planningAnswers: readonly string[],
	userRequest: string,
	plannerNotes: string | undefined,
	recentConversation: readonly string[],
	currentPlan: string | undefined,
	focusHint: string | undefined,
	activeResource: URI | undefined,
	selectedText: string | undefined,
	planningTarget: IPlanningTarget | undefined,
	requestIntent: PlanningRequestIntent,
	taskLens: IPlanningTaskLens | undefined,
	primaryArtifactHint: string | undefined,
	relatedArtifactHints: readonly string[],
): string {
	const stageLabel = questionStage === 'goal-clarity'
		? 'Goal clarity'
		: questionStage === 'task-decomposition'
			? 'Task decomposition'
			: 'Plan focus';
	const selected = planningAnswers.slice(0, questionStage === 'goal-clarity' ? 3 : 4).join(', ');
	const planAnchor = summarizeCurrentPlan(currentPlan, 1);
	const taskSummary = taskLens?.taskSummary ?? '';
	const desiredOutcome = taskLens?.desiredOutcome ?? '';
	const anchors = [focusHint?.trim() || '', taskSummary, desiredOutcome, selected, planAnchor, plannerNotes?.trim() || '', userRequest.trim(), recentConversation[0] || ''].filter(value => value.length > 0);
	const selectionAnchor = getSelectionAnchor(selectedText);
	const fileAnchor = taskLens?.primaryArtifact || primaryArtifactHint || planningTarget?.label || (activeResource ? basename(activeResource) : 'the current workspace');
	const relatedArtifacts = (taskLens?.secondaryArtifacts ?? relatedArtifactHints).slice(0, 2).join(', ');
	const riskPreview = taskLens?.riskAreas?.length ? ` Guardrails: ${taskLens.riskAreas.slice(0, 2).join('; ')}.` : '';
	const intentPrefix = `${stageLabel} for ${formatRequestIntent(requestIntent)}`;

	if (questionStage === 'plan-focus') {
		return anchors.length > 0
			? `${intentPrefix} around ${anchors[0]}. Tighten the revised plan in ${fileAnchor}${selectionAnchor ? ` near ${selectionAnchor}` : ''}${relatedArtifacts ? ` with ${relatedArtifacts} in view` : ''}.${riskPreview}`
			: `${intentPrefix} in ${fileAnchor}.`;
	}

	if (phase === 'focused-slice') {
		return anchors.length > 0
			? `${intentPrefix} for the focused slice around ${anchors[0]}. Anchored in ${fileAnchor}${selectionAnchor ? ` near ${selectionAnchor}` : ''}${relatedArtifacts ? ` with ${relatedArtifacts} nearby` : ''}.${riskPreview}`
			: `${intentPrefix} for the focused slice in ${fileAnchor}.`;
	}

	if (phase === 'detailed-inspection') {
		return anchors.length > 0
			? `${intentPrefix} for detailed inspection around ${anchors[0]}. Deepened in ${fileAnchor}${selectionAnchor ? ` near ${selectionAnchor}` : ''}${relatedArtifacts ? ` with ${relatedArtifacts} nearby` : ''}.${riskPreview}`
			: `${intentPrefix} for detailed inspection in ${fileAnchor}.`;
	}

	return anchors.length > 0
		? `${intentPrefix} for the broad scan around ${anchors[0]}. Starting in ${fileAnchor}${selectionAnchor ? ` near ${selectionAnchor}` : ''}${relatedArtifacts ? ` with ${relatedArtifacts} nearby` : ''}.${riskPreview}`
		: `${intentPrefix} for the broad scan in ${fileAnchor}.`;
}

function findMatchingPlanningAnswer(answers: readonly string[], pattern: RegExp): string | undefined {
	for (const answer of answers) {
		if (pattern.test(answer)) {
			return summarizeSentence(answer, 180);
		}
	}

	return undefined;
}

function extractRelevantFragments(inputs: readonly string[], pattern: RegExp, limit: number): string[] {
	const fragments: string[] = [];
	const seen = new Set<string>();

	for (const input of inputs) {
		for (const fragment of splitIntoFragments(input)) {
			if (!pattern.test(fragment)) {
				continue;
			}

			const normalized = summarizeSentence(fragment, 120);
			const key = normalized.toLowerCase();
			if (!normalized || seen.has(key)) {
				continue;
			}

			seen.add(key);
			fragments.push(normalized);
			if (fragments.length >= limit) {
				return fragments;
			}
		}
	}

	return fragments;
}

function splitIntoFragments(input: string): string[] {
	return input
		.split(/\r?\n|[.!?](?:\s+|$)/g)
		.map(fragment => normalizeWhitespace(fragment))
		.filter(fragment => fragment.length >= 4);
}

function normalizePlanArea(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	const normalized = normalizeWhitespace(value.replace(/^(?:[-*]|\d+\.)\s*/, '').replace(/^work in\s+/i, ''));
	if (!normalized) {
		return undefined;
	}

	const firstClause = normalized.split(/;|,| and | then /i)[0]?.trim() ?? normalized;
	return summarizeSentence(firstClause, 90);
}

function summarizeSentence(value: string, maxLength: number): string {
	const normalized = normalizeWhitespace(value);
	if (normalized.length <= maxLength) {
		return normalized;
	}

	const trimmed = normalized.slice(0, maxLength);
	const lastSpace = trimmed.lastIndexOf(' ');
	return (lastSpace >= Math.floor(maxLength * 0.6) ? trimmed.slice(0, lastSpace) : trimmed).trim();
}

function looksLikeFilePath(value: string): boolean {
	return /(?:[A-Za-z0-9_.-]+[\\/])+[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9]+)?$/.test(value) || /\.[A-Za-z0-9]+$/.test(value);
}

function capitalizeFirstLetter(value: string): string {
	return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
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
	const fileLikeQueries = extractFileLikeQueries(input);
	const candidates = [
		...fileLikeQueries,
		...expandFileLikeQueries(fileLikeQueries),
		...extractPhraseQueries(input),
		...tokenize(input),
	];

	return candidates;
}

function extractFileLikeQueries(input: string): string[] {
	return input.match(/(?:[A-Za-z0-9_.-]+[\\/])*[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g) ?? [];
}

function expandFileLikeQueries(queries: readonly string[]): string[] {
	const expanded: string[] = [];

	for (const query of queries) {
		const normalized = query.replace(/\\/g, '/');
		const segments = normalized.split('/').filter(Boolean);
		if (segments.length === 0) {
			continue;
		}

		const fileName = segments[segments.length - 1];
		const stem = fileName.replace(/\.[^.]+$/, '');
		if (fileName.length >= 3) {
			expanded.push(fileName);
		}
		if (stem.length >= 3) {
			expanded.push(stem);
		}

		const directorySegments = segments.slice(0, -1);
		if (directorySegments.length > 0) {
			const immediateDirectory = directorySegments[directorySegments.length - 1];
			if (immediateDirectory.length >= 3) {
				expanded.push(immediateDirectory);
			}

			const narrowedDirectory = directorySegments.slice(-2).join('/');
			if (narrowedDirectory.length >= 3) {
				expanded.push(narrowedDirectory);
			}
		}
	}

	return expanded;
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

function getQueryLimitForScope(scope: PlanningRepositoryScope, questionStage: PlanningQuestionStage, hasPreviousRepositoryContext: boolean): number {
	if (questionStage === 'plan-focus') {
		return hasPreviousRepositoryContext ? 2 : (scope === 'detailed' ? 3 : 4);
	}

	switch (scope) {
		case 'focused':
			return questionStage === 'task-decomposition'
				? hasPreviousRepositoryContext ? 3 : 4
				: 5;
		case 'detailed':
			return questionStage === 'task-decomposition'
				? hasPreviousRepositoryContext ? 2 : 3
				: 4;
		default:
			return hasPreviousRepositoryContext && questionStage !== 'goal-clarity' ? 5 : 7;
	}
}

function resolvePreviousPlanningResource(previousRepositoryContext: IPlanningRepositoryContext | undefined, workspaceFolders: readonly IWorkspaceFolderInfo[]): URI | undefined {
	const targetResource = previousRepositoryContext?.planningTarget?.resource;
	if (targetResource && (previousRepositoryContext?.planningTarget?.kind === 'file' || previousRepositoryContext?.planningTarget?.kind === 'selection')) {
		try {
			return URI.parse(targetResource);
		} catch {
			// ignore parse failures and fall back below
		}
	}

	for (const candidate of previousRepositoryContext?.workingSetFiles ?? []) {
		const resource = resolveWorkspaceLabel(candidate, workspaceFolders);
		if (resource) {
			return resource;
		}
	}

	for (const candidate of previousRepositoryContext?.nearbyFiles ?? []) {
		const resource = resolveWorkspaceLabel(candidate, workspaceFolders);
		if (resource) {
			return resource;
		}
	}

	return undefined;
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

function summarizeCurrentPlan(currentPlan: string | undefined, maxLines = 3): string {
	if (!currentPlan?.trim()) {
		return '';
	}

	const lines = currentPlan
		.split(/\r?\n/g)
		.map(line => line.trim().replace(/^(?:[-*]|\d+\.)\s*/, ''))
		.filter(line => line.length > 0)
		.slice(0, maxLines)
		.map(line => truncate(line, 96));

	return lines.join(' ');
}

function mergeStringArrays(base: readonly string[], incoming: readonly string[]): string[] {
	return [...base, ...incoming].filter((value, index, values) => values.indexOf(value) === index);
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
