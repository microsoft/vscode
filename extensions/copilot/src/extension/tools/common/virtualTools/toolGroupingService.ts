/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolInformation } from 'vscode';
import { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { LRUCache } from '../../../../util/vs/base/common/map';
import { IObservable } from '../../../../util/vs/base/common/observableInternal';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { computeToolGroupingMinThreshold, ToolGrouping } from './toolGrouping';
import { IToolGrouping, IToolGroupingService } from './virtualToolTypes';

export class ToolGroupingService implements IToolGroupingService {
	declare readonly _serviceBrand: undefined;

	private readonly _groups = new LRUCache<string, IToolGrouping>(3);

	public threshold: IObservable<number>;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentationService: IExperimentationService
	) {
		this.threshold = computeToolGroupingMinThreshold(experimentationService, configurationService);
	}

	create(sessionId: string, tools: readonly LanguageModelToolInformation[]): IToolGrouping {
		const existing = this._groups.get(sessionId);
		if (existing) {
			existing.tools = tools;
			return existing;
		}

		const grouping = this._instantiationService.createInstance(ToolGrouping, tools);
		this._groups.set(sessionId, grouping);
		return grouping;
	}
}
