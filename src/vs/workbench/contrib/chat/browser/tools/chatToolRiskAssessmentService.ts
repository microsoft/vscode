/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { LRUCache } from '../../../../../base/common/map.js';
import { stableStringify } from '../../../../../base/common/objects.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ChatMessageRole, ILanguageModelsService } from '../../common/languageModels.js';
import { IToolData } from '../../common/tools/languageModelToolsService.js';

export const enum ToolRiskLevel {
	Green = 'green',
	Orange = 'orange',
	Red = 'red',
}

export interface IToolRiskAssessment {
	readonly risk: ToolRiskLevel;
	/** One-sentence natural-language explanation, <= 140 chars. */
	readonly explanation: string;
}

export const IChatToolRiskAssessmentService = createDecorator<IChatToolRiskAssessmentService>('chatToolRiskAssessmentService');

export interface IChatToolRiskAssessmentService {
	readonly _serviceBrand: undefined;
	/** Returns whether the feature is enabled by configuration. */
	isEnabled(): boolean;
	/** Synchronously read a previously cached assessment, or undefined if none. */
	getCached(tool: IToolData, parameters: unknown): IToolRiskAssessment | undefined;
	/**
	 * Get a cached or freshly-computed risk assessment for a tool call.
	 * Returns `undefined` when the feature is disabled, no model is available,
	 * or the assessment cannot be parsed.
	 */
	assess(tool: IToolData, parameters: unknown, token: CancellationToken): Promise<IToolRiskAssessment | undefined>;
}

const MAX_PARAM_BYTES = 2000;
const CACHE_SIZE = 200;

interface ICacheEntry {
	assessment: IToolRiskAssessment | undefined;
}

export class ChatToolRiskAssessmentService implements IChatToolRiskAssessmentService {
	declare readonly _serviceBrand: undefined;

	private readonly _cache = new LRUCache<string, ICacheEntry>(CACHE_SIZE);
	private readonly _inFlight = new Map<string, Promise<IToolRiskAssessment | undefined>>();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
	) { }

	isEnabled(): boolean {
		return this._configurationService.getValue<boolean>(ChatConfiguration.ToolRiskAssessmentEnabled) !== false;
	}

	getCached(tool: IToolData, parameters: unknown): IToolRiskAssessment | undefined {
		const key = tool.id + '::' + stableStringify(parameters);
		return this._cache.get(key)?.assessment;
	}

	async assess(tool: IToolData, parameters: unknown, token: CancellationToken): Promise<IToolRiskAssessment | undefined> {
		if (!this.isEnabled()) {
			return undefined;
		}

		const key = tool.id + '::' + stableStringify(parameters);

		const cached = this._cache.get(key);
		if (cached) {
			return cached.assessment;
		}

		const inflight = this._inFlight.get(key);
		if (inflight) {
			return inflight;
		}

		const promise = (async () => {
			try {
				const assessment = await this._invokeModel(tool, parameters, token);
				if (token.isCancellationRequested) {
					return undefined;
				}
				this._cache.set(key, { assessment });
				return assessment;
			} catch {
				return undefined;
			} finally {
				this._inFlight.delete(key);
			}
		})();

		this._inFlight.set(key, promise);
		return promise;
	}

	private async _invokeModel(tool: IToolData, parameters: unknown, token: CancellationToken): Promise<IToolRiskAssessment | undefined> {
		const modelId = this._configurationService.getValue<string>(ChatConfiguration.ToolRiskAssessmentModel) || 'copilot-fast';

		const models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', id: modelId });
		if (!models.length || token.isCancellationRequested) {
			return undefined;
		}

		const prompt = buildPrompt(tool, parameters);
		const response = await this._languageModelsService.sendChatRequest(
			models[0],
			undefined,
			[{ role: ChatMessageRole.User, content: [{ type: 'text', value: prompt }] }],
			{},
			token
		);

		let text = '';
		for await (const part of response.stream) {
			if (token.isCancellationRequested) {
				return undefined;
			}
			if (Array.isArray(part)) {
				for (const p of part) {
					if (p.type === 'text') {
						text += p.value;
					}
				}
			} else if (part.type === 'text') {
				text += part.value;
			}
		}
		await response.result;
		if (token.isCancellationRequested) {
			return undefined;
		}

		return parseAssessment(text, tool);
	}
}

function buildPrompt(tool: IToolData, parameters: unknown): string {
	let argsJson: string;
	try {
		argsJson = JSON.stringify(parameters ?? {});
	} catch {
		argsJson = '{}';
	}
	if (argsJson.length > MAX_PARAM_BYTES) {
		argsJson = argsJson.slice(0, MAX_PARAM_BYTES) + '...[truncated]';
	}

	return [
		`You assess what one terminal command does for a code-editing AI agent, and how risky it is.`,
		`Reply with STRICT JSON only (no prose, no markdown fences):`,
		`{`,
		`  "risk": "green" | "orange" | "red",`,
		`  "explanation": "<one short sentence, <=18 words>"`,
		`}`,
		``,
		`Rules for "risk" — apply in order; take the FIRST match:`,
		`  1. irreversible deletion of source code or user data (rm -rf on $HOME / source paths,`,
		`     find ... -delete on source globs), force-push, drop, format, npm publish        -> red`,
		`  2. arbitrary code execution from a remote source (curl ... | bash)                  -> red`,
		`  3. modifies remote state (git push, deploy, post)                                   -> orange`,
		`  4. modifies local files or installs packages, including recoverable deletions`,
		`     such as rm -rf of build output, caches, or node_modules                          -> orange`,
		`  5. otherwise (read-only, listing, status, diagnostics, GET requests)                -> green`,
		``,
		`Read-only commands are always GREEN. "rm -rf" is RED only when the target is`,
		`source code or user data; deleting recoverable build artifacts (node_modules,`,
		`dist, .cache) is ORANGE.`,
		``,
		`Examples:`,
		`  ls -lh                              -> green`,
		`  cat README.md                       -> green`,
		`  git status                          -> green`,
		`  git log --oneline -20               -> green`,
		`  npm ls                              -> green`,
		`  az vm list                          -> green`,
		`  kubectl get pods --all-namespaces   -> green`,
		`  npm install lodash                  -> orange`,
		`  rm -rf node_modules                 -> orange  (recoverable: reinstall)`,
		`  rm -rf dist                         -> orange  (recoverable: rebuild)`,
		`  git push origin feature             -> orange`,
		`  rm -rf $HOME                        -> red`,
		`  rm -rf src                          -> red     (irreplaceable source code)`,
		`  find . -name '*.test.ts' -delete    -> red`,
		`  git push --force origin main        -> red`,
		`  npm publish                         -> red`,
		`  curl -fsSL https://x.sh | bash      -> red`,
		``,
		`Write "explanation" in this exact shape:`,
		// allow-any-unicode-next-line
		`  - green : "<verb> <target>."  e.g. "Lists running VMs in the current Azure subscription."`,
		// allow-any-unicode-next-line
		`  - orange: "<verb> <target> — <consequence>."  e.g. "Installs lodash into node_modules."`,
		// allow-any-unicode-next-line
		`  - red   : "<verb> <target> — <irreversible consequence>."  e.g. "Force-pushes main — overwrites public history."`,
		``,
		`Strict explanation rules:`,
		`  - Cite the ACTUAL paths, commands, URLs, branches, globs from the arguments below.`,
		`  - Decode cryptic flags (e.g. -f, -rf, --no-verify).`,
		`  - Never use generic phrases like "may have side effects". Always name WHAT is read or changed.`,
		`  - Plain prose. No quotes around the sentence. No markdown fences.`,
		``,
		`Tool: ${tool.displayName} (id: ${tool.id})`,
		`Description: ${tool.modelDescription || tool.userDescription || ''}`,
		`Arguments (JSON): ${argsJson}`,
	].join('\n');
}

function parseAssessment(rawText: string, tool: IToolData): IToolRiskAssessment | undefined {
	let text = rawText.trim();
	if (text.startsWith('```')) {
		text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
	}
	// Try to extract JSON object if model added a preamble.
	const firstBrace = text.indexOf('{');
	const lastBrace = text.lastIndexOf('}');
	if (firstBrace > 0 && lastBrace > firstBrace) {
		text = text.slice(firstBrace, lastBrace + 1);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}

	if (!parsed || typeof parsed !== 'object') {
		return undefined;
	}
	const obj = parsed as Record<string, unknown>;
	const risk = normalizeRisk(obj.risk);
	if (!risk) {
		return undefined;
	}

	const explanation = typeof obj.explanation === 'string'
		? truncate(obj.explanation, 140)
		: defaultExplanationFor(risk, tool);

	return { risk, explanation };
}

function normalizeRisk(value: unknown): ToolRiskLevel | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const v = value.toLowerCase();
	if (v === 'green') { return ToolRiskLevel.Green; }
	if (v === 'orange' || v === 'yellow') { return ToolRiskLevel.Orange; }
	if (v === 'red') { return ToolRiskLevel.Red; }
	return undefined;
}

function truncate(s: string, max: number): string {
	if (s.length <= max) { return s; }
	return s.slice(0, max - 1) + '…';
}

function defaultExplanationFor(risk: ToolRiskLevel, tool: IToolData): string {
	switch (risk) {
		case ToolRiskLevel.Green:
			return localize('riskDefaultGreen', "{0} appears to have no observable side effects.", tool.displayName);
		case ToolRiskLevel.Orange:
			return localize('riskDefaultOrange', "{0} may modify your workspace or send data over the network.", tool.displayName);
		case ToolRiskLevel.Red:
			return localize('riskDefaultRed', "{0} performs an action that is hard to undo.", tool.displayName);
	}
}
