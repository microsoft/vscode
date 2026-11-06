/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { Registry } from '../../registry/common/platform.js';
import { ITelemetryService, TelemetryLevel } from '../../telemetry/common/telemetry.js';

/**
 * Probability that a session sends memory samples. Experiments only change its
 * default in windows, because they don't resolve in the main process.
 */
export const MEMORY_SAMPLING_PROBABILITY_SETTING_ID = 'telemetry.performance.memorySamplingProbability';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'telemetry',
	type: 'object',
	title: localize('telemetryConfigurationTitle', "Telemetry"),
	properties: {
		[MEMORY_SAMPLING_PROBABILITY_SETTING_ID]: {
			type: 'number',
			default: product.quality === 'stable' ? 0.01 : 1,
			minimum: 0,
			maximum: 1,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'telemetry'],
			markdownDescription: localize('telemetry.performance.memorySamplingProbability', "Probability (0 to 1) that memory usage telemetry is reported for this session. Set to 0 to disable, 1 to always report."),
			experiment: {
				mode: 'auto'
			}
		}
	}
});

/**
 * Whether a session with the given random number in [0, 1) reports memory.
 */
export function isMemorySampled(random: number, configurationService: IConfigurationService, telemetryService: ITelemetryService): boolean {
	const probability = configurationService.getValue<unknown>(MEMORY_SAMPLING_PROBABILITY_SETTING_ID);

	return telemetryService.telemetryLevel === TelemetryLevel.USAGE && typeof probability === 'number' && random < probability;
}

/**
 * How often the memory of processes and windows is sampled.
 */
export const MEMORY_SAMPLING_INTERVAL = 60 * 1000;

/**
 * A longer time between two samples means that the machine was asleep.
 */
const MAX_AWAKE_GAP = 10 * 60 * 1000;

/**
 * Minutes of awake uptime at which memory is reported, and then every day.
 */
const MILESTONES = [15, 60, 240, 480, 1440];
const DAY = 1440;

function getMilestone(index: number): number {
	const last = MILESTONES.length - 1;
	return index <= last ? MILESTONES[index] : MILESTONES[last] + (index - last) * DAY;
}

/**
 * Measures how long a process or window has been running while the machine was
 * awake, and tells when that time reaches the next milestone to report memory at.
 */
export class AwakeUptimeClock {

	private awakeTime: number;
	private lastTime: number;
	private nextMilestoneIndex = 0;

	constructor(startTime: number, now: number) {
		this.awakeTime = Math.max(0, now - startTime);
		this.lastTime = now;
	}

	/**
	 * Advances the clock to `now`. Returns the milestone in minutes that was
	 * reached, or the latest one if several were.
	 */
	advance(now: number): number | undefined {
		const elapsed = now - this.lastTime;
		this.lastTime = now;
		if (elapsed > 0 && elapsed <= MAX_AWAKE_GAP) {
			this.awakeTime += elapsed;
		}

		let milestone: number | undefined;
		while (this.awakeTime >= getMilestone(this.nextMilestoneIndex) * 60 * 1000) {
			milestone = getMilestone(this.nextMilestoneIndex++);
		}

		return milestone;
	}
}

export function toMegabytes(kilobytes: number): number {
	return Math.round(kilobytes / 1024);
}
