/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference path="emmet.d.ts" />
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { EditorAction, ServicesAccessor, IActionOptions, ICommandKeybindingsOptions } from 'vs/editor/common/editorCommonExtensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { grammarsExtPoint, ITMSyntaxExtensionPoint } from 'vs/workbench/services/textMate/electron-browser/TMGrammars';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EditorAccessor, IGrammarContributions } from 'vs/workbench/parts/emmet/electron-browser/editorAccessor';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionService, ExtensionPointContribution } from 'vs/platform/extensions/common/extensions';
import { IMessageService } from 'vs/platform/message/common/message';
import * as emmet from 'emmet';
import * as path from 'path';
import * as pfs from 'vs/base/node/pfs';
import Severity from 'vs/base/common/severity';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ICommandService } from 'vs/platform/commands/common/commands';

interface IEmmetConfiguration {
	emmet: {
		preferences: any;
		syntaxProfiles: any;
		triggerExpansionOnTab: boolean,
		excludeLanguages: string[],
		extensionsPath: string,
		useNewEmmet: boolean
	};
}

interface ModeScopeMap {
	[key: string]: string;
}

class GrammarContributions implements IGrammarContributions {

	private static _grammars: ModeScopeMap = null;

	constructor(contributions: ExtensionPointContribution<ITMSyntaxExtensionPoint[]>[]) {
		if (GrammarContributions._grammars === null) {
			this.fillModeScopeMap(contributions);
		}
	}

	private fillModeScopeMap(contributions: ExtensionPointContribution<ITMSyntaxExtensionPoint[]>[]) {
		GrammarContributions._grammars = {};
		contributions.forEach((contribution) => {
			contribution.value.forEach((grammar) => {
				if (grammar.language && grammar.scopeName) {
					GrammarContributions._grammars[grammar.language] = grammar.scopeName;
				}
			});
		});
	}

	public getGrammar(mode): string {
		return GrammarContributions._grammars[mode];
	}
}

class LazyEmmet {

	private static _INSTANCE = new LazyEmmet();
	private static extensionsPath = '';
	private static snippetsFromFile = {};
	private static syntaxProfilesFromFile = {};
	private static preferencesFromFile = {};
	private static workspaceRoot = '';
	private static emmetSupportedModes: string[];

	public static withConfiguredEmmet(configurationService: IConfigurationService,
		messageService: IMessageService,
		telemetryService: ITelemetryService,
		emmetSupportedModes: string[],
		workspaceRoot: string,
		callback: (_emmet: typeof emmet) => void): TPromise<void> {
		LazyEmmet.workspaceRoot = workspaceRoot;
		LazyEmmet.emmetSupportedModes = emmetSupportedModes;
		return LazyEmmet._INSTANCE.withEmmetPreferences(configurationService, messageService, telemetryService, callback);
	}

	private _emmetPromise: TPromise<typeof emmet>;
	private _messageService: IMessageService;

	constructor() {
		this._emmetPromise = null;
	}

	public withEmmetPreferences(configurationService: IConfigurationService,
		messageService: IMessageService,
		telemetryService: ITelemetryService,
		callback: (_emmet: typeof emmet) => void): TPromise<void> {
		return this._loadEmmet().then((_emmet: typeof emmet) => {
			this._messageService = messageService;
			this._withEmmetPreferences(configurationService, telemetryService, _emmet, callback);
		}, (e) => {
			callback(null);
		});
	}

	private _loadEmmet(): TPromise<typeof emmet> {
		if (!this._emmetPromise) {
			this._emmetPromise = new TPromise<typeof emmet>((c, e) => {
				require(['emmet'], c, e);
			});
		}
		return this._emmetPromise;
	}

	private updateEmmetPreferences(configurationService: IConfigurationService,
		telemetryService: ITelemetryService,
		_emmet: typeof emmet): TPromise<any> {
		let emmetPreferences = configurationService.getConfiguration<IEmmetConfiguration>().emmet;
		let loadEmmetSettings = () => {
			let syntaxProfiles = { ...LazyEmmet.syntaxProfilesFromFile, ...emmetPreferences.syntaxProfiles };
			let preferences = { ...LazyEmmet.preferencesFromFile, ...emmetPreferences.preferences };
			let snippets = LazyEmmet.snippetsFromFile;
			let mappedModes = [];
			let outputProfileFromSettings = false;
			for (let key in emmetPreferences.syntaxProfiles) {
				if (LazyEmmet.emmetSupportedModes.indexOf(key) === -1) {
					mappedModes.push(key);
				} else {
					outputProfileFromSettings = true;
				}
			}

			try {
				_emmet.loadPreferences(preferences);
				_emmet.loadProfiles(syntaxProfiles);
				_emmet.loadSnippets(snippets);

				let emmetCustomizationTelemetry = {
					emmetPreferencesFromFile: Object.keys(LazyEmmet.preferencesFromFile).length > 0,
					emmetSyntaxProfilesFromFile: Object.keys(LazyEmmet.syntaxProfilesFromFile).length > 0,
					emmetSnippetsFromFile: Object.keys(LazyEmmet.snippetsFromFile).length > 0,
					emmetPreferencesFromSettings: Object.keys(emmetPreferences.preferences).length > 0,
					emmetSyntaxProfilesFromSettings: outputProfileFromSettings,
					emmetMappedModes: mappedModes
				};
				telemetryService.publicLog('emmetCustomizations', emmetCustomizationTelemetry);
			} catch (err) {
				// ignore
			}
		};

		// Whether loading the files was a success or not, we load emmet with what we have
		return this.updateFromExtensionsPath(emmetPreferences.extensionsPath).then(loadEmmetSettings, (err) => {
			// Errors from all the promises used to fetch/read dir/files would bubble up here
			console.log(err);
			loadEmmetSettings();
		});
	}

	private updateFromExtensionsPath(extPath: string): TPromise<any> {
		if (extPath !== LazyEmmet.extensionsPath) {
			LazyEmmet.extensionsPath = extPath;
			LazyEmmet.snippetsFromFile = {};
			LazyEmmet.preferencesFromFile = {};
			LazyEmmet.syntaxProfilesFromFile = {};

			if (extPath && extPath.trim()) {
				let dirPath = path.isAbsolute(extPath) ? extPath : path.join(LazyEmmet.workspaceRoot, extPath);
				let snippetsPath = path.join(dirPath, 'snippets.json');
				let syntaxProfilesPath = path.join(dirPath, 'syntaxProfiles.json');
				let preferencesPath = path.join(dirPath, 'preferences.json');
				return pfs.dirExists(dirPath).then(exists => {
					if (exists) {
						let snippetsPromise = this.getEmmetCustomization(snippetsPath).then(value => LazyEmmet.snippetsFromFile = value);
						let profilesPromise = this.getEmmetCustomization(syntaxProfilesPath).then(value => LazyEmmet.syntaxProfilesFromFile = value);
						let preferencesPromise = this.getEmmetCustomization(preferencesPath).then(value => LazyEmmet.preferencesFromFile = value);

						return TPromise.join([snippetsPromise, profilesPromise, preferencesPromise]);
					}
					this._messageService.show(Severity.Error, `The path set in emmet.extensionsPath "${LazyEmmet.extensionsPath}" does not exist.`);
					return undefined;
				});
			}
		}
		return TPromise.as(void 0);
	}

	private getEmmetCustomization(filePath: string): TPromise<any> {
		return pfs.fileExists(filePath).then(fileExists => {
			if (fileExists) {
				return pfs.readFile(filePath).then(buff => {
					let parsedData = {};
					try {
						parsedData = JSON.parse(buff.toString());
					} catch (err) {
						this._messageService.show(Severity.Error, `Error while parsing "${filePath}": ${err}`);
					}
					return parsedData;
				});
			}
			return {};
		});
	}

	private _withEmmetPreferences(configurationService: IConfigurationService,
		telemetryService: ITelemetryService,
		_emmet: typeof emmet,
		callback: (_emmet: typeof emmet) => void): void {
		this.updateEmmetPreferences(configurationService, telemetryService, _emmet).then(() => {
			try {
				callback(_emmet);
			} finally {
				_emmet.resetUserData();
			}
		});
	}
}

export class EmmetActionContext {
	editor: ICommonCodeEditor;
	emmet: typeof emmet;
	editorAccessor: EditorAccessor;

	constructor(editor: ICommonCodeEditor, _emmet: typeof emmet, editorAccessor: EditorAccessor) {
		this.editor = editor;
		this.emmet = _emmet;
		this.editorAccessor = editorAccessor;
	}
}

export interface IEmmetActionOptions extends IActionOptions {
	actionName: string;
}

export abstract class EmmetEditorAction extends EditorAction {

	private actionMap = {
		'editor.emmet.action.removeTag': 'emmet.removeTag',
		'editor.emmet.action.updateTag': 'emmet.updateTag',
		'editor.emmet.action.matchingPair': 'emmet.matchTag',
		'editor.emmet.action.wrapWithAbbreviation': 'emmet.wrapWithAbbreviation',
		'editor.emmet.action.expandAbbreviation': 'emmet.expandAbbreviation',
		'editor.emmet.action.balanceInward': 'emmet.balanceIn',
		'editor.emmet.action.balanceOutward': 'emmet.balanceOut',
		'editor.emmet.action.previousEditPoint': 'emmet.prevEditPoint',
		'editor.emmet.action.nextEditPoint': 'emmet.nextEditPoint',
		'editor.emmet.action.mergeLines': 'emmet.mergeLines',
		'editor.emmet.action.selectPreviousItem': 'emmet.selectPrevItem',
		'editor.emmet.action.selectNextItem': 'emmet.selectNextItem',
		'editor.emmet.action.splitJoinTag': 'emmet.splitJoinTag',
		'editor.emmet.action.toggleComment': 'emmet.toggleComment',
		'editor.emmet.action.evaluateMath': 'emmet.evaluateMathExpression',
		'editor.emmet.action.incrementNumberByOneTenth': 'emmet.incrementNumberByOneTenth',
		'editor.emmet.action.incrementNumberByOne': 'emmet.incrementNumberByOne',
		'editor.emmet.action.incrementNumberByTen': 'emmet.incrementNumberByTen',
		'editor.emmet.action.decrementNumberByOneTenth': 'emmet.decrementNumberByOneTenth',
		'editor.emmet.action.decrementNumberByOne': 'emmet.decrementNumberByOne',
		'editor.emmet.action.decrementNumberByTen': 'emmet.decrementNumberByTen'
	};

	protected emmetActionName: string;

	constructor(opts: IEmmetActionOptions) {
		super(opts);
		this.emmetActionName = opts.actionName;
	}

	abstract runEmmetAction(accessor: ServicesAccessor, ctx: EmmetActionContext);

	protected noExpansionOccurred(editor: ICommonCodeEditor) {
		// default do nothing
	}

	private _lastGrammarContributions: TPromise<GrammarContributions> = null;
	private _lastExtensionService: IExtensionService = null;
	private _withGrammarContributions(extensionService: IExtensionService): TPromise<GrammarContributions> {
		if (this._lastExtensionService !== extensionService) {
			this._lastExtensionService = extensionService;
			this._lastGrammarContributions = extensionService.readExtensionPointContributions(grammarsExtPoint).then((contributions) => {
				return new GrammarContributions(contributions);
			});
		}
		return this._lastGrammarContributions;
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const instantiationService = accessor.get(IInstantiationService);
		const extensionService = accessor.get(IExtensionService);
		const modeService = accessor.get(IModeService);
		const messageService = accessor.get(IMessageService);
		const contextService = accessor.get(IWorkspaceContextService);
		const workspaceRoot = contextService.hasWorkspace() ? contextService.getLegacyWorkspace().resource.fsPath : ''; // TODO@Ramya (https://github.com/Microsoft/vscode/issues/29244)
		const telemetryService = accessor.get(ITelemetryService);
		const commandService = accessor.get(ICommandService);

		let mappedCommand = configurationService.getConfiguration<IEmmetConfiguration>().emmet.useNewEmmet ? this.actionMap[this.id] : undefined;
		if (mappedCommand && mappedCommand !== 'emmet.expandAbbreviation' && mappedCommand !== 'emmet.wrapWithAbbreviation') {
			return commandService.executeCommand<void>(mappedCommand);
		}

		return this._withGrammarContributions(extensionService).then((grammarContributions) => {

			let editorAccessor = new EditorAccessor(
				modeService,
				editor,
				configurationService.getConfiguration<IEmmetConfiguration>().emmet.syntaxProfiles,
				configurationService.getConfiguration<IEmmetConfiguration>().emmet.excludeLanguages,
				grammarContributions,
				this.emmetActionName
			);

			if (mappedCommand === 'emmet.expandAbbreviation' || mappedCommand === 'emmet.wrapWithAbbreviation') {
				return commandService.executeCommand<void>(mappedCommand, editorAccessor.getLanguage());
			}

			if (!editorAccessor.isEmmetEnabledMode()) {
				this.noExpansionOccurred(editor);
				return undefined;
			}

			return LazyEmmet.withConfiguredEmmet(configurationService, messageService, telemetryService, editorAccessor.getEmmetSupportedModes(), workspaceRoot, (_emmet) => {
				if (!_emmet) {
					this.noExpansionOccurred(editor);
					return undefined;
				}
				editorAccessor.onBeforeEmmetAction();
				instantiationService.invokeFunction((accessor) => {
					this.runEmmetAction(accessor, new EmmetActionContext(editor, _emmet, editorAccessor));
				});
				editorAccessor.onAfterEmmetAction();
			});
		});

	}
}

export class BasicEmmetEditorAction extends EmmetEditorAction {

	constructor(id: string, label: string, alias: string, actionName: string, kbOpts?: ICommandKeybindingsOptions) {
		super({
			id,
			label,
			alias,
			precondition: EditorContextKeys.writable,
			kbOpts,
			actionName
		});
	}

	public runEmmetAction(accessor: ServicesAccessor, ctx: EmmetActionContext) {
		const telemetryService = accessor.get(ITelemetryService);
		try {
			if (!ctx.emmet.run(this.emmetActionName, ctx.editorAccessor)) {
				this.noExpansionOccurred(ctx.editor);
			} else if (this.emmetActionName === 'expand_abbreviation') {
				telemetryService.publicLog('emmetActionSucceeded', { action: this.emmetActionName });
			}
		} catch (err) {
			this.noExpansionOccurred(ctx.editor);
		}

	}
}
