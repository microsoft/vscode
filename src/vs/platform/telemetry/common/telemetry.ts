/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { guessMimeTypes } from 'vs/base/common/mime';
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import { ConfigurationSource, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

export const ITelemetryService = createDecorator<ITelemetryService>('telemetryService');

export interface ITelemetryInfo {
	sessionId: string;
	machineId: string;
	instanceId: string;
}

export interface ITelemetryExperiments {
	showNewUserWatermark: boolean;
	openUntitledFile: boolean;
}

export interface ITelemetryService {

	_serviceBrand: any;

	/**
	 * Sends a telemetry event that has been privacy approved.
	 * Do not call this unless you have been given approval.
	 */
	publicLog(eventName: string, data?: any): TPromise<void>;

	getTelemetryInfo(): TPromise<ITelemetryInfo>;

	isOptedIn: boolean;

	getExperiments(): ITelemetryExperiments;
}

export const defaultExperiments: ITelemetryExperiments = {
	showNewUserWatermark: false,
	openUntitledFile: true
};

export const NullTelemetryService = {
	_serviceBrand: undefined,
	_experiments: defaultExperiments,
	publicLog(eventName: string, data?: any) {
		return TPromise.as<void>(null);
	},
	isOptedIn: true,
	getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return TPromise.as({
			instanceId: 'someValue.instanceId',
			sessionId: 'someValue.sessionId',
			machineId: 'someValue.machineId'
		});
	},
	getExperiments(): ITelemetryExperiments {
		return this._experiments;
	}
};

export function loadExperiments(contextService: IWorkspaceContextService, storageService: IStorageService, configurationService: IConfigurationService): ITelemetryExperiments {

	const key = 'experiments.randomness';
	let valueString = storageService.get(key);
	if (!valueString) {
		valueString = Math.random().toString();
		storageService.store(key, valueString);
	}

	const random1 = parseFloat(valueString);
	let [random2, showNewUserWatermark] = splitRandom(random1);
	let [, openUntitledFile] = splitRandom(random2);

	const newUserDuration = 24 * 60 * 60 * 1000;
	const firstSessionDate = storageService.get('telemetry.firstSessionDate');
	const isNewUser = !firstSessionDate || Date.now() - Date.parse(firstSessionDate) < newUserDuration;
	if (!isNewUser || !!contextService.getWorkspace()) {
		showNewUserWatermark = defaultExperiments.showNewUserWatermark;
		openUntitledFile = defaultExperiments.openUntitledFile;
	}

	return applyOverrides(configurationService, {
		showNewUserWatermark,
		openUntitledFile
	});
}

export function applyOverrides(configurationService: IConfigurationService, experiments: ITelemetryExperiments): ITelemetryExperiments {
	const config: any = configurationService.getConfiguration('telemetry');
	const experimentsConfig = config && config.experiments || {};
	Object.keys(experiments).forEach(key => {
		if (key in experimentsConfig) {
			experiments[key] = experimentsConfig[key];
		}
	});
	return experiments;
}

function splitRandom(random: number): [number, boolean] {
	const scaled = random * 2;
	const i = Math.floor(scaled);
	return [scaled - i, i === 1];
}

export interface ITelemetryAppender {
	log(eventName: string, data: any): void;
}

export function combinedAppender(...appenders: ITelemetryAppender[]): ITelemetryAppender {
	return { log: (e, d) => appenders.forEach(a => a.log(e, d)) };
}

export const NullAppender: ITelemetryAppender = { log: () => null };

// --- util

export function anonymize(input: string): string {
	if (!input) {
		return input;
	}

	let r = '';
	for (let i = 0; i < input.length; i++) {
		let ch = input[i];
		if (ch >= '0' && ch <= '9') {
			r += '0';
			continue;
		}
		if (ch >= 'a' && ch <= 'z') {
			r += 'a';
			continue;
		}
		if (ch >= 'A' && ch <= 'Z') {
			r += 'A';
			continue;
		}
		r += ch;
	}
	return r;
}

export interface URIDescriptor {
	mimeType?: string;
	ext?: string;
	path?: string;
}

export function telemetryURIDescriptor(uri: URI): URIDescriptor {
	const fsPath = uri && uri.fsPath;
	return fsPath ? { mimeType: guessMimeTypes(fsPath).join(', '), ext: paths.extname(fsPath), path: anonymize(fsPath) } : {};
}

export function configurationTelemetry(telemetryService: ITelemetryService, configurationService: IConfigurationService): IDisposable {
	return configurationService.onDidUpdateConfiguration(event => {
		if (event.source !== ConfigurationSource.Default) {
			telemetryService.publicLog('updateConfiguration', {
				configurationSource: ConfigurationSource[event.source],
				configurationKeys: flattenKeys(event.sourceConfig)
			});
		}
	});
}

function flattenKeys(value: Object): string[] {
	if (!value) {
		return [];
	}
	const result: string[] = [];
	flatKeys(result, '', value);
	return result;
}

function flatKeys(result: string[], prefix: string, value: Object): void {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		Object.keys(value)
			.forEach(key => flatKeys(result, prefix ? `${prefix}.${key}` : key, value[key]));
	} else {
		result.push(prefix);
	}
}