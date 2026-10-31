/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DFLASH_SPEC_TYPE, PRESET_INI_MAX_BYTES, PRESET_MAX_PARALLEL } from './constants.js';

/* `llama-config.json` / `llama-default.ini` -> `llama-server` arguments. The preset is registry data, so parsing is strict: allowlisted keys and values only. */

/** Preset keys and how their values are validated. */
type PresetValueKind = 'positiveInt' | 'nonNegativeInt' | 'int' | 'unitFloat' | 'nonNegativeFloat' | 'boolean' | 'layers' | 'onOff' | 'onOffAuto' | 'specType' | 'ggufName';

const PRESET_KEYS: Readonly<Record<string, PresetValueKind>> = {
	// core
	'ctx-size': 'positiveInt',
	'parallel': 'positiveInt',
	'load-on-startup': 'boolean',
	'jinja': 'boolean',
	'no-host': 'boolean',
	// sampling
	'temp': 'nonNegativeFloat',
	'top-p': 'unitFloat',
	'min-p': 'unitFloat',
	'top-k': 'nonNegativeInt',
	// batching and cache
	'batch-size': 'positiveInt',
	'ubatch-size': 'positiveInt',
	'ctx-checkpoints': 'nonNegativeInt',
	'cache-ram': 'int',
	// offload
	'n-gpu-layers': 'layers',
	'flash-attn': 'onOffAuto',
	'fit': 'onOff',
	// speculative decoding
	'spec-type': 'specType',
	'spec-draft-n-max': 'positiveInt',
	'spec-draft-p-min': 'unitFloat',
	'spec-draft-ngl': 'layers',
	// The DFlash companion GGUF, by bare file name relative to the version directory.
	'spec-draft-model': 'ggufName',
};

/** Aliases accepted in the INI and normalized to the canonical key. */
const PRESET_KEY_ALIASES: Readonly<Record<string, string>> = {
	'model-draft': 'spec-draft-model',
	'gpu-layers': 'n-gpu-layers',
	'gpu-layers-draft': 'spec-draft-ngl',
	'n-gpu-layers-draft': 'spec-draft-ngl',
};

/** Keys consumed by the host (manifest / spawn) rather than passed as preset arguments. */
const NON_ARGUMENT_KEYS = new Set(['ctx-size', 'parallel', 'load-on-startup']);

/** Keys belonging to the speculative configuration, dropped as a whole when DFlash is unsupported. */
const SPECULATIVE_KEYS = new Set(['spec-type', 'spec-draft-n-max', 'spec-draft-p-min', 'spec-draft-ngl', 'spec-draft-model']);

/** One validated `key = value` entry, in file order. */
export interface ILlamaPresetEntry {
	readonly key: string;
	readonly value: string;
}

/** A validated preset. */
export interface ILlamaPreset {
	readonly section: string;
	readonly entries: readonly ILlamaPresetEntry[];
	readonly ctxSize: number | undefined;
	readonly parallel: number | undefined;
	/** The DFlash companion GGUF (bare file name), when the preset uses speculative decoding. */
	readonly draftModel: string | undefined;
	/** The primary GGUF (bare file name) when the preset names it (`llama-config.json`); the INI does not. */
	readonly primaryModel?: string;
}

export type LlamaPresetParseResult =
	| { readonly ok: true; readonly preset: ILlamaPreset }
	| { readonly ok: false; readonly reason: string };

function isValidValue(kind: PresetValueKind, value: string): boolean {
	switch (kind) {
		case 'positiveInt': return /^[1-9]\d{0,8}$/.test(value);
		case 'nonNegativeInt': return /^(0|[1-9]\d{0,8})$/.test(value);
		case 'int': return /^-?(0|[1-9]\d{0,8})$/.test(value);
		case 'unitFloat': return /^(0(\.\d+)?|1(\.0+)?|\.\d+)$/.test(value);
		case 'nonNegativeFloat': return /^\d{1,3}(\.\d+)?$/.test(value);
		case 'boolean': return value === 'true' || value === 'false';
		case 'layers': return value === 'all' || value === 'auto' || /^(0|[1-9]\d{0,4})$/.test(value);
		case 'onOff': return value === 'on' || value === 'off';
		case 'onOffAuto': return value === 'on' || value === 'off' || value === 'auto';
		case 'specType': return value === DFLASH_SPEC_TYPE;
		case 'ggufName': return /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}\.gguf$/.test(value);
	}
}

/**
 * Parses and validates `llama-default.ini` for `assetName`: `version = 1`, exactly one section named after the asset,
 * allowlisted keys at most once each, and `jinja` not disabled (agent sessions need tool calls). Pure.
 */
export function parseLlamaPreset(text: string, assetName: string): LlamaPresetParseResult {
	if (text.length > PRESET_INI_MAX_BYTES) {
		return { ok: false, reason: 'tooLarge' };
	}
	let version: string | undefined;
	let section: string | undefined;
	let sectionCount = 0;
	const entries: ILlamaPresetEntry[] = [];
	const seen = new Set<string>();
	for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith(';') || line.startsWith('#')) {
			continue;
		}
		const sectionMatch = /^\[(?<name>[^\]]+)\]$/.exec(line);
		if (sectionMatch?.groups) {
			sectionCount++;
			section = sectionMatch.groups.name.trim();
			continue;
		}
		const kvMatch = /^(?<key>[A-Za-z0-9-]+)\s*=\s*(?<value>.*)$/.exec(line);
		if (!kvMatch?.groups) {
			return { ok: false, reason: 'syntax' };
		}
		const rawKey = kvMatch.groups.key.toLowerCase();
		const value = kvMatch.groups.value.trim().replace(/^"(.*)"$/, '$1');
		if (section === undefined) {
			if (rawKey !== 'version' || version !== undefined) {
				return { ok: false, reason: `unexpectedGlobalKey:${rawKey}` };
			}
			version = value;
			continue;
		}
		const key = PRESET_KEY_ALIASES[rawKey] ?? rawKey;
		const kind = PRESET_KEYS[key];
		if (!kind) {
			return { ok: false, reason: `unknownKey:${rawKey}` };
		}
		if (seen.has(key)) {
			return { ok: false, reason: `duplicateKey:${key}` };
		}
		const normalized = kind === 'onOff' || kind === 'onOffAuto' || kind === 'boolean' || kind === 'layers' || kind === 'specType' ? value.toLowerCase() : value;
		if (!isValidValue(kind, normalized)) {
			return { ok: false, reason: `invalidValue:${key}` };
		}
		seen.add(key);
		entries.push({ key, value: normalized });
	}
	if (version !== '1') {
		return { ok: false, reason: 'version' };
	}
	if (sectionCount !== 1 || section === undefined || section.toLowerCase() !== assetName.toLowerCase()) {
		return { ok: false, reason: 'section' };
	}
	return finishPreset(section, entries, undefined);
}

/** Cross-key rules shared by both preset formats. */
function finishPreset(section: string, entries: readonly ILlamaPresetEntry[], primaryModel: string | undefined): LlamaPresetParseResult {
	const get = (key: string) => entries.find(entry => entry.key === key)?.value;
	const parallel = get('parallel') !== undefined ? Number(get('parallel')) : undefined;
	if (parallel !== undefined && parallel > PRESET_MAX_PARALLEL) {
		return { ok: false, reason: 'invalidValue:parallel' };
	}
	if (get('jinja') === 'false') {
		return { ok: false, reason: 'invalidValue:jinja' };
	}
	const specType = get('spec-type');
	const draftModel = get('spec-draft-model');
	if (specType !== undefined && draftModel === undefined) {
		return { ok: false, reason: 'missingDraftModel' };
	}
	if (specType === undefined && entries.some(entry => SPECULATIVE_KEYS.has(entry.key))) {
		return { ok: false, reason: 'speculativeWithoutSpecType' };
	}
	if (primaryModel !== undefined && draftModel !== undefined && primaryModel.toLowerCase() === draftModel.toLowerCase()) {
		return { ok: false, reason: 'draftIsPrimary' };
	}
	const ctxSize = get('ctx-size') !== undefined ? Number(get('ctx-size')) : undefined;
	return { ok: true, preset: { section, entries, ctxSize, parallel, draftModel, ...(primaryModel !== undefined ? { primaryModel } : {}) } };
}

/** Top-level fields of `llama-config.json`; anything else is rejected. */
const CONFIG_JSON_FIELDS = new Set(['model', 'draftModel', 'ctxSize', 'parallel', 'nGpuLayers', 'args']);

/** Preset keys the JSON config sets through top-level fields (or the host owns), never through `args`. */
const CONFIG_JSON_FIELD_KEYS = new Set(['ctx-size', 'parallel', 'load-on-startup', 'n-gpu-layers', 'spec-draft-model']);

/**
 * Parses and validates `llama-config.json` into the same preset shape as {@link parseLlamaPreset}: bare GGUF names and
 * an `args` list of allowlisted flags, with the INI's cross-key rules. `--jinja` is added when absent, as tool calls need it. Pure.
 */
export function parseLlamaConfigJson(text: string, assetName: string): LlamaPresetParseResult {
	if (text.length > PRESET_INI_MAX_BYTES || text.includes('\0')) {
		return { ok: false, reason: 'tooLarge' };
	}
	let value: unknown;
	try {
		value = JSON.parse(text.replace(/^\uFEFF/, ''));
	} catch {
		return { ok: false, reason: 'syntax' };
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { ok: false, reason: 'syntax' };
	}
	const config = value as Record<string, unknown>;
	const unknownField = Object.keys(config).find(key => !CONFIG_JSON_FIELDS.has(key));
	if (unknownField !== undefined) {
		return { ok: false, reason: `unknownField:${unknownField}` };
	}
	const { model, draftModel, ctxSize, parallel, nGpuLayers, args } = config;
	if (typeof model !== 'string' || !isValidValue('ggufName', model)) {
		return { ok: false, reason: 'invalidValue:model' };
	}
	if (draftModel !== undefined && (typeof draftModel !== 'string' || !isValidValue('ggufName', draftModel))) {
		return { ok: false, reason: 'invalidValue:draftModel' };
	}
	const asInteger = (field: unknown) => typeof field === 'number' && Number.isSafeInteger(field) ? String(field) : undefined;
	const ctx = asInteger(ctxSize);
	const slots = asInteger(parallel);
	const layers = asInteger(nGpuLayers);
	if (ctx === undefined || !isValidValue('positiveInt', ctx)) {
		return { ok: false, reason: 'invalidValue:ctxSize' };
	}
	if (slots === undefined || !isValidValue('positiveInt', slots)) {
		return { ok: false, reason: 'invalidValue:parallel' };
	}
	if (nGpuLayers !== undefined && (layers === undefined || !isValidValue('layers', layers))) {
		return { ok: false, reason: 'invalidValue:nGpuLayers' };
	}
	if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
		return { ok: false, reason: 'invalidValue:args' };
	}
	const entries: ILlamaPresetEntry[] = [];
	const seen = new Set<string>();
	for (let index = 0; index < args.length; index++) {
		const flag: string = args[index];
		const rawKey = /^--(?<key>[a-z0-9-]+)$/.exec(flag)?.groups?.key;
		if (!rawKey) {
			return { ok: false, reason: `syntax:${flag}` };
		}
		const key = PRESET_KEY_ALIASES[rawKey] ?? rawKey;
		const kind = PRESET_KEYS[key];
		if (!kind || CONFIG_JSON_FIELD_KEYS.has(key)) {
			return { ok: false, reason: `unknownKey:${rawKey}` };
		}
		if (seen.has(key)) {
			return { ok: false, reason: `duplicateKey:${key}` };
		}
		let entryValue = 'true';
		if (kind !== 'boolean') {
			const next: unknown = args[++index];
			if (typeof next !== 'string') {
				return { ok: false, reason: `invalidValue:${key}` };
			}
			entryValue = kind === 'onOff' || kind === 'onOffAuto' || kind === 'layers' || kind === 'specType' ? next.toLowerCase() : next;
			if (!isValidValue(kind, entryValue)) {
				return { ok: false, reason: `invalidValue:${key}` };
			}
		}
		seen.add(key);
		entries.push({ key, value: entryValue });
	}
	if (layers !== undefined) {
		entries.push({ key: 'n-gpu-layers', value: layers });
	}
	if (typeof draftModel === 'string') {
		entries.push({ key: 'spec-draft-model', value: draftModel });
	}
	if (!seen.has('jinja')) {
		entries.push({ key: 'jinja', value: 'true' });
	}
	entries.push({ key: 'ctx-size', value: ctx }, { key: 'parallel', value: slots });
	return finishPreset(assetName, entries, model);
}

/** Profile overrides applied on top of the preset. */
export interface ILlamaPresetOverrides {
	readonly fit?: 'on' | 'off';
	readonly nGpuLayers?: string;
	readonly specDraftNgl?: string;
	readonly flashAttn?: 'on' | 'off' | 'auto';
	/** Drop the whole speculative configuration (a downgrade step). */
	readonly dropSpeculative?: boolean;
	/** `--ctx-checkpoints`: lets a model with recurrent layers reuse its cache across turns. */
	readonly ctxCheckpoints?: string;
}

/** What the probe of the resolved `llama-server` found. */
export interface ILlamaServerFlagSupport {
	/** Every long flag listed by `--help` (for example `--cache-ram`). */
	readonly flags: ReadonlySet<string>;
	readonly dflashSupported: boolean;
}

export interface ILlamaPresetArgs {
	readonly args: readonly string[];
	/** Whether speculative decoding is part of the arguments. */
	readonly speculative: boolean;
	/** Flags removed because the probe did not find them. */
	readonly droppedFlags: readonly string[];
}

const BOOLEAN_FLAG_KEYS = new Set(['jinja', 'no-host']);

/**
 * Builds the preset's `llama-server` arguments in preset order, with overrides applied, unsupported optional flags dropped
 * and the speculative configuration dropped as a whole when unsupported. `--spec-draft-model` comes last but one, before
 * `--jinja`, matching the MAI v3 golden. Pure.
 */
export function buildLlamaPresetArgs(preset: ILlamaPreset, support: ILlamaServerFlagSupport, overrides: ILlamaPresetOverrides = {}): ILlamaPresetArgs {
	const speculative = !!preset.draftModel && support.dflashSupported && !overrides.dropSpeculative;
	const overrideValues: Record<string, string | undefined> = {
		'fit': overrides.fit,
		'n-gpu-layers': overrides.nGpuLayers,
		'spec-draft-ngl': overrides.specDraftNgl,
		'flash-attn': overrides.flashAttn,
		'ctx-checkpoints': overrides.ctxCheckpoints,
	};
	const entries = preset.entries.map(entry => overrideValues[entry.key] !== undefined ? { key: entry.key, value: overrideValues[entry.key]! } : entry);
	for (const [key, value] of Object.entries(overrideValues)) {
		if (value !== undefined && !entries.some(entry => entry.key === key) && (key !== 'spec-draft-ngl' || speculative)) {
			entries.push({ key, value });
		}
	}

	const ordered = [
		...entries.filter(entry => entry.key !== 'spec-draft-model' && entry.key !== 'jinja'),
		...entries.filter(entry => entry.key === 'spec-draft-model'),
		...entries.filter(entry => entry.key === 'jinja'),
	];
	const args: string[] = [];
	const droppedFlags: string[] = [];
	for (const entry of ordered) {
		if (NON_ARGUMENT_KEYS.has(entry.key)) {
			continue;
		}
		if (SPECULATIVE_KEYS.has(entry.key) && !speculative) {
			continue;
		}
		const flag = `--${entry.key}`;
		if (!support.flags.has(flag)) {
			droppedFlags.push(flag);
			continue;
		}
		if (BOOLEAN_FLAG_KEYS.has(entry.key)) {
			if (entry.value === 'true') {
				args.push(flag);
			}
			continue;
		}
		args.push(flag, entry.value);
	}
	return { args, speculative, droppedFlags };
}
