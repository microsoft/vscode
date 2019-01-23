/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { guessMimeTypes } from 'vs/base/common/mime';
import * as paths from 'vs/base/common/paths';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService, ConfigurationTarget, ConfigurationTargetToString } from 'vs/platform/configuration/common/configuration';
import { IKeybindingService, KeybindingSource } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService, ITelemetryInfo, ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { ILogService } from 'vs/platform/log/common/log';

export const NullTelemetryService = new class implements ITelemetryService {
	_serviceBrand: undefined;
	publicLog(eventName: string, data?: ITelemetryData) {
		return Promise.resolve(undefined);
	}
	isOptedIn: true;
	getTelemetryInfo(): Promise<ITelemetryInfo> {
		return Promise.resolve({
			instanceId: 'someValue.instanceId',
			sessionId: 'someValue.sessionId',
			machineId: 'someValue.machineId'
		});
	}
};

export interface ITelemetryAppender {
	log(eventName: string, data: any): void;
	dispose(): Promise<any> | undefined;
}

export function combinedAppender(...appenders: ITelemetryAppender[]): ITelemetryAppender {
	return {
		log: (e, d) => appenders.forEach(a => a.log(e, d)),
		dispose: () => Promise.all(appenders.map(a => a.dispose()))
	};
}

export const NullAppender: ITelemetryAppender = { log: () => null, dispose: () => Promise.resolve(null) };


export class LogAppender implements ITelemetryAppender {

	private commonPropertiesRegex = /^sessionID$|^version$|^timestamp$|^commitHash$|^common\./;
	constructor(@ILogService private readonly _logService: ILogService) { }

	dispose(): Promise<any> {
		return Promise.resolve(undefined);
	}

	log(eventName: string, data: any): void {
		const strippedData = {};
		Object.keys(data).forEach(key => {
			if (!this.commonPropertiesRegex.test(key)) {
				strippedData[key] = data[key];
			}
		});
		this._logService.trace(`telemetry/${eventName}`, strippedData);
	}
}

/* __GDPR__FRAGMENT__
	"URIDescriptor" : {
		"mimeType" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"scheme": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"ext": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"path": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	}
*/
export interface URIDescriptor {
	mimeType?: string;
	scheme?: string;
	ext?: string;
	path?: string;
}

export function telemetryURIDescriptor(uri: URI, hashPath: (path: string) => string): URIDescriptor {
	const fsPath = uri && uri.fsPath;
	return fsPath ? { mimeType: guessMimeTypes(fsPath).join(', '), scheme: uri.scheme, ext: paths.extname(fsPath), path: hashPath(fsPath) } : {};
}

/**
 * Only add settings that cannot contain any personal/private information of users (PII).
 */
const configurationValueWhitelist = [
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
	'editor.minimap.side',
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
	'editor.parameterHints.enabled',
	'editor.parameterHints.cycle',
	'editor.autoClosingBrackets',
	'editor.autoClosingQuotes',
	'editor.autoSurround',
	'editor.autoIndent',
	'editor.formatOnType',
	'editor.formatOnPaste',
	'editor.suggestOnTriggerCharacters',
	'editor.acceptSuggestionOnEnter',
	'editor.acceptSuggestionOnCommitCharacter',
	'editor.snippetSuggestions',
	'editor.emptySelectionClipboard',
	'editor.wordBasedSuggestions',
	'editor.suggestSelection',
	'editor.suggestFontSize',
	'editor.suggestLineHeight',
	'editor.tabCompletion',
	'editor.selectionHighlight',
	'editor.occurrencesHighlight',
	'editor.overviewRulerLanes',
	'editor.overviewRulerBorder',
	'editor.cursorBlinking',
	'editor.cursorSmoothCaretAnimation',
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

	'breadcrumbs.enabled',
	'breadcrumbs.filePath',
	'breadcrumbs.symbolPath',
	'breadcrumbs.symbolSortOrder',
	'breadcrumbs.useQuickPick',
	'explorer.openEditors.visible',
	'extensions.autoUpdate',
	'files.associations',
	'files.autoGuessEncoding',
	'files.autoSave',
	'files.autoSaveDelay',
	'files.encoding',
	'files.eol',
	'files.hotExit',
	'files.trimTrailingWhitespace',
	'git.confirmSync',
	'git.enabled',
	'http.proxyStrictSSL',
	'javascript.validate.enable',
	'php.builtInCompletions.enable',
	'php.validate.enable',
	'php.validate.run',
	'terminal.integrated.fontFamily',
	'window.openFilesInNewWindow',
	'window.restoreWindows',
	'window.zoomLevel',
	'workbench.editor.enablePreview',
	'workbench.editor.enablePreviewFromQuickOpen',
	'workbench.editor.showTabs',
	'workbench.editor.highlightModifiedTabs',
	'workbench.editor.swipeToNavigate',
	'workbench.sideBar.location',
	'workbench.startupEditor',
	'workbench.statusBar.visible',
	'workbench.welcome.enabled',
];

export function configurationTelemetry(telemetryService: ITelemetryService, configurationService: IConfigurationService): IDisposable {
	return configurationService.onDidChangeConfiguration(event => {
		if (event.source !== ConfigurationTarget.DEFAULT) {
			/* __GDPR__
				"updateConfiguration" : {
					"configurationSource" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"configurationKeys": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			telemetryService.publicLog('updateConfiguration', {
				configurationSource: ConfigurationTargetToString(event.source),
				configurationKeys: flattenKeys(event.sourceConfig)
			});
			/* __GDPR__
				"updateConfigurationValues" : {
					"configurationSource" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"configurationValues": { "classification": "CustomerContent", "purpose": "FeatureInsight" }
				}
			*/
			telemetryService.publicLog('updateConfigurationValues', {
				configurationSource: ConfigurationTargetToString(event.source),
				configurationValues: flattenValues(event.sourceConfig, configurationValueWhitelist)
			});
		}
	});
}

export function keybindingsTelemetry(telemetryService: ITelemetryService, keybindingService: IKeybindingService): IDisposable {
	return keybindingService.onDidUpdateKeybindings(event => {
		if (event.source === KeybindingSource.User && event.keybindings) {
			/* __GDPR__
				"updateKeybindings" : {
					"bindings": { "classification": "CustomerContent", "purpose": "FeatureInsight" }
				}
			*/
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
	}, <{ [key: string]: any }[]>[]);
}
