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
import { IKeybindingService, KeybindingSource } from 'vs/platform/keybinding/common/keybinding';
import { ILifecycleService, ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';
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
	openGettingStarted?: boolean;
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

const beginGettingStartedExp = Date.UTC(2017, 0, 9);
const endGettingStartedExp = Date.UTC(2017, 0, 16);

export function loadExperiments(contextService: IWorkspaceContextService, storageService: IStorageService, configurationService: IConfigurationService): ITelemetryExperiments {

	const key = 'experiments.randomness';
	let valueString = storageService.get(key);
	if (!valueString) {
		valueString = Math.random().toString();
		storageService.store(key, valueString);
	}

	const random1 = parseFloat(valueString);
	let [random2, showNewUserWatermark] = splitRandom(random1);
	let [random3, openUntitledFile] = splitRandom(random2);
	let [, openGettingStarted] = splitRandom(random3);

	const newUserDuration = 24 * 60 * 60 * 1000;
	const firstSessionDate = storageService.get('telemetry.firstSessionDate');
	const isNewUser = !firstSessionDate || Date.now() - Date.parse(firstSessionDate) < newUserDuration;
	if (!isNewUser || !!contextService.getWorkspace()) {
		showNewUserWatermark = defaultExperiments.showNewUserWatermark;
		openUntitledFile = defaultExperiments.openUntitledFile;
	}

	const isNewSession = !storageService.get('telemetry.lastSessionDate');
	const now = Date.now();
	if (!(isNewSession && now >= beginGettingStartedExp && now < endGettingStartedExp)) {
		openGettingStarted = undefined;
	}

	return applyOverrides(configurationService, {
		showNewUserWatermark,
		openUntitledFile,
		openGettingStarted
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

const configurationValueWhitelist = [
	'window.zoomLevel',
	'editor.fontSize',
	'editor.fontFamily',
	'editor.tabSize',
	'files.autoSave',
	'files.hotExit',
	'typescript.check.tscVersion',
	'editor.renderWhitespace',
	'editor.cursorBlinking',
	'editor.cursorStyle',
	'files.associations',
	'workbench.statusBar.visible',
	'editor.wrappingColumn',
	'editor.insertSpaces',
	'editor.renderIndentGuides',
	'files.trimTrailingWhitespace',
	'git.confirmSync',
	'editor.rulers',
	'workbench.sideBar.location',
	'editor.fontLigatures',
	'editor.wordWrap',
	'editor.lineHeight',
	'editor.detectIndentation',
	'editor.formatOnType',
	'editor.formatOnSave',
	'window.openFilesInNewWindow',
	'javascript.validate.enable',
	'editor.mouseWheelZoom',
	'typescript.check.workspaceVersion',
	'editor.fontWeight',
	'editor.scrollBeyondLastLine',
	'editor.lineNumbers',
	'editor.wrappingIndent',
	'editor.renderControlCharacters',
	'editor.autoClosingBrackets',
	'window.reopenFolders',
	'extensions.autoUpdate',
	'editor.tabCompletion',
	'files.eol',
	'explorer.openEditors.visible',
	'workbench.editor.enablePreview',
	'files.autoSaveDelay',
	'editor.roundedSelection',
	'editor.quickSuggestions',
	'editor.acceptSuggestionOnEnter',
	'workbench.editor.showTabs',
	'files.encoding',
	'editor.quickSuggestionsDelay',
	'editor.snippetSuggestions',
	'editor.selectionHighlight',
	'editor.glyphMargin',
	'php.validate.run',
	'editor.wordSeparators',
	'editor.mouseWheelScrollSensitivity',
	'editor.suggestOnTriggerCharacters',
	'git.enabled',
	'http.proxyStrictSSL',
	'terminal.integrated.fontFamily',
	'editor.overviewRulerLanes',
	'editor.wordBasedSuggestions',
	'editor.hideCursorInOverviewRuler',
	'editor.trimAutoWhitespace',
	'editor.folding',
	'workbench.editor.enablePreviewFromQuickOpen',
	'php.validate.enable',
	'editor.parameterHints',
];

export function configurationTelemetry(telemetryService: ITelemetryService, configurationService: IConfigurationService): IDisposable {
	return configurationService.onDidUpdateConfiguration(event => {
		if (event.source !== ConfigurationSource.Default) {
			telemetryService.publicLog('updateConfiguration', {
				configurationSource: ConfigurationSource[event.source],
				configurationKeys: flattenKeys(event.sourceConfig)
			});
			telemetryService.publicLog('updateConfigurationValues', {
				configurationSource: ConfigurationSource[event.source],
				configurationValues: flattenValues(event.sourceConfig, configurationValueWhitelist)
			});
		}
	});
}

export function lifecycleTelemetry(telemetryService: ITelemetryService, lifecycleService: ILifecycleService): IDisposable {
	return lifecycleService.onShutdown(event => {
		telemetryService.publicLog('shutdown', { reason: ShutdownReason[event] });
	});
}

export function keybindingsTelemetry(telemetryService: ITelemetryService, keybindingService: IKeybindingService): IDisposable {
	return keybindingService.onDidUpdateKeybindings(event => {
		if (event.source === KeybindingSource.User && event.keybindings) {
			telemetryService.publicLog('updateKeybindings', {
				bindings: event.keybindings.map(binding => ({
					key: binding.key,
					command: binding.command,
					when: binding.when,
					args: binding.args ? true : undefined
				}))
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

function flattenValues(value: Object, keys: string[]): { [key: string]: any }[] {
	if (!value) {
		return [];
	}

	return keys.reduce((array, key) => {
		const v = key.split('.')
			.reduce((tmp, k) => tmp && typeof tmp === 'object' ? tmp[k] : undefined, value);
		if (typeof v !== 'undefined') {
			array.push({ [key]: v });
		}
		return array;
	}, []);
}