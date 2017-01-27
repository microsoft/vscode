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
import { IKeybindingService, KeybindingSource } from 'vs/platform/keybinding/common/keybinding';
import { ILifecycleService, ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService, ITelemetryExperiments, ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { StorageService } from 'vs/platform/storage/common/storageService';
import * as objects from 'vs/base/common/objects';

export const defaultExperiments: ITelemetryExperiments = {
	showNewUserWatermark: false,
	openUntitledFile: true,
	enableWelcomePage: true
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

export function loadExperiments(accessor: ServicesAccessor): ITelemetryExperiments {
	const contextService = accessor.get(IWorkspaceContextService);
	const storageService = accessor.get(IStorageService);
	const configurationService = accessor.get(IConfigurationService);

	updateExperimentsOverrides(configurationService);
	configurationService.onDidUpdateConfiguration(e => updateExperimentsOverrides(configurationService));

	let {
		showNewUserWatermark,
		openUntitledFile,
		openGettingStarted,
		enableWelcomePage
	} = splitExperimentsRandomness();

	const newUserDuration = 24 * 60 * 60 * 1000;
	const firstSessionDate = storageService.get('telemetry.firstSessionDate');
	const isNewUser = !firstSessionDate || Date.now() - Date.parse(firstSessionDate) < newUserDuration;
	if (!isNewUser || contextService.hasWorkspace()) {
		showNewUserWatermark = defaultExperiments.showNewUserWatermark;
		openUntitledFile = defaultExperiments.openUntitledFile;
	}

	const isNewSession = !storageService.get('telemetry.lastSessionDate');
	const now = Date.now();
	if (!(isNewSession && now >= beginGettingStartedExp && now < endGettingStartedExp)) {
		openGettingStarted = undefined;
	}

	return applyOverrides({
		showNewUserWatermark,
		openUntitledFile,
		openGettingStarted,
		enableWelcomePage
	});
}

export function isWelcomePageEnabled() {
	const overrides = getExperimentsOverrides();
	return 'enableWelcomePage' in overrides ? overrides.enableWelcomePage : splitExperimentsRandomness().enableWelcomePage;
}

function applyOverrides(experiments: ITelemetryExperiments): ITelemetryExperiments {
	const experimentsConfig = getExperimentsOverrides();
	Object.keys(experiments).forEach(key => {
		if (key in experimentsConfig) {
			experiments[key] = experimentsConfig[key];
		}
	});
	return experiments;
}

function splitExperimentsRandomness(): ITelemetryExperiments {
	const random1 = getExperimentsRandomness();
	const [random2, showNewUserWatermark] = splitRandom(random1);
	const [random3, openUntitledFile] = splitRandom(random2);
	const [random4, openGettingStarted] = splitRandom(random3);
	const [, enableWelcomePage] = splitRandom(random4);
	return {
		showNewUserWatermark,
		openUntitledFile,
		openGettingStarted,
		enableWelcomePage
	};
}

function getExperimentsRandomness() {
	const key = StorageService.GLOBAL_PREFIX + 'experiments.randomness';
	let valueString = window.localStorage.getItem(key);
	if (!valueString) {
		valueString = Math.random().toString();
		window.localStorage.setItem(key, valueString);
	}

	return parseFloat(valueString);
}

function splitRandom(random: number): [number, boolean] {
	const scaled = random * 2;
	const i = Math.floor(scaled);
	return [scaled - i, i === 1];
}

const experimentsOverridesKey = StorageService.GLOBAL_PREFIX + 'experiments.overrides';

function getExperimentsOverrides(): ITelemetryExperiments {
	const valueString = window.localStorage.getItem(experimentsOverridesKey);
	return valueString ? JSON.parse(valueString) : <any>{};
}

function updateExperimentsOverrides(configurationService: IConfigurationService) {
	const storageOverrides = getExperimentsOverrides();
	const config: any = configurationService.getConfiguration('telemetry');
	const configOverrides = config && config.experiments || {};
	if (!objects.equals(storageOverrides, configOverrides)) {
		window.localStorage.setItem(experimentsOverridesKey, JSON.stringify(configOverrides));
	}
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
	'editor.formatOnPaste',
	'window.openFilesInNewWindow',
	'javascript.validate.enable',
	'editor.mouseWheelZoom',
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
	'editor.acceptSuggestionOnCommitCharacter',
	'workbench.editor.showTabs',
	'files.encoding',
	'editor.quickSuggestionsDelay',
	'editor.snippetSuggestions',
	'editor.selectionHighlight',
	'editor.glyphMargin',
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
	'php.builtInCompletions.enable',
	'php.validate.enable',
	'php.validate.run',
	'editor.parameterHints',
	'workbench.welcome.enabled',
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
