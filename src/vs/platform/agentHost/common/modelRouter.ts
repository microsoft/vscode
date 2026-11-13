/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { parse, type YamlNode, type YamlParseError, type YamlScalarNode } from '../../../base/common/yaml.js';
import type { IAgentModelInfo } from './agent.js';
import { readAgentModelByokIdentifier } from './agentModelByokMeta.js';
import { ContextSizeConfigKey } from './agentModelConfiguration.js';
import { readAgentModelNoticesMeta } from './agentModelNotices.js';
import { isCopilotHydraFusionModelId } from './copilotCliConfig.js';
import { ReasoningEffortConfigKey, reasoningEffortLevels } from './reasoningEffort.js';
import { PolicyState } from './state/protocol/channels-root/state.js';

/*
 * A model router picks the model for each turn of a chat from models the user chose, by asking a
 * decision model which route fits the request. A router is a `<name>.model-router.yaml` file:
 *
 * ```yaml
 * version: 1
 * display-name: Daily Driver
 * description: Haiku by default, Opus for planning.
 * guidance: Prefer the cheapest model that can do the job.
 * routes:
 *   - model: claude-haiku-5.5
 *     when: Lookups, explanations and small edits.
 *     examples:
 *       - where is the code for hydrafusion?
 *   - model: [claude-opus-5.5, claude-opus-5]
 *     when: Planning, design and multi-file implementation.
 *     effort: high
 *     context-size: long
 * ```
 *
 * A route can have a `name`, and `guidance` for the chat's main agent: how the user wants that
 * kind of work done, which can name skills and custom agents to use. Routes with a name are told
 * apart by it, so two of them may use the same model. Routing never reads a route's `guidance`;
 * `modelRouterGuidance.ts` does. The router's own `guidance` is for the routing decision.
 *
 * ```yaml
 * routes:
 *   - name: feature
 *     model: claude-opus-5.5
 *     when: Building something new or changing behavior across files.
 *     guidance: Plan first. Have the reviewer agent check the change before you finish.
 *   - name: quick
 *     model: claude-opus-5.5
 *     when: Questions, lookups and small edits.
 *     effort: low
 * ```
 *
 * Only a documented subset of YAML is accepted (block maps and lists, flow lists of values,
 * plain and quoted values, `|` and `>` text, comments), and it is checked strictly, because the
 * shared YAML parser is lenient about malformed input.
 */

/** The decision model that routes turns. */
export const MODEL_ROUTER_DECISION_MODEL = 'gpt-6-luna-decisions';
/** The runtime flag that turns on `decisions.ask`. */
export const DecisionsApiFeatureFlag = 'DECISIONS_API';

/** Model ids the client selects to route a chat with a router: `model-router:<name>`. */
export const MODEL_ROUTER_MODEL_ID_PREFIX = 'model-router:';
export const MODEL_ROUTER_FILE_SUFFIXES: readonly string[] = ['.model-router.yaml', '.model-router.yml'];
/** Folder, under `~/.agents` or `~/.copilot`, that holds router files. */
export const MODEL_ROUTER_FOLDER = 'model-routers';
/** The only file-format version this build reads. */
export const MODEL_ROUTER_VERSION = 1;

/** One route is enough when it has `guidance`: a single way of working is still worth writing down. */
export const MODEL_ROUTER_MIN_ROUTES = 2;
/** The most options a decision model is asked to choose between: rounded probabilities stay trustworthy up to here. */
export const MODEL_ROUTER_MAX_ROUTES = 10;
export const MODEL_ROUTER_MAX_FILE_BYTES = 32 * 1024;
/** The most router text (guidance, `when` and examples) sent with a decision, as UTF-8 bytes after JSON escaping. */
export const MODEL_ROUTER_MAX_DECISION_TEXT_BYTES = 64 * 1024;
const MAX_DESCRIPTION_CHARS = 1024;
const MAX_DISPLAY_NAME_CHARS = 64;
const MAX_EXAMPLES = 10;
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type ModelRouterEffortLevel = typeof reasoningEffortLevels[number];
/** `auto` lets the router pick reasoning effort, `off` leaves it alone, and a level always uses that level. */
export type ModelRouterEffort = 'auto' | 'off' | ModelRouterEffortLevel;
/** `first-turn` (the default) routes once and keeps that model; `auto` re-routes every turn but keeps the current model in long chats. */
export type ModelRouterSwitching = 'auto' | 'first-turn';
/** `long` is a model's larger context window, where it offers one; `default` is its standard one. */
export type ModelRouterContextSize = 'default' | 'long';

export interface IModelRouterRoute {
	/** Model ids in preference order; the first one the user has is used. */
	readonly models: readonly string[];
	readonly when: string;
	readonly examples: readonly string[];
	/** A fixed effort for this route, overriding the router's unless that is `off`. */
	readonly effort?: ModelRouterEffortLevel;
	/** The context window for this route, overriding the router's. */
	readonly contextSize?: ModelRouterContextSize;
	/** A route with a name is identified by it, one without by its model. */
	readonly name?: string;
	/** How the user wants the work done, given to the main agent of a chat on this route. */
	readonly mainAgentGuidance?: string;
}

export interface IModelRouter {
	readonly name: string;
	/** The name the model picker and the chat show, when the file gives one. */
	readonly displayName?: string;
	readonly description: string;
	readonly effort: ModelRouterEffort;
	/** The context window for routes that set none; without it each model keeps its own default. */
	readonly contextSize?: ModelRouterContextSize;
	readonly switching: ModelRouterSwitching;
	/** Sent with every routing decision; empty when the file has none. */
	readonly guidance: string;
	readonly routes: readonly IModelRouterRoute[];
}

export const enum ModelRouterDiagnosticSeverity {
	/** The router can't be used. */
	Error = 'error',
	/** The router works, but not entirely as written. */
	Warning = 'warning',
}

export interface IModelRouterDiagnostic {
	readonly severity: ModelRouterDiagnosticSeverity;
	readonly message: string;
	/** Offsets into the file, when the problem has a location. */
	readonly startOffset?: number;
	readonly endOffset?: number;
}

export interface IModelRouterParseResult {
	/** Undefined when any diagnostic is an error. */
	readonly router: IModelRouter | undefined;
	readonly diagnostics: readonly IModelRouterDiagnostic[];
	/** The router's name, when it could be read, even if the file has other errors. */
	readonly name?: string;
}

interface IRange {
	readonly startOffset: number;
	readonly endOffset: number;
}

const topLevelKeys = new Set(['version', 'name', 'display-name', 'description', 'effort', 'context-size', 'switching', 'guidance', 'routes']);
/** Keys the format reserves for later versions; a router using them still loads. */
const reservedTopLevelKeys = new Set(['subagents', 'phases', 'mid-turn']);
const routeKeys = new Set(['name', 'model', 'when', 'examples', 'effort', 'context-size', 'guidance']);
/** Keys of the preview format, which wrote named routes as `playbooks` with `roles`. */
const removedTopLevelKeys = new Map([
	['playbooks', 'Write `playbooks` as `routes`: a list where each route has `model` and `when`, and can have a `name` and `guidance`.'],
	['roles', '`roles` are no longer read. To have a custom agent used, name it in a route\'s `guidance`.'],
]);
/** The most guidance a route gives its main agent: it is part of every request of the chat. */
const MAX_ROUTE_GUIDANCE_CHARS = 4000;
const effortLevels: ReadonlySet<string> = new Set(reasoningEffortLevels);

/** The router name a file name implies: `daily-driver.model-router.yaml` → `daily-driver`. */
export function modelRouterNameFromFileName(fileName: string): string | undefined {
	const lower = fileName.toLowerCase();
	const suffix = MODEL_ROUTER_FILE_SUFFIXES.find(candidate => lower.endsWith(candidate));
	return suffix ? fileName.slice(0, -suffix.length) : undefined;
}

export function modelRouterModelId(name: string): string {
	return `${MODEL_ROUTER_MODEL_ID_PREFIX}${name}`;
}

export function isModelRouterModelId(modelId: string | undefined): boolean {
	return !!modelId?.startsWith(MODEL_ROUTER_MODEL_ID_PREFIX);
}

const MODEL_ROUTER_DESCRIPTION_META_KEY = 'modelRouterDescription';
const MODEL_ROUTER_URI_META_KEY = 'modelRouterUri';

/** The `_meta` of a router's model row: its description and file, for the model picker. */
export function createModelRouterModelMeta(description: string, uri: { toString(): string }): Record<string, unknown> {
	return { [MODEL_ROUTER_DESCRIPTION_META_KEY]: description, [MODEL_ROUTER_URI_META_KEY]: uri.toString() };
}

/** A router row's file on the agent host, or `undefined` for other models. */
export function readModelRouterUri(model: { readonly _meta?: Record<string, unknown> }): string | undefined {
	const meta = model._meta;
	const value = meta ? meta[MODEL_ROUTER_URI_META_KEY] : undefined;
	return typeof value === 'string' ? value : undefined;
}

/** A router row's description, or `undefined` for other models. */
export function readModelRouterDescription(model: { readonly _meta?: Record<string, unknown> }): string | undefined {
	const meta = model._meta;
	const value = meta ? meta[MODEL_ROUTER_DESCRIPTION_META_KEY] : undefined;
	return typeof value === 'string' ? value : undefined;
}

/** The router name a picker model id selects, if it selects one. */
export function modelRouterNameFromModelId(modelId: string | undefined): string | undefined {
	return isModelRouterModelId(modelId) ? modelId!.slice(MODEL_ROUTER_MODEL_ID_PREFIX.length) : undefined;
}

/** A valid `name` written once in the file, read even when other parts of it have errors. */
function readExplicitName(root: YamlNode | undefined): string | undefined {
	const names = root?.type === 'map' ? root.properties.filter(property => property.key.value === 'name') : [];
	const name = names.length === 1 ? scalar(names[0].value) : undefined;
	return name && NAME_PATTERN.test(name) ? name : undefined;
}

/** A valid top-level `name:` line written once, for a file the YAML parser couldn't read. */
function readExplicitNameLine(content: string): string | undefined {
	const names = content.split(/\r?\n/).flatMap(line => {
		const match = /^name:[ \t]*(['"]?)([^'"#\s]*)\1[ \t]*(?:#.*)?$/.exec(line);
		return match ? [match[2]] : [];
	});
	return names.length === 1 && NAME_PATTERN.test(names[0]) ? names[0] : undefined;
}

/** Parses and checks a router file. `fileName` supplies the name when the file doesn't. */
export function parseModelRouter(content: string, fileName: string): IModelRouterParseResult {
	const diagnostics: IModelRouterDiagnostic[] = [];
	const report = { error: diagnosticReporter(diagnostics, ModelRouterDiagnosticSeverity.Error), warning: diagnosticReporter(diagnostics, ModelRouterDiagnosticSeverity.Warning) };
	let validName: string | undefined;
	const fail = (): IModelRouterParseResult => ({ router: undefined, diagnostics, ...(validName ? { name: validName } : {}) });
	// Editors can save UTF-8 with a byte order mark, which YAML would read as part of the first key.
	if (content.charCodeAt(0) === 0xFEFF) {
		content = content.slice(1);
	}

	if (VSBuffer.fromString(content).byteLength > MODEL_ROUTER_MAX_FILE_BYTES) {
		report.error(`A model router file is at most ${MODEL_ROUTER_MAX_FILE_BYTES / 1024} KiB.`);
		return fail();
	}

	const yamlErrors: YamlParseError[] = [];
	let root: YamlNode | undefined;
	try {
		root = parse(content, yamlErrors);
	} catch (e) {
		report.error(`YAML: ${e instanceof Error ? e.message : String(e)}`);
		validName = readExplicitNameLine(content);
		return fail();
	}
	validName = readExplicitName(root);
	for (const yamlError of yamlErrors) {
		report.error(`YAML: ${yamlError.message}`, yamlError);
	}
	if (!root || root.type !== 'map' || root.style !== 'block') {
		report.error('A model router is a YAML map with `version`, `description` and `routes`.', root);
		return fail();
	}
	checkYamlSubset(content, root, report);
	checkNoTrailingContent(content, root, report);
	if (hasError(diagnostics)) {
		return fail();
	}

	const values = new Map(root.properties.map(property => [property.key.value, property]));
	for (const property of root.properties) {
		const removed = removedTopLevelKeys.get(property.key.value);
		if (removed) {
			// `playbooks` held the routes, so a file that still has them can't be used; `roles` only added to them.
			(property.key.value === 'playbooks' ? report.error : report.warning)(removed, property.key);
		} else if (reservedTopLevelKeys.has(property.key.value)) {
			report.warning(`\`${property.key.value}\` is reserved for a later version and is ignored.`, property.key);
		} else if (!topLevelKeys.has(property.key.value)) {
			report.warning(`Unknown key \`${property.key.value}\` is ignored.`, property.key);
		}
	}

	const version = values.get('version');
	if (!version) {
		report.error(`Add \`version: ${MODEL_ROUTER_VERSION}\`.`);
	} else if (scalar(version.value) !== String(MODEL_ROUTER_VERSION)) {
		report.error(`Unsupported version \`${scalar(version.value) ?? '?'}\`. This version of VS Code reads version ${MODEL_ROUTER_VERSION}.`, version.value);
	}

	const fileNameRouter = modelRouterNameFromFileName(fileName);
	const nameProperty = values.get('name');
	const name = nameProperty ? scalar(nameProperty.value) : fileNameRouter;
	if (!name || !NAME_PATTERN.test(name)) {
		report.error('The name must be lowercase letters, digits and single hyphens, like `daily-driver`.', nameProperty?.value);
	} else {
		validName = name;
	}

	const descriptionProperty = values.get('description');
	const description = descriptionProperty ? scalar(descriptionProperty.value)?.trim() : undefined;
	if (!description) {
		report.error('Add a `description`; it is shown in the model picker.', descriptionProperty?.value);
	} else if (description.length > MAX_DESCRIPTION_CHARS) {
		report.error(`The description is longer than ${MAX_DESCRIPTION_CHARS} characters.`, descriptionProperty?.value);
	}

	const displayNameProperty = values.get('display-name');
	// The picker shows it on one line.
	const displayName = displayNameProperty ? scalar(displayNameProperty.value)?.trim().replace(/\s+/g, ' ') : undefined;
	if (displayNameProperty && !displayName) {
		report.error('`display-name` is the name the model picker shows.', displayNameProperty.value);
	} else if (displayName && displayName.length > MAX_DISPLAY_NAME_CHARS) {
		report.error(`The display name is longer than ${MAX_DISPLAY_NAME_CHARS} characters.`, displayNameProperty?.value);
	}

	const effort = parseEffort(values.get('effort')?.value, ['auto', 'off'], 'auto', '`effort`', report) as ModelRouterEffort;
	const contextSize = parseContextSize(values.get('context-size')?.value, '`context-size`', report);

	const switchingProperty = values.get('switching');
	let switching: ModelRouterSwitching = 'first-turn';
	if (switchingProperty) {
		const value = scalar(switchingProperty.value);
		if (value === 'auto' || value === 'first-turn') {
			switching = value;
		} else if (value === 'mid-turn') {
			report.warning('`switching: mid-turn` is reserved for a later version; this router routes on the first turn only.', switchingProperty.value);
		} else {
			report.error('`switching` is `auto` or `first-turn`.', switchingProperty.value);
		}
	}

	const guidanceProperty = values.get('guidance');
	const guidance = guidanceProperty ? scalar(guidanceProperty.value)?.trim() : '';
	if (guidance === undefined) {
		report.error('`guidance` is text.', guidanceProperty?.value);
	}

	const routes: IModelRouterRoute[] = [];
	const routesProperty = values.get('routes');
	if (!routesProperty || routesProperty.value.type !== 'sequence') {
		// A file still written as `playbooks` was told how to rewrite it above.
		if (!values.has('playbooks')) {
			report.error('Add `routes`: a list of models, each with `model` and `when`.', routesProperty?.value);
		}
	} else {
		const items = routesProperty.value.items;
		const seenModels = new Map<string, number>();
		const seenNames = new Map<string, number>();
		items.forEach((item, index) => {
			const route = parseRoute(item, index, report);
			if (!route) {
				return;
			}
			const label = modelRouterRouteLabel(route, index);
			if (effort === 'off' && route.effort) {
				report.warning(`${label}'s \`effort\` is ignored because the router's \`effort\` is \`off\`.`, item);
			}
			if (route.name) {
				const previous = seenNames.get(route.name);
				if (previous !== undefined) {
					report.error(`The name \`${route.name}\` is already route ${previous + 1}'s; each name belongs to one route.`, item);
				}
				seenNames.set(route.name, index);
			} else {
				// A route without a name is identified by its model, so each model belongs to one such route.
				for (const model of route.models) {
					const key = normalizeModelReference(model);
					const previous = seenModels.get(key);
					if (previous !== undefined) {
						report.error(`\`${model}\` is already in route ${previous + 1}; each model belongs to one route, unless the routes have a \`name\`.`, item);
					}
					seenModels.set(key, index);
				}
			}
			routes.push(route);
		});
		const guided = routes.some(route => route.mainAgentGuidance);
		if (items.length > MODEL_ROUTER_MAX_ROUTES || items.length < (guided ? 1 : MODEL_ROUTER_MIN_ROUTES)) {
			report.error(`A router has ${MODEL_ROUTER_MIN_ROUTES} to ${MODEL_ROUTER_MAX_ROUTES} routes; this one has ${items.length}.`, routesProperty.value);
		}
		if (guided && switching === 'auto') {
			report.error('A route\'s `guidance` is given to a chat when it starts and kept for that chat, so `switching: auto` can\'t be used with it.', switchingProperty?.value);
		}
	}

	if (modelRouterDecisionTextBytes(guidance ?? '', routes) > MODEL_ROUTER_MAX_DECISION_TEXT_BYTES) {
		report.error(`The guidance, \`when\` and examples together are too long: at most ${MODEL_ROUTER_MAX_DECISION_TEXT_BYTES / 1024} KiB is sent with each decision.`);
	}

	if (hasError(diagnostics) || !name || !description || guidance === undefined) {
		return fail();
	}
	return {
		router: {
			name, description, effort, switching, guidance, routes,
			...(displayName ? { displayName } : {}),
			...(contextSize ? { contextSize } : {}),
		},
		diagnostics,
		name,
	};
}

/** The size of the router text sent with each decision, measured as the runtime measures requests. */
export function modelRouterDecisionTextBytes(guidance: string, routes: readonly Pick<IModelRouterRoute, 'when' | 'examples'>[]): number {
	return VSBuffer.fromString(JSON.stringify([guidance, routes.map(route => [route.when, route.examples])])).byteLength;
}

interface IReporter {
	error(message: string, range?: IRange): void;
	warning(message: string, range?: IRange): void;
}

function diagnosticReporter(diagnostics: IModelRouterDiagnostic[], severity: ModelRouterDiagnosticSeverity) {
	return (message: string, range?: IRange) => diagnostics.push({ severity, message, ...(range ? { startOffset: range.startOffset, endOffset: range.endOffset } : {}) });
}

function hasError(diagnostics: readonly IModelRouterDiagnostic[]): boolean {
	return diagnostics.some(diagnostic => diagnostic.severity === ModelRouterDiagnosticSeverity.Error);
}

/** How messages name a route: by its name, else by its place in the list. */
export function modelRouterRouteLabel(route: Pick<IModelRouterRoute, 'name'>, index: number): string {
	return route.name ? `Route \`${route.name}\`` : `Route ${index + 1}`;
}

function parseRoute(item: YamlNode, index: number, report: IReporter): IModelRouterRoute | undefined {
	const position = `Route ${index + 1}`;
	if (item.type !== 'map') {
		report.error(`${position} needs \`model\` and \`when\`.`, item);
		return undefined;
	}
	const values = new Map(item.properties.map(property => [property.key.value, property]));
	for (const property of item.properties) {
		if (!routeKeys.has(property.key.value)) {
			report.warning(`Unknown key \`${property.key.value}\` in ${position.toLowerCase()} is ignored.`, property.key);
		}
	}

	const nameProperty = values.get('name');
	const name = nameProperty ? scalar(nameProperty.value) : undefined;
	if (nameProperty && (!name || !NAME_PATTERN.test(name))) {
		report.error(`${position}'s \`name\` is lowercase letters, digits and single hyphens, like \`bug-fix\`.`, nameProperty.value);
		return undefined;
	}
	const label = modelRouterRouteLabel({ name }, index);

	const modelProperty = values.get('model');
	const models = modelProperty ? scalarList(modelProperty.value) : undefined;
	if (!models?.length || models.some(model => !isModelReference(model))) {
		report.error(`${label} needs \`model\`: a model id like \`claude-haiku-5.5\` or \`anthropic/claude-haiku-4-5\`, or a list of them in preference order.`, modelProperty?.value ?? item);
		return undefined;
	}

	const whenProperty = values.get('when');
	const when = whenProperty ? scalar(whenProperty.value)?.trim() : undefined;
	if (!when) {
		report.error(`${label} needs \`when\`: when to use this model.`, whenProperty?.value ?? item);
		return undefined;
	}

	const examplesProperty = values.get('examples');
	let examples: string[] = [];
	if (examplesProperty) {
		const list = scalarList(examplesProperty.value);
		if (!list) {
			report.error(`${label}'s \`examples\` is a list of requests.`, examplesProperty.value);
			return undefined;
		}
		if (list.length > MAX_EXAMPLES) {
			report.warning(`${label} has more than ${MAX_EXAMPLES} examples; only the first ${MAX_EXAMPLES} are used.`, examplesProperty.value);
		}
		examples = list.slice(0, MAX_EXAMPLES).filter(Boolean);
	}

	const effort = parseEffort(values.get('effort')?.value, [], undefined, `${label}'s \`effort\``, report) as ModelRouterEffortLevel | undefined;
	const contextSize = parseContextSize(values.get('context-size')?.value, `${label}'s \`context-size\``, report);

	const guidanceProperty = values.get('guidance');
	const mainAgentGuidance = guidanceProperty ? scalar(guidanceProperty.value)?.trim() : '';
	if (mainAgentGuidance === undefined) {
		report.error(`${label}'s \`guidance\` is text.`, guidanceProperty?.value);
		return undefined;
	}
	if (mainAgentGuidance.length > MAX_ROUTE_GUIDANCE_CHARS) {
		report.error(`${label}'s \`guidance\` is too long: at most ${MAX_ROUTE_GUIDANCE_CHARS} characters.`, guidanceProperty?.value);
	}
	return { models, when, examples, ...(effort ? { effort } : {}), ...(contextSize ? { contextSize } : {}), ...(name ? { name } : {}), ...(mainAgentGuidance ? { mainAgentGuidance } : {}) };
}

function parseEffort(node: YamlNode | undefined, keywords: readonly string[], fallback: string | undefined, label: string, report: IReporter): string | undefined {
	if (!node) {
		return fallback;
	}
	const value = scalar(node);
	if (value !== undefined && (keywords.includes(value) || effortLevels.has(value))) {
		return value;
	}
	report.error(`${label} is ${[...keywords, ...effortLevels].map(level => `\`${level}\``).join(', ')}.`, node);
	return fallback;
}

function parseContextSize(node: YamlNode | undefined, label: string, report: IReporter): ModelRouterContextSize | undefined {
	if (!node) {
		return undefined;
	}
	const value = scalar(node);
	if (value === 'default' || value === 'long') {
		return value;
	}
	report.error(`${label} is \`default\` or \`long\`.`, node);
	return undefined;
}

function scalar(node: YamlNode): string | undefined {
	return node.type === 'scalar' ? node.value : undefined;
}

function scalarList(node: YamlNode): string[] | undefined {
	if (node.type === 'scalar') {
		return node.value.trim() ? [node.value.trim()] : [];
	}
	if (node.type !== 'sequence') {
		return undefined;
	}
	const values = node.items.map(scalar);
	return values.every((value): value is string => value !== undefined) ? values.map(value => value.trim()) : undefined;
}

// ---- The YAML subset ---------------------------------------------------------

/**
 * Rejects what the shared parser accepts silently: flow maps, flow lists without commas,
 * unterminated quotes and malformed escapes.
 */
function checkYamlSubset(content: string, node: YamlNode, report: IReporter): void {
	switch (node.type) {
		case 'scalar':
			checkQuotedScalar(content, node, report);
			return;
		case 'map':
			if (node.style === 'flow') {
				report.error('`{ … }` maps are not supported; put each key on its own line.', node);
				return;
			}
			for (const property of node.properties) {
				checkQuotedScalar(content, property.key, report);
				checkYamlSubset(content, property.value, report);
			}
			return;
		case 'sequence':
			if (node.style === 'flow') {
				if (content[node.endOffset - 1] !== ']') {
					report.error('This `[` list is not closed with `]`.', node);
				}
				node.items.forEach((item, index) => {
					if (item.type !== 'scalar') {
						report.error('A `[ … ]` list holds plain values only.', item);
					} else if (index > 0 && !content.slice(node.items[index - 1].endOffset, item.startOffset).includes(',')) {
						report.error('Separate the values in a `[ … ]` list with commas.', item);
					}
				});
			}
			for (const item of node.items) {
				checkYamlSubset(content, item, report);
			}
			return;
	}
}

/** The escapes the shared parser decodes; it keeps any other backslash as written. */
const simpleEscapes = new Set(['0', 'a', 'b', 't', 'n', 'v', 'f', 'r', 'e', ' ', '"', '/', '\\', '_']);
const hexEscapeLengths: Record<string, number> = { x: 2, u: 4, U: 8 };

function checkQuotedScalar(content: string, node: YamlScalarNode, report: IReporter): void {
	// The shared parser reads `&anchor` and `*alias` as plain text, which would send the alias, not what it names.
	if (node.format === 'none' && (content[node.startOffset] === '&' || content[node.startOffset] === '*')) {
		report.error('Anchors (`&`) and aliases (`*`) are not supported; quote text that starts with `&` or `*`.', node);
		return;
	}
	if (node.format !== 'single' && node.format !== 'double') {
		return;
	}
	const quote = node.format === 'single' ? '\'' : '"';
	const end = node.endOffset;
	let index = node.startOffset + 1;
	while (index < end) {
		const ch = content[index];
		if (quote === '\'' && ch === '\'') {
			if (content[index + 1] === '\'' && index + 1 < end) {
				index += 2;
				continue;
			}
			break;
		}
		if (quote === '"' && ch === '"') {
			break;
		}
		if (quote === '"' && ch === '\\') {
			const next = content[index + 1];
			if (next === '\n' || next === '\r') {
				index += 2;
				continue;
			}
			const hexLength = next !== undefined ? hexEscapeLengths[next] : undefined;
			if (hexLength !== undefined) {
				const hex = content.slice(index + 2, index + 2 + hexLength);
				const codePoint = /^[0-9a-fA-F]+$/.test(hex) && hex.length === hexLength ? parseInt(hex, 16) : undefined;
				if (codePoint === undefined || codePoint > 0x10FFFF || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
					report.error(`\`\\${next}\` needs ${hexLength} hex digits naming a valid character.`, { startOffset: index, endOffset: Math.min(index + 2 + hexLength, end) });
					return;
				}
				index += 2 + hexLength;
				continue;
			}
			if (next === undefined || !simpleEscapes.has(next)) {
				report.error(`\`\\${next ?? ''}\` is not a YAML escape; write \`\\\\\` for a backslash.`, { startOffset: index, endOffset: Math.min(index + 2, end) });
				return;
			}
			index += 2;
			continue;
		}
		index++;
	}
	if (index !== end - 1) {
		report.error(index >= end ? 'This quoted value is missing its closing quote.' : 'Unexpected text after the closing quote.', node);
	}
}

/** The shared parser stops at the first thing it doesn't understand; anything left over is an error. */
function checkNoTrailingContent(content: string, root: YamlNode, report: IReporter): void {
	const rest = content.slice(root.endOffset);
	let offset = root.endOffset;
	for (const line of rest.split('\n')) {
		if (!/^\s*(#.*)?$/.test(line)) {
			const start = offset + line.length - line.trimStart().length;
			report.error('This line is not part of the router; check its indentation.', { startOffset: start, endOffset: offset + line.length });
			return;
		}
		offset += line.length + 1;
	}
}

// ---- Model references ------------------------------------------------------

const COPILOT_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const VENDOR = /^[a-z0-9][a-z0-9._-]*$/;
const COPILOT_VENDOR = 'copilot';

/** A Copilot model id, or `<vendor>/<id>` / `<vendor>/<group>/<id>` for a model on the user's own key. */
function isModelReference(reference: string): boolean {
	const { vendor, id } = splitModelReference(reference);
	return vendor === COPILOT_VENDOR ? COPILOT_MODEL_ID.test(id) : VENDOR.test(vendor) && id.length > 0 && id.trim() === id;
}

/** Versions are written with dots or dashes depending on the provider, so `claude-opus-4.8` matches `claude-opus-4-8`. */
function normalizeModelId(id: string): string {
	return id.toLowerCase().replace(/\./g, '-');
}

function normalizeModelReference(reference: string): string {
	const { vendor, id } = splitModelReference(reference);
	return `${vendor}/${normalizeModelId(id)}`;
}

/** `anthropic/claude-haiku-4-5` → vendor `anthropic`; a bare id or `copilot/<id>` is a Copilot model. */
export function splitModelReference(reference: string): { readonly vendor: string; readonly id: string } {
	const slash = reference.indexOf('/');
	return slash < 0 ? { vendor: COPILOT_VENDOR, id: reference } : { vendor: reference.slice(0, slash).toLowerCase(), id: reference.slice(slash + 1) };
}

/**
 * Whether `model` is the one `reference` names. BYOK models are matched by vendor and id, ignoring the user's group name.
 * Not handled yet: groups that differ only in case or dots, an exact id that is also another group's shorthand, and on-device models.
 */
function modelMatchesReference(model: IAgentModelInfo, reference: string): boolean {
	const { vendor, id } = splitModelReference(reference);
	const byok = readAgentModelByokIdentifier(model);
	if (vendor === COPILOT_VENDOR) {
		return !byok && normalizeModelId(model.id) === normalizeModelId(id);
	}
	if (!byok) {
		return false;
	}
	// BYOK models are registered as `<vendor>/<group>/<id>` or `<vendor>/<id>`, and ids may contain `/`.
	const slash = byok.indexOf('/');
	if (slash < 0 || byok.slice(0, slash).toLowerCase() !== vendor) {
		return false;
	}
	const rest = byok.slice(slash + 1);
	const wanted = normalizeModelId(id);
	const groupSlash = rest.indexOf('/');
	return normalizeModelId(rest) === wanted || (groupSlash >= 0 && normalizeModelId(rest.slice(groupSlash + 1)) === wanted);
}

export type ModelReferenceMatch =
	| { readonly kind: 'model'; readonly model: IAgentModelInfo }
	| { readonly kind: 'ambiguous'; readonly models: readonly IAgentModelInfo[] };

/** The one model `reference` names, or every candidate when it names more than one. */
export function matchModelReference(models: readonly IAgentModelInfo[], reference: string): ModelReferenceMatch | undefined {
	const matches = models.filter(model => modelMatchesReference(model, reference));
	if (matches.length === 0) {
		return undefined;
	}
	return matches.length === 1 ? { kind: 'model', model: matches[0] } : { kind: 'ambiguous', models: matches };
}

/** Efforts a model accepts, from its config schema, in the canonical low-to-high order. */
export function supportedModelEfforts(model: IAgentModelInfo | undefined): readonly ModelRouterEffortLevel[] {
	const values = model?.configSchema?.properties[ReasoningEffortConfigKey]?.enum;
	const supported = new Set(values?.filter((value): value is string => typeof value === 'string'));
	return reasoningEffortLevels.filter(level => supported.has(level));
}

/** A model's context windows in tokens, smallest first. Fewer than two means it offers no choice. */
export function modelContextSizes(model: IAgentModelInfo | undefined): readonly number[] {
	const values = model?.configSchema?.properties[ContextSizeConfigKey]?.enum ?? [];
	return values.filter((value): value is number => typeof value === 'number' && value > 0).sort((a, b) => a - b);
}

/** The context window, in tokens, a model runs on when nothing selects one. For some models that is the larger window. */
export function modelDefaultContextSize(model: IAgentModelInfo | undefined): number | undefined {
	const value = model?.configSchema?.properties[ContextSizeConfigKey]?.default;
	return typeof value === 'number' ? value : undefined;
}

/** The name a router is shown by: its `display-name`, else its file name. */
export function modelRouterLabel(router: Pick<IModelRouter, 'name' | 'displayName'>): string {
	return router.displayName ?? router.name;
}

// ---- Resolution against the user's models ------------------------------------

export interface IResolvedModelRoute {
	readonly route: IModelRouterRoute;
	readonly model: IAgentModelInfo;
	/** The reference that matched, which is not the route's first when a fallback was used. */
	readonly reference: string;
	readonly supportedEfforts: readonly ModelRouterEffortLevel[];
	/** The fixed effort for this route (the route's, else the router's), when the model supports it. */
	readonly effort?: ModelRouterEffortLevel;
	/** The context window for this route (the route's, else the router's), when the model offers a choice. */
	readonly contextSize?: ModelRouterContextSize;
	/** The model's retirement notice, when the service has announced one. */
	readonly retiring?: string;
}

export interface IModelRouterResolution {
	/** Usable routes, in the router's order. The first is the fallback. */
	readonly routes: readonly IResolvedModelRoute[];
	readonly diagnostics: readonly IModelRouterDiagnostic[];
}

/** Whether a router may pick `model`: models that route themselves never are. */
export function isRoutableModel(model: IAgentModelInfo): boolean {
	return model.id !== 'auto' && !isModelRouterModelId(model.id) && !isCopilotHydraFusionModelId(model.id);
}

/**
 * Matches each route to a model the user has. A route whose models are all unavailable is
 * skipped rather than failing, so a shared router still works for someone without one of them.
 */
export function resolveModelRouter(router: IModelRouter, models: readonly IAgentModelInfo[]): IModelRouterResolution {
	const diagnostics: IModelRouterDiagnostic[] = [];
	const warning = diagnosticReporter(diagnostics, ModelRouterDiagnosticSeverity.Warning);
	const routable = models.filter(isRoutableModel);
	const routes: IResolvedModelRoute[] = [];
	const used = new Set<string>();
	router.routes.forEach((route, index) => {
		const label = modelRouterRouteLabel(route, index);
		let match: { model: IAgentModelInfo; reference: string } | undefined;
		for (const reference of route.models) {
			const result = matchModelReference(routable, reference);
			if (!result) {
				continue;
			}
			if (result.kind === 'ambiguous') {
				warning(`${label}: \`${reference}\` matches more than one model; use one of ${result.models.map(model => `\`${readAgentModelByokIdentifier(model) ?? model.id}\``).join(', ')}.`);
				continue;
			}
			if (result.model.policyState === PolicyState.Disabled) {
				warning(`${label}: ${result.model.name} is disabled by policy.`);
				continue;
			}
			match = { model: result.model, reference };
			break;
		}
		if (!match) {
			warning(`${label} (${route.models.join(', ')}) is skipped: none of its models are available on this account.`);
			return;
		}
		// A route without a name is its model, so a second one that lands on the same model has nothing to add.
		const key = route.name ?? match.model.id;
		if (used.has(key)) {
			// A name can also be a model's id, and a pick could then mean either route.
			if (route.name || routes.some(other => other.route.name === key)) {
				warning(`${label} is skipped: \`${key}\` is the name of one route and the model of another.`);
			}
			return;
		}
		used.add(key);
		if (match.reference !== route.models[0]) {
			warning(`${label} uses \`${match.reference}\` because \`${route.models[0]}\` is not available.`);
		}
		const supportedEfforts = supportedModelEfforts(match.model);
		const fixedEffort = router.effort === 'off' ? undefined : route.effort ?? (router.effort !== 'auto' ? router.effort : undefined);
		let effort: ModelRouterEffortLevel | undefined;
		if (fixedEffort) {
			if (supportedEfforts.includes(fixedEffort)) {
				effort = fixedEffort;
			} else if (supportedEfforts.length === 0) {
				warning(`${label}: ${match.model.name} has no reasoning effort setting, so effort \`${fixedEffort}\` is ignored.`);
			} else {
				warning(`${label}: ${match.model.name} doesn't support effort \`${fixedEffort}\`; it supports ${supportedEfforts.map(level => `\`${level}\``).join(', ')}.`);
			}
		}
		const hasContextChoice = modelContextSizes(match.model).length > 1;
		const contextSize = hasContextChoice ? route.contextSize ?? router.contextSize : undefined;
		// Only a route that asks for it itself is told; a router-wide setting applies where it can.
		if (route.contextSize === 'long' && !hasContextChoice) {
			warning(`${label}: ${match.model.name} has one context size, so \`context-size: long\` is ignored.`);
		}
		const retiring = readAgentModelNoticesMeta(match.model).warningText?.model_pending_deprecation;
		if (retiring) {
			warning(`${label}: ${match.model.name} is being retired. ${retiring} Add a newer model to its \`model\` list.`);
		}
		routes.push({ route, model: match.model, reference: match.reference, supportedEfforts, ...(effort ? { effort } : {}), ...(contextSize ? { contextSize } : {}), ...(retiring ? { retiring } : {}) });
	});
	if (router.contextSize === 'long' && routes.length > 0 && !routes.some(route => route.contextSize)) {
		warning('None of this router\'s models has a larger context size, so `context-size: long` is ignored.');
	}
	// A router written with one route never had anything to route between.
	if (routes.length < MODEL_ROUTER_MIN_ROUTES && router.routes.length >= MODEL_ROUTER_MIN_ROUTES) {
		warning(`Only ${routes.length} of this router's models ${routes.length === 1 ? 'is' : 'are'} available, so there is nothing to route between.`);
	}
	return { routes, diagnostics };
}
