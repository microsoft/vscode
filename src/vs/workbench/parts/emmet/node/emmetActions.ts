/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference path="emmet.d.ts" />
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ICommonCodeEditor, EditorContextKeys } from 'vs/editor/common/editorCommon';
import { EditorAction, ServicesAccessor } from 'vs/editor/common/editorCommonExtensions';
import { ICommandKeybindingsOptions } from 'vs/editor/common/config/config';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { grammarsExtPoint, ITMSyntaxExtensionPoint } from 'vs/editor/node/textMate/TMGrammars';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EditorAccessor, IGrammarContributions } from 'vs/workbench/parts/emmet/node/editorAccessor';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionService, ExtensionPointContribution } from 'vs/platform/extensions/common/extensions';
import { IMessageService } from 'vs/platform/message/common/message';
import * as emmet from 'emmet';
import * as path from 'path';
import * as pfs from 'vs/base/node/pfs';
import Severity from 'vs/base/common/severity';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

interface IEmmetConfiguration {
	emmet: {
		preferences: any;
		syntaxProfiles: any;
		triggerExpansionOnTab: boolean,
		excludeLanguages: string[],
		extensionsPath: string
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

	public static withConfiguredEmmet(configurationService: IConfigurationService,
		messageService: IMessageService,
		workspaceRoot: string,
		callback: (_emmet: typeof emmet) => void): TPromise<void> {
		LazyEmmet.workspaceRoot = workspaceRoot;
		return LazyEmmet._INSTANCE.withEmmetPreferences(configurationService, messageService, callback);
	}

	private _emmetPromise: TPromise<typeof emmet>;
	private _messageService: IMessageService;

	constructor() {
		this._emmetPromise = null;
	}

	public withEmmetPreferences(configurationService: IConfigurationService,
		messageService: IMessageService,
		callback: (_emmet: typeof emmet) => void): TPromise<void> {
		return this._loadEmmet().then((_emmet: typeof emmet) => {
			this._messageService = messageService;
			this._withEmmetPreferences(configurationService, _emmet, callback);
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

	private updateEmmetPreferences(configurationService: IConfigurationService, _emmet: typeof emmet): TPromise<any> {
		let emmetPreferences = configurationService.getConfiguration<IEmmetConfiguration>().emmet;
		let loadEmmetSettings = () => {
			let syntaxProfiles = { ...LazyEmmet.syntaxProfilesFromFile, ...emmetPreferences.syntaxProfiles };
			let preferences = { ...LazyEmmet.preferencesFromFile, ...emmetPreferences.preferences };
			let snippets = LazyEmmet.snippetsFromFile;

			try {
				_emmet.loadPreferences(preferences);
				_emmet.loadProfiles(syntaxProfiles);
				_emmet.loadSnippets(snippets);
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

	private _withEmmetPreferences(configurationService: IConfigurationService, _emmet: typeof emmet, callback: (_emmet: typeof emmet) => void): void {
		this.updateEmmetPreferences(configurationService, _emmet).then(() => {
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

export abstract class EmmetEditorAction extends EditorAction {

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
		const workspaceRoot = contextService.getWorkspace() ? contextService.getWorkspace().resource.fsPath : '';

		return this._withGrammarContributions(extensionService).then((grammarContributions) => {

			let editorAccessor = new EditorAccessor(
				modeService,
				editor,
				configurationService.getConfiguration<IEmmetConfiguration>().emmet.syntaxProfiles,
				configurationService.getConfiguration<IEmmetConfiguration>().emmet.excludeLanguages,
				grammarContributions
			);

			if (!editorAccessor.isEmmetEnabledMode()) {
				this.noExpansionOccurred(editor);
				return undefined;
			}

			return LazyEmmet.withConfiguredEmmet(configurationService, messageService, workspaceRoot, (_emmet) => {
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

	private emmetActionName: string;

	constructor(id: string, label: string, alias: string, actionName: string, kbOpts?: ICommandKeybindingsOptions) {
		super({
			id: id,
			label: label,
			alias: alias,
			precondition: EditorContextKeys.Writable,
			kbOpts: kbOpts
		});
		this.emmetActionName = actionName;
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
