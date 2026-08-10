/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { env } from 'vscode';
import { getGitHubRepoInfoFromContext, GithubRepoId, IGitService } from '../../../platform/git/common/gitService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IExtensionContribution } from '../../common/contributions';

export class GithubTelemetryForwardingContrib extends Disposable implements IExtensionContribution {
	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IGitService private readonly _gitService: IGitService,
	) {
		super();

		const channel = env.getDataChannel<IEditTelemetryData>('editTelemetry');
		this._register(channel.onDidReceiveData((args) => {
			const r = this._gitService.activeRepository.get();
			const id = r ? getGitHubRepoInfoFromContext(r)?.id : undefined;
			const data = translateToGithubProperties(args.data.data, id);
			const { properties, measurements } = dataToPropsAndMeasurements(data);
			this._telemetryService.sendGHTelemetryEvent('vscode.' + args.data.eventName, properties, measurements);
		}));
	}
}

function translateToGithubProperties(data: Record<string, unknown>, githubRepo: GithubRepoId | undefined): Record<string, unknown> {
	if (githubRepo) {
		data['githubOrg'] = githubRepo.org;
		data['githubRepo'] = githubRepo.repo;
	}
	return data;
}

function dataToPropsAndMeasurements(data: Record<string, unknown>): { properties: Record<string, string | ITrustedTelemetryValue<string>>; measurements: Record<string, number> } {
	const properties: Record<string, string | ITrustedTelemetryValue<string>> = {};
	const measurements: Record<string, number> = {};
	for (const [key, value] of Object.entries(data)) {
		if (typeof value === 'number') {
			measurements[key] = value;
		} else if (typeof value === 'boolean') {
			measurements[key] = value ? 1 : 0;
		} else {
			properties[key] = value as string | ITrustedTelemetryValue<string>;
		}
	}
	return { properties, measurements };
}

interface ITrustedTelemetryValue<T extends string | number | boolean = string | number | boolean> {
	value: T;
	isTrustedTelemetryValue: boolean;
}

interface IEditTelemetryData {
	eventName: string;
	data: Record<string, unknown>;
}
