/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from typescript-sublime-plugin project, obtained from
 * https://github.com/Microsoft/TypeScript-Sublime-Plugin/blob/master/TypeScript%20Indent.tmPreferences
 * ------------------------------------------------------------------------------------------ */

import { env, languages, commands, workspace, window, ExtensionContext, Memento, IndentAction, Diagnostic, DiagnosticCollection, Range, Disposable, Uri, MessageItem, DiagnosticSeverity, TextDocument } from 'vscode';

// This must be the first statement otherwise modules might got loaded with
// the wrong locale.
import * as nls from 'vscode-nls';
nls.config({ locale: env.language });
const localize = nls.loadMessageBundle();

import { basename } from 'path';

import * as Proto from './protocol';
import * as PConst from './protocol.const';

import TypeScriptServiceClient from './typescriptServiceClient';
import { ITypeScriptServiceClientHost } from './typescriptService';

import BufferSyncSupport from './features/bufferSyncSupport';
import { JsDocCompletionProvider, TryCompleteJsDocCommand } from './features/jsDocCompletionProvider';
import TypeScriptTaskProviderManager from './features/taskProvider';

import * as ProjectStatus from './utils/projectStatus';
import TypingsStatus, { AtaProgressReporter } from './utils/typingsStatus';
import VersionStatus from './utils/versionStatus';
import { getContributedTypeScriptServerPlugins, TypeScriptServerPlugin } from './utils/plugins';
import { openOrCreateConfigFile, isImplicitProjectConfigFile } from './utils/tsconfig';
import { tsLocationToVsPosition } from './utils/convert';
import FormattingConfigurationManager from './features/formattingConfigurationManager';
import * as languageModeIds from './utils/languageModeIds';
import { CommandManager } from './utils/commandManager';

interface LanguageDescription {
	id: string;
	diagnosticSource: string;
	modeIds: string[];
	configFile?: string;
	isExternal?: boolean;
}

const standardLanguageDescriptions: LanguageDescription[] = [
	{
		id: 'typescript',
		diagnosticSource: 'ts',
		modeIds: [languageModeIds.typescript, languageModeIds.typescriptreact],
		configFile: 'tsconfig.json'
	}, {
		id: 'javascript',
		diagnosticSource: 'js',
		modeIds: [languageModeIds.javascript, languageModeIds.javascriptreact],
		configFile: 'jsconfig.json'
	}
];

export function activate(context: ExtensionContext): void {
	const plugins = getContributedTypeScriptServerPlugins();

	const commandManager = new CommandManager();
	context.subscriptions.push(commandManager);

	const lazyClientHost = (() => {
		let clientHost: TypeScriptServiceClientHost | undefined;
		return () => {
			if (!clientHost) {
				clientHost = new TypeScriptServiceClientHost(standardLanguageDescriptions, context.workspaceState, plugins, commandManager);
				context.subscriptions.push(clientHost);

				const host = clientHost;
				clientHost.serviceClient.onReady().then(() => {
					context.subscriptions.push(ProjectStatus.create(host.serviceClient, host.serviceClient.telemetryReporter,
						path => new Promise<boolean>(resolve => setTimeout(() => resolve(host.handles(path)), 750)),
						context.workspaceState));
				}, () => {
					// Nothing to do here. The client did show a message;
				});
			}
			return clientHost;
		};
	})();


	commandManager.registerCommand('typescript.reloadProjects', () => {
		lazyClientHost().reloadProjects();
	});

	commandManager.registerCommand('javascript.reloadProjects', () => {
		lazyClientHost().reloadProjects();
	});

	commandManager.registerCommand('typescript.selectTypeScriptVersion', () => {
		lazyClientHost().serviceClient.onVersionStatusClicked();
	});

	commandManager.registerCommand('typescript.openTsServerLog', () => {
		lazyClientHost().serviceClient.openTsServerLogFile();
	});

	commandManager.registerCommand('typescript.restartTsServer', () => {
		lazyClientHost().serviceClient.restartTsServer();
	});

	context.subscriptions.push(new TypeScriptTaskProviderManager(() => lazyClientHost().serviceClient));

	const goToProjectConfig = (isTypeScript: boolean) => {
		const editor = window.activeTextEditor;
		if (editor) {
			lazyClientHost().goToProjectConfig(isTypeScript, editor.document.uri);
		}
	};
	commandManager.registerCommand('typescript.goToProjectConfig', goToProjectConfig.bind(null, true));
	commandManager.registerCommand('javascript.goToProjectConfig', goToProjectConfig.bind(null, false));

	const jsDocCompletionCommand = new TryCompleteJsDocCommand(() => lazyClientHost().serviceClient);
	commandManager.registerCommand(TryCompleteJsDocCommand.COMMAND_NAME, jsDocCompletionCommand.tryCompleteJsDoc, jsDocCompletionCommand);


	const EMPTY_ELEMENTS: string[] = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'];

	context.subscriptions.push(languages.setLanguageConfiguration('jsx-tags', {
		wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,
		onEnterRules: [
			{
				beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))([_:\\w][_:\\w-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
				afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
				action: { indentAction: IndentAction.IndentOutdent }
			},
			{
				beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
				action: { indentAction: IndentAction.Indent }
			}
		],
	}));

	const supportedLanguage = [].concat.apply([], standardLanguageDescriptions.map(x => x.modeIds).concat(plugins.map(x => x.languages)));
	function didOpenTextDocument(textDocument: TextDocument): boolean {
		if (supportedLanguage.indexOf(textDocument.languageId) >= 0) {
			openListener.dispose();
			// Force activation
			void lazyClientHost();
			return true;
		}
		return false;
	}
	const openListener = workspace.onDidOpenTextDocument(didOpenTextDocument);
	for (let textDocument of workspace.textDocuments) {
		if (didOpenTextDocument(textDocument)) {
			break;
		}
	}
}


const validateSetting = 'validate.enable';

class LanguageProvider {

	private syntaxDiagnostics: ObjectMap<Diagnostic[]>;
	private semanticDiagnostics: ObjectMap<Diagnostic[]>;

	private readonly currentDiagnostics: DiagnosticCollection;
	private readonly bufferSyncSupport: BufferSyncSupport;
	private readonly formattingOptionsManager: FormattingConfigurationManager;

	private readonly typingsStatus: TypingsStatus;
	private readonly ataProgressReporter: AtaProgressReporter;
	private toUpdateOnConfigurationChanged: ({ updateConfiguration: () => void })[] = [];

	private _validate: boolean = true;

	private readonly disposables: Disposable[] = [];

	private versionDependentDisposables: Disposable[] = [];

	constructor(
		private readonly client: TypeScriptServiceClient,
		private readonly description: LanguageDescription,
		private readonly commandManager: CommandManager
	) {
		this.formattingOptionsManager = new FormattingConfigurationManager(client);
		this.bufferSyncSupport = new BufferSyncSupport(client, description.modeIds, {
			delete: (file: string) => {
				this.currentDiagnostics.delete(client.asUrl(file));
			}
		}, this._validate);
		this.syntaxDiagnostics = Object.create(null);
		this.semanticDiagnostics = Object.create(null);
		this.currentDiagnostics = languages.createDiagnosticCollection(description.id);

		this.typingsStatus = new TypingsStatus(client);
		this.ataProgressReporter = new AtaProgressReporter(client);

		workspace.onDidChangeConfiguration(this.configurationChanged, this, this.disposables);
		this.configurationChanged();

		client.onReady().then(async () => {
			await this.registerProviders(client);
			this.bufferSyncSupport.listen();
		}, () => {
			// Nothing to do here. The client did show a message;
		});
	}

	public dispose(): void {
		while (this.disposables.length) {
			const obj = this.disposables.pop();
			if (obj) {
				obj.dispose();
			}
		}

		while (this.versionDependentDisposables.length) {
			const obj = this.versionDependentDisposables.pop();
			if (obj) {
				obj.dispose();
			}
		}

		this.typingsStatus.dispose();
		this.ataProgressReporter.dispose();
		this.currentDiagnostics.dispose();
		this.bufferSyncSupport.dispose();
	}

	private async registerProviders(client: TypeScriptServiceClient): Promise<void> {
		const selector = this.description.modeIds;
		const config = workspace.getConfiguration(this.id);

		const completionItemProvider = new (await import('./features/completionItemProvider')).default(client, this.description.id, this.typingsStatus, this.commandManager);
		this.disposables.push(languages.registerCompletionItemProvider(selector, completionItemProvider, '.', '"', '\'', '/', '@'));

		this.disposables.push(languages.registerCompletionItemProvider(selector, new (await import('./features/directiveCommentCompletionProvider')).default(client), '@'));

		const { TypeScriptFormattingProvider, FormattingProviderManager } = await import('./features/formattingProvider');
		const formattingProvider = new TypeScriptFormattingProvider(client, this.formattingOptionsManager);
		formattingProvider.updateConfiguration(config);
		this.disposables.push(languages.registerOnTypeFormattingEditProvider(selector, formattingProvider, ';', '}', '\n'));

		const formattingProviderManager = new FormattingProviderManager(this.description.id, formattingProvider, selector);
		formattingProviderManager.updateConfiguration();
		this.disposables.push(formattingProviderManager);
		this.toUpdateOnConfigurationChanged.push(formattingProviderManager);

		this.disposables.push(languages.registerCompletionItemProvider(selector, new JsDocCompletionProvider(client), '*'));
		this.disposables.push(languages.registerHoverProvider(selector, new (await import('./features/hoverProvider')).default(client)));
		this.disposables.push(languages.registerDefinitionProvider(selector, new (await import('./features/definitionProvider')).default(client)));
		this.disposables.push(languages.registerDocumentHighlightProvider(selector, new (await import('./features/documentHighlightProvider')).default(client)));
		this.disposables.push(languages.registerReferenceProvider(selector, new (await import('./features/referenceProvider')).default(client)));
		this.disposables.push(languages.registerDocumentSymbolProvider(selector, new (await import('./features/documentSymbolProvider')).default(client)));
		this.disposables.push(languages.registerSignatureHelpProvider(selector, new (await import('./features/signatureHelpProvider')).default(client), '(', ','));
		this.disposables.push(languages.registerRenameProvider(selector, new (await import('./features/renameProvider')).default(client)));
		this.disposables.push(languages.registerCodeActionsProvider(selector, new (await import('./features/codeActionProvider')).default(client, this.formattingOptionsManager, this.description.id, this.commandManager)));
		this.disposables.push(languages.registerCodeActionsProvider(selector, new (await import('./features/refactorProvider')).default(client, this.formattingOptionsManager, this.description.id, this.commandManager)));
		this.registerVersionDependentProviders();

		for (const modeId of this.description.modeIds) {
			this.disposables.push(languages.registerWorkspaceSymbolProvider(new (await import('./features/workspaceSymbolProvider')).default(client, modeId)));

			const referenceCodeLensProvider = new (await import('./features/referencesCodeLensProvider')).default(client, modeId);
			referenceCodeLensProvider.updateConfiguration();
			this.toUpdateOnConfigurationChanged.push(referenceCodeLensProvider);
			this.disposables.push(languages.registerCodeLensProvider(selector, referenceCodeLensProvider));

			const implementationCodeLensProvider = new (await import('./features/implementationsCodeLensProvider')).default(client, modeId);
			implementationCodeLensProvider.updateConfiguration();
			this.toUpdateOnConfigurationChanged.push(implementationCodeLensProvider);
			this.disposables.push(languages.registerCodeLensProvider(selector, implementationCodeLensProvider));

			if (!this.description.isExternal) {
				this.disposables.push(languages.setLanguageConfiguration(modeId, {
					indentationRules: {
						// ^(.*\*/)?\s*\}.*$
						decreaseIndentPattern: /^((?!.*?\/\*).*\*\/)?\s*[\}\]\)].*$/,
						// ^.*\{[^}"']*$
						increaseIndentPattern: /^((?!\/\/).)*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/
					},
					wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
					onEnterRules: [
						{
							// e.g. /** | */
							beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
							afterText: /^\s*\*\/$/,
							action: { indentAction: IndentAction.IndentOutdent, appendText: ' * ' }
						}, {
							// e.g. /** ...|
							beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
							action: { indentAction: IndentAction.None, appendText: ' * ' }
						}, {
							// e.g.  * ...|
							beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
							action: { indentAction: IndentAction.None, appendText: '* ' }
						}, {
							// e.g.  */|
							beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
							action: { indentAction: IndentAction.None, removeText: 1 }
						},
						{
							// e.g.  *-----*/|
							beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
							action: { indentAction: IndentAction.None, removeText: 1 }
						}
					]
				}));
			}
		}
	}

	private configurationChanged(): void {
		const config = workspace.getConfiguration(this.id);
		this.updateValidate(config.get(validateSetting, true));

		for (const toUpdate of this.toUpdateOnConfigurationChanged) {
			toUpdate.updateConfiguration();
		}
	}

	public handles(file: string, doc: TextDocument): boolean {
		if (doc && this.description.modeIds.indexOf(doc.languageId) >= 0) {
			return true;
		}

		if (this.bufferSyncSupport.handles(file)) {
			return true;
		}

		const base = basename(file);
		return !!base && base === this.description.configFile;
	}

	public get id(): string {
		return this.description.id;
	}

	public get diagnosticSource(): string {
		return this.description.diagnosticSource;
	}

	private updateValidate(value: boolean) {
		if (this._validate === value) {
			return;
		}
		this._validate = value;
		this.bufferSyncSupport.validate = value;
		if (value) {
			this.triggerAllDiagnostics();
		} else {
			this.syntaxDiagnostics = Object.create(null);
			this.semanticDiagnostics = Object.create(null);
			this.currentDiagnostics.clear();
		}
	}

	public reInitialize(): void {
		this.currentDiagnostics.clear();
		this.syntaxDiagnostics = Object.create(null);
		this.semanticDiagnostics = Object.create(null);
		this.bufferSyncSupport.reOpenDocuments();
		this.bufferSyncSupport.requestAllDiagnostics();
		this.formattingOptionsManager.reset();
		this.registerVersionDependentProviders();
	}

	private async registerVersionDependentProviders(): Promise<void> {
		while (this.versionDependentDisposables.length) {
			const obj = this.versionDependentDisposables.pop();
			if (obj) {
				obj.dispose();
			}
		}

		this.versionDependentDisposables = [];
		if (!this.client) {
			return;
		}

		const selector = this.description.modeIds;
		if (this.client.apiVersion.has220Features()) {
			this.versionDependentDisposables.push(languages.registerImplementationProvider(selector, new (await import('./features/implementationProvider')).default(this.client)));
		}

		if (this.client.apiVersion.has213Features()) {
			this.versionDependentDisposables.push(languages.registerTypeDefinitionProvider(selector, new (await import('./features/typeDefinitionProvider')).default(this.client)));
		}
	}

	public triggerAllDiagnostics(): void {
		this.bufferSyncSupport.requestAllDiagnostics();
	}

	public syntaxDiagnosticsReceived(file: string, syntaxDiagnostics: Diagnostic[]): void {
		if (!this._validate) {
			return;
		}
		this.syntaxDiagnostics[file] = syntaxDiagnostics;
		const semanticDianostics = this.semanticDiagnostics[file] || [];
		this.currentDiagnostics.set(this.client.asUrl(file), semanticDianostics.concat(syntaxDiagnostics));
	}

	public semanticDiagnosticsReceived(file: string, semanticDiagnostics: Diagnostic[]): void {
		if (!this._validate) {
			return;
		}
		this.semanticDiagnostics[file] = semanticDiagnostics;
		const syntaxDiagnostics = this.syntaxDiagnostics[file] || [];
		this.currentDiagnostics.set(this.client.asUrl(file), semanticDiagnostics.concat(syntaxDiagnostics));
	}

	public configFileDiagnosticsReceived(file: string, diagnostics: Diagnostic[]): void {
		this.currentDiagnostics.set(this.client.asUrl(file), diagnostics);
	}
}

// Style check diagnostics that can be reported as warnings
const styleCheckDiagnostics = [
	6133, 	// variable is declared but never used
	6138, 	// property is declared but its value is never read
	7027,	// unreachable code detected
	7028,	// unused label
	7029,	// fall through case in switch
	7030	// not all code paths return a value
];

class TypeScriptServiceClientHost implements ITypeScriptServiceClientHost {
	private client: TypeScriptServiceClient;
	private languages: LanguageProvider[] = [];
	private languagePerId: Map<string, LanguageProvider>;
	private readonly disposables: Disposable[] = [];
	private readonly versionStatus: VersionStatus;

	constructor(
		descriptions: LanguageDescription[],
		workspaceState: Memento,
		plugins: TypeScriptServerPlugin[],
		private commandManager: CommandManager
	) {
		const handleProjectCreateOrDelete = () => {
			this.client.execute('reloadProjects', null, false);
			this.triggerAllDiagnostics();
		};
		const handleProjectChange = () => {
			setTimeout(() => {
				this.triggerAllDiagnostics();
			}, 1500);
		};
		const configFileWatcher = workspace.createFileSystemWatcher('**/[tj]sconfig.json');
		this.disposables.push(configFileWatcher);
		configFileWatcher.onDidCreate(handleProjectCreateOrDelete, this, this.disposables);
		configFileWatcher.onDidDelete(handleProjectCreateOrDelete, this, this.disposables);
		configFileWatcher.onDidChange(handleProjectChange, this, this.disposables);

		this.versionStatus = new VersionStatus();
		this.disposables.push(this.versionStatus);

		this.client = new TypeScriptServiceClient(this, workspaceState, this.versionStatus, plugins);
		this.disposables.push(this.client);

		this.languagePerId = new Map();
		for (const description of descriptions) {
			const manager = new LanguageProvider(this.client, description, this.commandManager);
			this.languages.push(manager);
			this.disposables.push(manager);
			this.languagePerId.set(description.id, manager);
		}

		this.client.onReady().then(() => {
			if (!this.client.apiVersion.has230Features()) {
				return;
			}

			const languages = new Set<string>();
			for (const plugin of plugins) {
				for (const language of plugin.languages) {
					languages.add(language);
				}
			}
			if (languages.size) {
				const description: LanguageDescription = {
					id: 'typescript-plugins',
					modeIds: Array.from(languages.values()),
					diagnosticSource: 'ts-plugins',
					isExternal: true
				};
				const manager = new LanguageProvider(this.client, description, this.commandManager);
				this.languages.push(manager);
				this.disposables.push(manager);
				this.languagePerId.set(description.id, manager);
			}
		});

		this.client.onTsServerStarted(() => {
			this.triggerAllDiagnostics();
		});
	}

	public dispose(): void {
		while (this.disposables.length) {
			const obj = this.disposables.pop();
			if (obj) {
				obj.dispose();
			}
		}
	}

	public get serviceClient(): TypeScriptServiceClient {
		return this.client;
	}

	public reloadProjects(): void {
		this.client.execute('reloadProjects', null, false);
		this.triggerAllDiagnostics();
	}

	public handles(file: string): boolean {
		return !!this.findLanguage(file);
	}

	public async goToProjectConfig(
		isTypeScriptProject: boolean,
		resource: Uri
	): Promise<void> {
		const rootPath = this.client.getWorkspaceRootForResource(resource);
		if (!rootPath) {
			window.showInformationMessage(
				localize(
					'typescript.projectConfigNoWorkspace',
					'Please open a folder in VS Code to use a TypeScript or JavaScript project'));
			return;
		}

		const file = this.client.normalizePath(resource);
		// TSServer errors when 'projectInfo' is invoked on a non js/ts file
		if (!file || !this.handles(file)) {
			window.showWarningMessage(
				localize(
					'typescript.projectConfigUnsupportedFile',
					'Could not determine TypeScript or JavaScript project. Unsupported file type'));
			return;
		}

		let res: protocol.ProjectInfoResponse | undefined = undefined;
		try {
			res = await this.client.execute('projectInfo', { file, needFileNameList: false } as protocol.ProjectInfoRequestArgs);
		} catch {
			// noop
		}
		if (!res || !res.body) {
			window.showWarningMessage(localize('typescript.projectConfigCouldNotGetInfo', 'Could not determine TypeScript or JavaScript project'));
			return;
		}

		const { configFileName } = res.body;
		if (configFileName && !isImplicitProjectConfigFile(configFileName)) {
			const doc = await workspace.openTextDocument(configFileName);
			window.showTextDocument(doc, window.activeTextEditor ? window.activeTextEditor.viewColumn : undefined);
			return;
		}

		enum ProjectConfigAction {
			None,
			CreateConfig,
			LearnMore
		}

		interface ProjectConfigMessageItem extends MessageItem {
			id: ProjectConfigAction;
		}

		const selected = await window.showInformationMessage<ProjectConfigMessageItem>(
			(isTypeScriptProject
				? localize('typescript.noTypeScriptProjectConfig', 'File is not part of a TypeScript project')
				: localize('typescript.noJavaScriptProjectConfig', 'File is not part of a JavaScript project')
			), {
				title: isTypeScriptProject
					? localize('typescript.configureTsconfigQuickPick', 'Configure tsconfig.json')
					: localize('typescript.configureJsconfigQuickPick', 'Configure jsconfig.json'),
				id: ProjectConfigAction.CreateConfig
			}, {
				title: localize('typescript.projectConfigLearnMore', 'Learn More'),
				id: ProjectConfigAction.LearnMore
			});

		switch (selected && selected.id) {
			case ProjectConfigAction.CreateConfig:
				openOrCreateConfigFile(isTypeScriptProject, rootPath, this.client.configuration);
				return;

			case ProjectConfigAction.LearnMore:
				if (isTypeScriptProject) {
					commands.executeCommand('vscode.open', Uri.parse('https://go.microsoft.com/fwlink/?linkid=841896'));
				} else {
					commands.executeCommand('vscode.open', Uri.parse('https://go.microsoft.com/fwlink/?linkid=759670'));
				}
				return;
		}
	}

	private findLanguage(file: string): Thenable<LanguageProvider | null> {
		return workspace.openTextDocument(this.client.asUrl(file)).then((doc: TextDocument) => {
			for (const language of this.languages) {
				if (language.handles(file, doc)) {
					return language;
				}
			}
			return null;
		}, () => null);
	}

	private triggerAllDiagnostics() {
		for (const language of this.languagePerId.values()) {
			language.triggerAllDiagnostics();
		}
	}

	/* internal */ populateService(): void {
		// See https://github.com/Microsoft/TypeScript/issues/5530
		workspace.saveAll(false).then(() => {
			for (const language of this.languagePerId.values()) {
				language.reInitialize();
			}
		});
	}

	/* internal */ syntaxDiagnosticsReceived(event: Proto.DiagnosticEvent): void {
		const body = event.body;
		if (body && body.diagnostics) {
			this.findLanguage(body.file).then(language => {
				if (language) {
					language.syntaxDiagnosticsReceived(body.file, this.createMarkerDatas(body.diagnostics, language.diagnosticSource));
				}
			});
		}
	}

	/* internal */ semanticDiagnosticsReceived(event: Proto.DiagnosticEvent): void {
		const body = event.body;
		if (body && body.diagnostics) {
			this.findLanguage(body.file).then(language => {
				if (language) {
					language.semanticDiagnosticsReceived(body.file, this.createMarkerDatas(body.diagnostics, language.diagnosticSource));
				}
			});
		}
	}

	/* internal */ configFileDiagnosticsReceived(event: Proto.ConfigFileDiagnosticEvent): void {
		// See https://github.com/Microsoft/TypeScript/issues/10384
		const body = event.body;
		if (!body || !body.diagnostics || !body.configFile) {
			return;
		}

		(this.findLanguage(body.configFile)).then(language => {
			if (!language) {
				return;
			}
			if (body.diagnostics.length === 0) {
				language.configFileDiagnosticsReceived(body.configFile, []);
			} else if (body.diagnostics.length >= 1) {
				workspace.openTextDocument(Uri.file(body.configFile)).then((document) => {
					let curly: [number, number, number] | undefined = undefined;
					let nonCurly: [number, number, number] | undefined = undefined;
					let diagnostic: Diagnostic;
					for (let index = 0; index < document.lineCount; index++) {
						const line = document.lineAt(index);
						const text = line.text;
						const firstNonWhitespaceCharacterIndex = line.firstNonWhitespaceCharacterIndex;
						if (firstNonWhitespaceCharacterIndex < text.length) {
							if (text.charAt(firstNonWhitespaceCharacterIndex) === '{') {
								curly = [index, firstNonWhitespaceCharacterIndex, firstNonWhitespaceCharacterIndex + 1];
								break;
							} else {
								const matches = /\s*([^\s]*)(?:\s*|$)/.exec(text.substr(firstNonWhitespaceCharacterIndex));
								if (matches && matches.length >= 1) {
									nonCurly = [index, firstNonWhitespaceCharacterIndex, firstNonWhitespaceCharacterIndex + matches[1].length];
								}
							}
						}
					}
					const match = curly || nonCurly;
					if (match) {
						diagnostic = new Diagnostic(new Range(match[0], match[1], match[0], match[2]), body.diagnostics[0].text);
					} else {
						diagnostic = new Diagnostic(new Range(0, 0, 0, 0), body.diagnostics[0].text);
					}
					if (diagnostic) {
						diagnostic.source = language.diagnosticSource;
						language.configFileDiagnosticsReceived(body.configFile, [diagnostic]);
					}
				}, _error => {
					language.configFileDiagnosticsReceived(body.configFile, [new Diagnostic(new Range(0, 0, 0, 0), body.diagnostics[0].text)]);
				});
			}
		});
	}

	private createMarkerDatas(diagnostics: Proto.Diagnostic[], source: string): Diagnostic[] {
		const result: Diagnostic[] = [];
		for (let diagnostic of diagnostics) {
			const { start, end, text } = diagnostic;
			const range = new Range(tsLocationToVsPosition(start), tsLocationToVsPosition(end));
			const converted = new Diagnostic(range, text);
			converted.severity = this.getDiagnosticSeverity(diagnostic);
			converted.source = diagnostic.source || source;
			if (diagnostic.code) {
				converted.code = diagnostic.code;
			}
			result.push(converted);
		}
		return result;
	}

	private getDiagnosticSeverity(diagnostic: Proto.Diagnostic): DiagnosticSeverity {

		if (this.reportStyleCheckAsWarnings() && this.isStyleCheckDiagnostic(diagnostic.code)) {
			return DiagnosticSeverity.Warning;
		}

		switch (diagnostic.category) {
			case PConst.DiagnosticCategory.error:
				return DiagnosticSeverity.Error;

			case PConst.DiagnosticCategory.warning:
				return DiagnosticSeverity.Warning;

			default:
				return DiagnosticSeverity.Error;
		}
	}

	private isStyleCheckDiagnostic(code: number | undefined): boolean {
		return code ? styleCheckDiagnostics.indexOf(code) !== -1 : false;
	}

	private reportStyleCheckAsWarnings() {
		const config = workspace.getConfiguration('typescript');
		return config.get('reportStyleChecksAsWarnings', true);
	}
}