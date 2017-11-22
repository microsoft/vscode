/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from typescript-sublime-plugin project, obtained from
 * https://github.com/Microsoft/TypeScript-Sublime-Plugin/blob/master/TypeScript%20Indent.tmPreferences
 * ------------------------------------------------------------------------------------------ */

import { env, languages, commands, workspace, window, ExtensionContext, Memento, Diagnostic, Range, Disposable, Uri, MessageItem, DiagnosticSeverity, TextDocument } from 'vscode';

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
import TypeScriptTaskProviderManager from './features/taskProvider';

import * as ProjectStatus from './utils/projectStatus';
import TypingsStatus, { AtaProgressReporter } from './utils/typingsStatus';
import VersionStatus from './utils/versionStatus';
import { getContributedTypeScriptServerPlugins, TypeScriptServerPlugin } from './utils/plugins';
import { openOrCreateConfigFile, isImplicitProjectConfigFile } from './utils/tsconfig';
import { tsLocationToVsPosition } from './utils/convert';
import FormattingConfigurationManager from './features/formattingConfigurationManager';
import * as languageModeIds from './utils/languageModeIds';
import * as languageConfigurations from './utils/languageConfigurations';
import { CommandManager, Command } from './utils/commandManager';
import DiagnosticsManager from './features/diagnostics';

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

class ReloadTypeScriptProjectsCommand implements Command {
	public readonly id = 'typescript.reloadProjects';

	public constructor(
		private readonly lazyClientHost: () => TypeScriptServiceClientHost
	) { }

	public execute() {
		this.lazyClientHost().reloadProjects();
	}
}

class ReloadJavaScriptProjectsCommand implements Command {
	public readonly id = 'javascript.reloadProjects';

	public constructor(
		private readonly lazyClientHost: () => TypeScriptServiceClientHost
	) { }

	public execute() {
		this.lazyClientHost().reloadProjects();
	}
}

class SelectTypeScriptVersionCommand implements Command {
	public readonly id = 'typescript.selectTypeScriptVersion';

	public constructor(
		private readonly lazyClientHost: () => TypeScriptServiceClientHost
	) { }

	public execute() {
		this.lazyClientHost().serviceClient.onVersionStatusClicked();
	}
}

class OpenTsServerLogCommand implements Command {
	public readonly id = 'typescript.openTsServerLog';

	public constructor(
		private readonly lazyClientHost: () => TypeScriptServiceClientHost
	) { }

	public execute() {
		this.lazyClientHost().serviceClient.openTsServerLogFile();
	}
}

class RestartTsServerCommand implements Command {
	public readonly id = 'typescript.restartTsServer';

	public constructor(
		private readonly lazyClientHost: () => TypeScriptServiceClientHost
	) { }

	public execute() {
		this.lazyClientHost().serviceClient.restartTsServer();
	}
}

class TypeScriptGoToProjectConfigCommand implements Command {
	public readonly id = 'typescript.goToProjectConfig';

	public constructor(
		private readonly lazyClientHost: () => TypeScriptServiceClientHost,
	) { }

	public execute() {
		const editor = window.activeTextEditor;
		if (editor) {
			this.lazyClientHost().goToProjectConfig(true, editor.document.uri);
		}
	}
}

class JavaScriptGoToProjectConfigCommand implements Command {
	public readonly id = 'javascript.goToProjectConfig';

	public constructor(
		private readonly lazyClientHost: () => TypeScriptServiceClientHost,
	) { }

	public execute() {
		const editor = window.activeTextEditor;
		if (editor) {
			this.lazyClientHost().goToProjectConfig(false, editor.document.uri);
		}
	}
}

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

	commandManager.register(new ReloadTypeScriptProjectsCommand(lazyClientHost));
	commandManager.register(new ReloadJavaScriptProjectsCommand(lazyClientHost));
	commandManager.register(new SelectTypeScriptVersionCommand(lazyClientHost));
	commandManager.register(new OpenTsServerLogCommand(lazyClientHost));
	commandManager.register(new RestartTsServerCommand(lazyClientHost));
	commandManager.register(new TypeScriptGoToProjectConfigCommand(lazyClientHost));
	commandManager.register(new JavaScriptGoToProjectConfigCommand(lazyClientHost));

	context.subscriptions.push(new TypeScriptTaskProviderManager(() => lazyClientHost().serviceClient));

	context.subscriptions.push(languages.setLanguageConfiguration(languageModeIds.jsxTags, languageConfigurations.jsxTags));

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
	private readonly diagnosticsManager: DiagnosticsManager;
	private readonly bufferSyncSupport: BufferSyncSupport;
	private readonly formattingOptionsManager: FormattingConfigurationManager;

	private readonly toUpdateOnConfigurationChanged: ({ updateConfiguration: () => void })[] = [];

	private _validate: boolean = true;

	private readonly disposables: Disposable[] = [];
	private readonly versionDependentDisposables: Disposable[] = [];

	constructor(
		private readonly client: TypeScriptServiceClient,
		private readonly description: LanguageDescription,
		commandManager: CommandManager,
		typingsStatus: TypingsStatus
	) {
		this.formattingOptionsManager = new FormattingConfigurationManager(client);
		this.bufferSyncSupport = new BufferSyncSupport(client, description.modeIds, {
			delete: (file: string) => {
				this.diagnosticsManager.delete(file);
			}
		}, this._validate);

		this.diagnosticsManager = new DiagnosticsManager(description.id, this.client);

		workspace.onDidChangeConfiguration(this.configurationChanged, this, this.disposables);
		this.configurationChanged();

		client.onReady().then(async () => {
			await this.registerProviders(client, commandManager, typingsStatus);
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

		this.diagnosticsManager.dispose();
		this.bufferSyncSupport.dispose();
		this.formattingOptionsManager.dispose();
	}

	private async registerProviders(
		client: TypeScriptServiceClient,
		commandManager: CommandManager,
		typingsStatus: TypingsStatus
	): Promise<void> {
		const selector = this.description.modeIds;
		const config = workspace.getConfiguration(this.id);

		this.disposables.push(languages.registerCompletionItemProvider(selector,
			new (await import('./features/completionItemProvider')).default(client, typingsStatus, commandManager),
			'.', '"', '\'', '/', '@'));

		this.disposables.push(languages.registerCompletionItemProvider(selector, new (await import('./features/directiveCommentCompletionProvider')).default(client), '@'));

		const { TypeScriptFormattingProvider, FormattingProviderManager } = await import('./features/formattingProvider');
		const formattingProvider = new TypeScriptFormattingProvider(client, this.formattingOptionsManager);
		formattingProvider.updateConfiguration(config);
		this.disposables.push(languages.registerOnTypeFormattingEditProvider(selector, formattingProvider, ';', '}', '\n'));

		const formattingProviderManager = new FormattingProviderManager(this.description.id, formattingProvider, selector);
		formattingProviderManager.updateConfiguration();
		this.disposables.push(formattingProviderManager);
		this.toUpdateOnConfigurationChanged.push(formattingProviderManager);

		this.disposables.push(languages.registerCompletionItemProvider(selector, new (await import('./features/jsDocCompletionProvider')).default(client, commandManager), '*'));
		this.disposables.push(languages.registerHoverProvider(selector, new (await import('./features/hoverProvider')).default(client)));
		this.disposables.push(languages.registerDefinitionProvider(selector, new (await import('./features/definitionProvider')).default(client)));
		this.disposables.push(languages.registerDocumentHighlightProvider(selector, new (await import('./features/documentHighlightProvider')).default(client)));
		this.disposables.push(languages.registerReferenceProvider(selector, new (await import('./features/referenceProvider')).default(client)));
		this.disposables.push(languages.registerDocumentSymbolProvider(selector, new (await import('./features/documentSymbolProvider')).default(client)));
		this.disposables.push(languages.registerSignatureHelpProvider(selector, new (await import('./features/signatureHelpProvider')).default(client), '(', ','));
		this.disposables.push(languages.registerRenameProvider(selector, new (await import('./features/renameProvider')).default(client)));
		this.disposables.push(languages.registerCodeActionsProvider(selector, new (await import('./features/quickFixProvider')).default(client, this.formattingOptionsManager)));
		this.disposables.push(languages.registerCodeActionsProvider(selector, new (await import('./features/refactorProvider')).default(client, this.formattingOptionsManager, commandManager)));
		this.registerVersionDependentProviders();

		const referenceCodeLensProvider = new (await import('./features/referencesCodeLensProvider')).default(client, this.description.id);
		referenceCodeLensProvider.updateConfiguration();
		this.toUpdateOnConfigurationChanged.push(referenceCodeLensProvider);
		this.disposables.push(languages.registerCodeLensProvider(selector, referenceCodeLensProvider));

		const implementationCodeLensProvider = new (await import('./features/implementationsCodeLensProvider')).default(client, this.description.id);
		implementationCodeLensProvider.updateConfiguration();
		this.toUpdateOnConfigurationChanged.push(implementationCodeLensProvider);
		this.disposables.push(languages.registerCodeLensProvider(selector, implementationCodeLensProvider));

		this.disposables.push(languages.registerWorkspaceSymbolProvider(new (await import('./features/workspaceSymbolProvider')).default(client, this.description.modeIds)));

		if (!this.description.isExternal) {
			for (const modeId of this.description.modeIds) {
				this.disposables.push(languages.setLanguageConfiguration(modeId, languageConfigurations.jsTsLanguageConfiguration));
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
		this.diagnosticsManager.validate = value;
		if (value) {
			this.triggerAllDiagnostics();
		}
	}

	public reInitialize(): void {
		this.diagnosticsManager.reInitialize();
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

	public syntaxDiagnosticsReceived(file: Uri, syntaxDiagnostics: Diagnostic[]): void {
		this.diagnosticsManager.syntaxDiagnosticsReceived(file, syntaxDiagnostics);
	}

	public semanticDiagnosticsReceived(file: Uri, semanticDiagnostics: Diagnostic[]): void {
		this.diagnosticsManager.semanticDiagnosticsReceived(file, semanticDiagnostics);
	}

	public configFileDiagnosticsReceived(file: Uri, diagnostics: Diagnostic[]): void {
		this.diagnosticsManager.configFileDiagnosticsReceived(file, diagnostics);
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
	private readonly ataProgressReporter: AtaProgressReporter;
	private readonly typingsStatus: TypingsStatus;
	private readonly client: TypeScriptServiceClient;
	private readonly languages: LanguageProvider[] = [];
	private readonly languagePerId = new Map<string, LanguageProvider>();
	private readonly disposables: Disposable[] = [];
	private readonly versionStatus: VersionStatus;

	constructor(
		descriptions: LanguageDescription[],
		workspaceState: Memento,
		plugins: TypeScriptServerPlugin[],
		private readonly commandManager: CommandManager
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

		this.typingsStatus = new TypingsStatus(this.client);
		this.ataProgressReporter = new AtaProgressReporter(this.client);

		for (const description of descriptions) {
			const manager = new LanguageProvider(this.client, description, this.commandManager, this.typingsStatus);
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
				const manager = new LanguageProvider(this.client, description, this.commandManager, this.typingsStatus);
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

		this.typingsStatus.dispose();
		this.ataProgressReporter.dispose();
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

	private async findLanguage(file: string): Promise<LanguageProvider | undefined> {
		try {
			const doc = await workspace.openTextDocument(this.client.asUrl(file));
			return this.languages.find(language => language.handles(file, doc));
		} catch {
			return undefined;
		}
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
					language.syntaxDiagnosticsReceived(this.client.asUrl(body.file), this.createMarkerDatas(body.diagnostics, language.diagnosticSource));
				}
			});
		}
	}

	/* internal */ semanticDiagnosticsReceived(event: Proto.DiagnosticEvent): void {
		const body = event.body;
		if (body && body.diagnostics) {
			this.findLanguage(body.file).then(language => {
				if (language) {
					language.semanticDiagnosticsReceived(this.client.asUrl(body.file), this.createMarkerDatas(body.diagnostics, language.diagnosticSource));
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
				language.configFileDiagnosticsReceived(this.client.asUrl(body.configFile), []);
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
						language.configFileDiagnosticsReceived(this.client.asUrl(body.configFile), [diagnostic]);
					}
				}, _error => {
					language.configFileDiagnosticsReceived(this.client.asUrl(body.configFile), [new Diagnostic(new Range(0, 0, 0, 0), body.diagnostics[0].text)]);
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