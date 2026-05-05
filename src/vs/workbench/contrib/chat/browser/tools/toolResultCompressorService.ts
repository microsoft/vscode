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
import { formatCompressionBanner, IToolResultCompressor, IToolResultFilter, MIN_COMPRESSIBLE_LENGTH } from '../../common/tools/toolResultCompressor.js';

type ToolResultCompressedClassification = {
	owner: 'meganrogge';
	comment: 'Reports tool output compression savings.';
	toolId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The tool whose output was compressed.' };
	filters: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Comma-separated filter ids that fired.' };
	beforeChars: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total text part length in UTF-16 code units before compression.' };
	afterChars: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total text part length in UTF-16 code units after compression.' };
};

type ToolResultCompressedEvent = {
	toolId: string;
	filters: string;
	beforeChars: number;
	afterChars: number;
};

export class ToolResultCompressorService extends Disposable implements IToolResultCompressor {
	declare readonly _serviceBrand: undefined;

	private readonly _filters = new Map<string, IToolResultFilter[]>();

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

	maybeCompress(toolId: string, input: unknown, result: IToolResult): IToolResult | undefined {
		if (!this._configurationService.getValue<boolean>(ChatConfiguration.CompressOutputEnabled)) {
			return undefined;
		}

		const filters = this._filters.get(toolId);
		if (!filters || filters.length === 0) {
			return undefined;
		}

		const matchingFilters = filters.filter(f => f.matches(toolId, input));
		if (matchingFilters.length === 0) {
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
			return undefined;
		}

		this._sendTelemetry(toolId, [...usedFilterIds], totalBefore, totalAfter);

		return {
			...result,
			content: newContent,
		};
	}

	private _sendTelemetry(toolId: string, filterIds: string[], beforeChars: number, afterChars: number) {
		this._telemetryService.publicLog2<ToolResultCompressedEvent, ToolResultCompressedClassification>(
			'toolResultCompressed',
			{
				toolId,
				filters: filterIds.join(','),
				beforeChars,
				afterChars,
			},
		);
	}
}
