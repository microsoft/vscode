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
import { ITelemetryService, ITelemetryInfo, ITelemetryData } from 'vs/platform/telemetry/common/telemetry';

export const NullTelemetryService = {
	_serviceBrand: undefined,
	publicLog(eventName: string, data?: ITelemetryData) {
		return TPromise.as<void>(null);
	},
	isOptedIn: true,
	getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return TPromise.as({
			instanceId: 'someValue.instanceId',
			sessionId: 'someValue.sessionId',
			machineId: 'someValue.machineId'
		});
	}
};

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

/**
 * Only add settings that cannot contain any personal/private information of users (PII).
 */
const configurationValueWhitelist = [
	'editor.tabCompletion',
	'editor.fontFamily',
	'editor.fontWeight',
	'editor.fontSize',
	'editor.lineHeight',
	'editor.letterSpacing',
	'editor.lineNumbers',
	'editor.rulers',
	'editor.wordSeparators',
	'editor.tabSize',
	'editor.insertSpaces',
	'editor.detectIndentation',
	'editor.roundedSelection',
	'editor.scrollBeyondLastLine',
	'editor.minimap.enabled',
	'editor.minimap.renderCharacters',
	'editor.minimap.maxColumn',
	'editor.find.seedSearchStringFromSelection',
	'editor.find.autoFindInSelection',
	'editor.wordWrap',
	'editor.wordWrapColumn',
	'editor.wrappingIndent',
	'editor.mouseWheelScrollSensitivity',
	'editor.multiCursorModifier',
	'editor.quickSuggestions',
	'editor.quickSuggestionsDelay',
	'editor.parameterHints',
	'editor.autoClosingBrackets',
	'editor.autoIndent',
	'editor.formatOnType',
	'editor.formatOnPaste',
	'editor.suggestOnTriggerCharacters',
	'editor.acceptSuggestionOnEnter',
	'editor.acceptSuggestionOnCommitCharacter',
	'editor.snippetSuggestions',
	'editor.emptySelectionClipboard',
	'editor.wordBasedSuggestions',
	'editor.suggestFontSize',
	'editor.suggestLineHeight',
	'editor.selectionHighlight',
	'editor.occurrencesHighlight',
	'editor.overviewRulerLanes',
	'editor.overviewRulerBorder',
	'editor.cursorBlinking',
	'editor.cursorStyle',
	'editor.mouseWheelZoom',
	'editor.fontLigatures',
	'editor.hideCursorInOverviewRuler',
	'editor.renderWhitespace',
	'editor.renderControlCharacters',
	'editor.renderIndentGuides',
	'editor.renderLineHighlight',
	'editor.codeLens',
	'editor.folding',
	'editor.showFoldingControls',
	'editor.matchBrackets',
	'editor.glyphMargin',
	'editor.useTabStops',
	'editor.trimAutoWhitespace',
	'editor.stablePeek',
	'editor.dragAndDrop',
	'editor.formatOnSave',
	'editor.colorDecorators',

	'window.zoomLevel',
	'files.autoSave',
	'files.hotExit',
	'files.associations',
	'workbench.statusBar.visible',
	'files.trimTrailingWhitespace',
	'git.confirmSync',
	'workbench.sideBar.location',
	'window.openFilesInNewWindow',
	'javascript.validate.enable',
	'window.reopenFolders',
	'window.restoreWindows',
	'extensions.autoUpdate',
	'files.eol',
	'explorer.openEditors.visible',
	'workbench.editor.enablePreview',
	'files.autoSaveDelay',
	'workbench.editor.showTabs',
	'files.encoding',
	'files.autoGuessEncoding',
	'git.enabled',
	'http.proxyStrictSSL',
	'terminal.integrated.fontFamily',
	'workbench.editor.enablePreviewFromQuickOpen',
	'workbench.editor.swipeToNavigate',
	'php.builtInCompletions.enable',
	'php.validate.enable',
	'php.validate.run',
	'workbench.welcome.enabled',
	'workbench.startupEditor',
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
