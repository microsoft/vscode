/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IToolResult, IToolResultTextPart } from '../../common/tools/languageModelToolsService.js';
import { formatCompressionBanner, IToolResultCache, IToolResultCompressor, IToolResultFilter, isProtectedFromCompression, MIN_COMPRESSIBLE_LENGTH } from '../../common/tools/toolResultCompressor.js';

type ToolResultCompressedClassification = {
	owner: 'meganrogge';
	comment: 'Reports tool output compression savings.';
	toolId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The tool whose output was compressed.' };
	filters: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Comma-separated filter ids that fired.' };
	beforeChars: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total text part length in UTF-16 code units before compression.' };
	afterChars: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total text part length in UTF-16 code units after compression.' };
	cacheHit: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'True when the compressed result came from a session-memory cache hit (response dedup) rather than from filters.' };
};

type ToolResultCompressedEvent = {
	toolId: string;
	filters: string;
	beforeChars: number;
	afterChars: number;
	cacheHit: boolean;
};

export class ToolResultCompressorService extends Disposable implements IToolResultCompressor {
	declare readonly _serviceBrand: undefined;

	private readonly _filters = new Map<string, IToolResultFilter[]>();
	private readonly _caches = new Map<string, IToolResultCache[]>();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	registerFilter(filter: IToolResultFilter): void {
		for (const id of filter.toolIds) {
			let bucket = this._filters.get(id);
			if (!bucket) {
				bucket = [];
				this._filters.set(id, bucket);
			}
			bucket.push(filter);
		}
	}

	registerCache(cache: IToolResultCache): void {
		for (const id of cache.toolIds) {
			let bucket = this._caches.get(id);
			if (!bucket) {
				bucket = [];
				this._caches.set(id, bucket);
			}
			bucket.push(cache);
		}
	}

	maybeCompress(toolId: string, input: unknown, result: IToolResult): IToolResult | undefined {
		if (!this._configurationService.getValue<boolean>(ChatConfiguration.CompressOutputEnabled)) {
			return undefined;
		}

		// Caches run independently of filters. Even if no filters match, a
		// cache hit can replace the output with a one-liner.
		const caches = this._caches.get(toolId);
		if (caches && caches.length > 0) {
			for (const c of caches) {
				try { c.observe(toolId, input); } catch (err) {
					this._logService.warn(`[ToolResultCompressor] cache ${c.id} threw in observe on tool ${toolId}: ${getErrorMessage(err)}`, err);
				}
			}
			for (const c of caches) {
				let hit;
				try { hit = c.lookup(toolId, input); } catch (err) {
					this._logService.warn(`[ToolResultCompressor] cache ${c.id} threw in lookup on tool ${toolId}: ${getErrorMessage(err)}`, err);
					continue;
				}
				if (hit) {
					const totalBefore = result.content.reduce((acc, p) => acc + (p.kind === 'text' ? p.value.length : 0), 0);
					// Guard: don't replace small outputs or structured data.
					if (totalBefore < MIN_COMPRESSIBLE_LENGTH) {
						continue;
					}
					const hasProtectedContent = result.content.some(p => p.kind === 'text' && isProtectedFromCompression(p.value));
					if (hasProtectedContent) {
						continue;
					}
					const cachedResult = this._buildCacheHitResult(result, hit);
					const totalAfter = cachedResult.content.reduce((acc, p) => acc + (p.kind === 'text' ? p.value.length : 0), 0);
					if (totalAfter >= totalBefore) {
						continue;
					}
					this._sendTelemetry(toolId, [`cache:${c.id}`], totalBefore, totalAfter, true);
					return cachedResult;
				}
			}
		}

		const filters = this._filters.get(toolId);
		const matchingFilters = filters?.filter(f => {
			try {
				return f.matches(toolId, input);
			} catch (err) {
				this._logService.warn(`[ToolResultCompressor] filter ${f.id} threw in matches on tool ${toolId}: ${getErrorMessage(err)}`, err);
				return false;
			}
		}) ?? [];
		if (matchingFilters.length === 0) {
			// No filters matched, but we may still want to record the raw output
			// in the caches so the next read-only call can hit.
			this._recordInCaches(toolId, input, result, caches);
			return undefined;
		}

		// Mutable copy: filters that throw get spliced out so we don't repeatedly
		// invoke a broken filter on every subsequent text part in this pass.
		const activeFilters = matchingFilters.slice();
		const disabledFilterIds = new Set<string>();

		let totalBefore = 0;
		let totalAfter = 0;
		let anyCompressed = false;
		const usedFilterIds = new Set<string>();

		const newContent = result.content.map(part => {
			if (part.kind !== 'text') {
				return part;
			}
			const original = part.value;
			totalBefore += original.length;
			if (original.length < MIN_COMPRESSIBLE_LENGTH) {
				totalAfter += original.length;
				return part;
			}
			// Registry-level "never make it worse" guard: don't pass structured
			// data (JSON / TOML / YAML headers) through filters even if they say
			// they match.
			if (isProtectedFromCompression(original)) {
				totalAfter += original.length;
				return part;
			}

			let current = original;
			const partFilterIds: string[] = [];
			for (let i = 0; i < activeFilters.length; /* manual increment */) {
				const filter = activeFilters[i];
				try {
					const out = filter.apply(current, input);
					if (out.compressed && out.text.length < current.length) {
						current = out.text;
						usedFilterIds.add(filter.id);
						partFilterIds.push(filter.id);
					}
					i++;
				} catch (err) {
					// "Never make it worse." Disable the filter for the rest of this
					// compression pass so it can't repeatedly throw on later text parts,
					// and warn at most once per filter.
					activeFilters.splice(i, 1);
					if (!disabledFilterIds.has(filter.id)) {
						disabledFilterIds.add(filter.id);
						this._logService.warn(`[ToolResultCompressor] filter ${filter.id} threw on tool ${toolId}; disabled for this pass: ${getErrorMessage(err)}`, err);
					}
				}
			}

			totalAfter += current.length;
			if (current !== original) {
				anyCompressed = true;
				// Prepend a banner so the model knows the output was filtered, by
				// which filters, and how to disable compression. We only annotate
				// the parts we actually changed — non-compressed parts pass through
				// untouched.
				const banner = formatCompressionBanner(partFilterIds, original.length, current.length);
				const annotated = `${banner}\n${current}`;
				const rewritten: IToolResultTextPart = {
					kind: 'text',
					value: annotated,
					audience: part.audience,
					title: part.title,
				};
				return rewritten;
			}
			return part;
		});

		if (!anyCompressed) {
			this._recordInCaches(toolId, input, result, caches);
			return undefined;
		}

		this._sendTelemetry(toolId, [...usedFilterIds], totalBefore, totalAfter, false);

		const finalResult: IToolResult = {
			...result,
			content: newContent,
		};
		this._recordInCaches(toolId, input, finalResult, caches);
		return finalResult;
	}

	private _buildCacheHitResult(original: IToolResult, hit: { text: string; timestamp: number }): IToolResult {
		const iso = new Date(hit.timestamp).toISOString();
		const text = `Same output as last run (${iso}). To disable, set ${ChatConfiguration.CompressOutputEnabled} to false.`;
		// Preserve the first text part's audience metadata so downstream
		// model-routing logic still behaves the same way.
		const firstText = original.content.find((p): p is IToolResultTextPart => p.kind === 'text');
		const replacement: IToolResultTextPart = {
			kind: 'text',
			value: text,
			audience: firstText?.audience,
			title: firstText?.title,
		};
		// Drop other text parts but keep non-text parts (e.g. binary data) so
		// downstream consumers don't lose attachments.
		const nonText = original.content.filter(p => p.kind !== 'text');
		return { ...original, content: [replacement, ...nonText] };
	}

	private _recordInCaches(toolId: string, input: unknown, result: IToolResult, caches: readonly IToolResultCache[] | undefined): void {
		if (!caches || caches.length === 0) {
			return;
		}
		const text = result.content
			.filter((p): p is IToolResultTextPart => p.kind === 'text')
			.map(p => p.value)
			.join('\n');
		if (!text) {
			return;
		}
		for (const c of caches) {
			try {
				c.record(toolId, input, text);
			} catch (err) {
				this._logService.warn(`[ToolResultCompressor] cache ${c.id} threw in record on tool ${toolId}: ${getErrorMessage(err)}`, err);
			}
		}
	}

	private _sendTelemetry(toolId: string, filterIds: string[], beforeChars: number, afterChars: number, cacheHit: boolean) {
		this._telemetryService.publicLog2<ToolResultCompressedEvent, ToolResultCompressedClassification>(
			'toolResultCompressed',
			{
				toolId,
				filters: filterIds.join(','),
				beforeChars,
				afterChars,
				cacheHit,
			},
		);
	}
}
