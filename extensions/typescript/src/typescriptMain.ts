/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from typescript-sublime-plugin project, obtained from
 * https://github.com/Microsoft/TypeScript-Sublime-Plugin/blob/master/TypeScript%20Indent.tmPreferences
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { env, languages, commands, workspace, window, ExtensionContext, Memento, IndentAction, Diagnostic, DiagnosticCollection, Range, Disposable, Uri, MessageItem, TextEditor, DiagnosticSeverity, TextDocument, SnippetString } from 'vscode';

// This must be the first statement otherwise modules might got loaded with
// the wrong locale.
import * as nls from 'vscode-nls';
nls.config({ locale: env.language });
const localize = nls.loadMessageBundle();

import * as path from 'path';

import * as Proto from './protocol';
import * as PConst from './protocol.const';

import TypeScriptServiceClient from './typescriptServiceClient';
import { ITypescriptServiceClientHost } from './typescriptService';

import HoverProvider from './features/hoverProvider';
import DefinitionProvider from './features/definitionProvider';
import ImplementationProvider from './features/implementationProvider';
import TypeDefintionProvider from './features/typeDefinitionProvider';
import DocumentHighlightProvider from './features/documentHighlightProvider';
import ReferenceProvider from './features/referenceProvider';
import DocumentSymbolProvider from './features/documentSymbolProvider';
import SignatureHelpProvider from './features/signatureHelpProvider';
import RenameProvider from './features/renameProvider';
import FormattingProvider from './features/formattingProvider';
import BufferSyncSupport from './features/bufferSyncSupport';
import CompletionItemProvider from './features/completionItemProvider';
import WorkspaceSymbolProvider from './features/workspaceSymbolProvider';
import CodeActionProvider from './features/codeActionProvider';
import ReferenceCodeLensProvider from './features/referencesCodeLensProvider';
import { JsDocCompletionProvider, TryCompleteJsDocCommand } from './features/jsDocCompletionProvider';
import { DirectiveCommentCompletionProvider } from './features/directiveCommentCompletionProvider';

import ImplementationCodeLensProvider from './features/implementationsCodeLensProvider';

import * as BuildStatus from './utils/buildStatus';
import * as ProjectStatus from './utils/projectStatus';
import TypingsStatus, { AtaProgressReporter } from './utils/typingsStatus';
import * as VersionStatus from './utils/versionStatus';
import { getContributedTypeScriptServerPlugins, TypeScriptServerPlugin } from "./utils/plugins";

interface LanguageDescription {
	id: string;
	diagnosticSource: string;
	modeIds: string[];
	configFile?: string;
}

enum ProjectConfigAction {
	None,
	CreateConfig,
	LearnMore
}

interface ProjectConfigMessageItem extends MessageItem {
	id: ProjectConfigAction;
}


export function activate(context: ExtensionContext): void {
	const MODE_ID_TS = 'typescript';
	const MODE_ID_TSX = 'typescriptreact';
	const MODE_ID_JS = 'javascript';
	const MODE_ID_JSX = 'javascriptreact';

	const plugins = getContributedTypeScriptServerPlugins();
	const clientHost = new TypeScriptServiceClientHost([
		{
			id: 'typescript',
			diagnosticSource: 'ts',
			modeIds: [MODE_ID_TS, MODE_ID_TSX],
			configFile: 'tsconfig.json'
		},
		{
			id: 'javascript',
			diagnosticSource: 'js',
			modeIds: [MODE_ID_JS, MODE_ID_JSX],
			configFile: 'jsconfig.json'
		}
	], context.storagePath, context.globalState, context.workspaceState, plugins);
	context.subscriptions.push(clientHost);

	const client = clientHost.serviceClient;

	context.subscriptions.push(commands.registerCommand('typescript.reloadProjects', () => {
		clientHost.reloadProjects();
	}));

	context.subscriptions.push(commands.registerCommand('javascript.reloadProjects', () => {
		clientHost.reloadProjects();
	}));

	context.subscriptions.push(commands.registerCommand('typescript.selectTypeScriptVersion', () => {
		client.onVersionStatusClicked();
	}));

	context.subscriptions.push(commands.registerCommand('typescript.openTsServerLog', () => {
		client.openTsServerLogFile();
	}));

	const goToProjectConfig = (isTypeScript: boolean) => {
		const editor = window.activeTextEditor;
		if (editor) {
			clientHost.goToProjectConfig(isTypeScript, editor.document.uri);
		}
	};
	context.subscriptions.push(commands.registerCommand('typescript.goToProjectConfig', goToProjectConfig.bind(null, true)));
	context.subscriptions.push(commands.registerCommand('javascript.goToProjectConfig', goToProjectConfig.bind(null, false)));

	const jsDocCompletionCommand = new TryCompleteJsDocCommand(client);
	context.subscriptions.push(commands.registerCommand(TryCompleteJsDocCommand.COMMAND_NAME, jsDocCompletionCommand.tryCompleteJsDoc, jsDocCompletionCommand));

	window.onDidChangeActiveTextEditor(VersionStatus.showHideStatus, null, context.subscriptions);
	client.onReady().then(() => {
		context.subscriptions.push(ProjectStatus.create(client,
			path => new Promise<boolean>(resolve => setTimeout(() => resolve(clientHost.handles(path)), 750)),
			context.workspaceState));
	}, () => {
		// Nothing to do here. The client did show a message;
	});
	BuildStatus.update({ queueLength: 0 });
}


const validateSetting = 'validate.enable';

class LanguageProvider {
	private syntaxDiagnostics: ObjectMap<Diagnostic[]>;
	private readonly currentDiagnostics: DiagnosticCollection;
	private readonly bufferSyncSupport: BufferSyncSupport;

	private formattingProvider: FormattingProvider;
	private formattingProviderRegistration: Disposable | null;
	private typingsStatus: TypingsStatus;
	private toUpdateOnConfigurationChanged: ({ updateConfiguration: () => void })[] = [];

	private _validate: boolean = true;

	private readonly disposables: Disposable[] = [];

	private versionDependentDisposables: Disposable[] = [];

	constructor(
		private readonly client: TypeScriptServiceClient,
		private readonly description: LanguageDescription
	) {
		this.bufferSyncSupport = new BufferSyncSupport(client, description.modeIds, {
			delete: (file: string) => {
				this.currentDiagnostics.delete(client.asUrl(file));
			}
		});
		this.syntaxDiagnostics = Object.create(null);
		this.currentDiagnostics = languages.createDiagnosticCollection(description.id);

		this.typingsStatus = new TypingsStatus(client);
		new AtaProgressReporter(client);

		workspace.onDidChangeConfiguration(this.configurationChanged, this, this.disposables);
		this.configurationChanged();

		client.onReady().then(() => {
			this.registerProviders(client);
			this.bufferSyncSupport.listen();
		}, () => {
			// Nothing to do here. The client did show a message;
		});
	}

	public dispose(): void {
		if (this.formattingProviderRegistration) {
			this.formattingProviderRegistration.dispose();
		}

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
		this.currentDiagnostics.dispose();
		this.bufferSyncSupport.dispose();
	}

	private registerProviders(client: TypeScriptServiceClient): void {
		const selector = this.description.modeIds;
		const config = workspace.getConfiguration(this.id);

		const completionItemProvider = new CompletionItemProvider(client, this.typingsStatus);
		completionItemProvider.updateConfiguration();
		this.toUpdateOnConfigurationChanged.push(completionItemProvider);
		this.disposables.push(languages.registerCompletionItemProvider(selector, completionItemProvider, '.'));

		this.disposables.push(languages.registerCompletionItemProvider(selector, new DirectiveCommentCompletionProvider(client), '@'));

		this.formattingProvider = new FormattingProvider(client);
		this.formattingProvider.updateConfiguration(config);
		this.disposables.push(languages.registerOnTypeFormattingEditProvider(selector, this.formattingProvider, ';', '}', '\n'));
		if (this.formattingProvider.isEnabled()) {
			this.formattingProviderRegistration = languages.registerDocumentRangeFormattingEditProvider(selector, this.formattingProvider);
		}

		const jsDocCompletionProvider = new JsDocCompletionProvider(client);
		jsDocCompletionProvider.updateConfiguration();
		this.disposables.push(languages.registerCompletionItemProvider(selector, jsDocCompletionProvider, '*'));

		this.disposables.push(languages.registerHoverProvider(selector, new HoverProvider(client)));
		this.disposables.push(languages.registerDefinitionProvider(selector, new DefinitionProvider(client)));
		this.disposables.push(languages.registerDocumentHighlightProvider(selector, new DocumentHighlightProvider(client)));
		this.disposables.push(languages.registerReferenceProvider(selector, new ReferenceProvider(client)));
		this.disposables.push(languages.registerDocumentSymbolProvider(selector, new DocumentSymbolProvider(client)));
		this.disposables.push(languages.registerSignatureHelpProvider(selector, new SignatureHelpProvider(client), '(', ','));
		this.disposables.push(languages.registerRenameProvider(selector, new RenameProvider(client)));

		this.disposables.push(languages.registerCodeActionsProvider(selector, new CodeActionProvider(client, this.description.id)));

		this.registerVersionDependentProviders();

		this.description.modeIds.forEach(modeId => {
			this.disposables.push(languages.registerWorkspaceSymbolProvider(new WorkspaceSymbolProvider(client, modeId)));

			const referenceCodeLensProvider = new ReferenceCodeLensProvider(client, modeId);
			referenceCodeLensProvider.updateConfiguration();
			this.toUpdateOnConfigurationChanged.push(referenceCodeLensProvider);
			this.disposables.push(languages.registerCodeLensProvider(selector, referenceCodeLensProvider));

			const implementationCodeLensProvider = new ImplementationCodeLensProvider(client, modeId);
			implementationCodeLensProvider.updateConfiguration();
			this.toUpdateOnConfigurationChanged.push(implementationCodeLensProvider);
			this.disposables.push(languages.registerCodeLensProvider(selector, implementationCodeLensProvider));


			this.disposables.push(languages.setLanguageConfiguration(modeId, {
				indentationRules: {
					// ^(.*\*/)?\s*\}.*$
					decreaseIndentPattern: /^(.*\*\/)?\s*\}.*$/,
					// ^.*\{[^}"']*$
					increaseIndentPattern: /^.*\{[^}"'`]*$/
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

			const EMPTY_ELEMENTS: string[] = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'];

			this.disposables.push(languages.setLanguageConfiguration('jsx-tags', {
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
		});
	}

	private configurationChanged(): void {
		const config = workspace.getConfiguration(this.id);
		this.updateValidate(config.get(validateSetting, true));

		if (this.formattingProvider) {
			this.formattingProvider.updateConfiguration(config);
			if (!this.formattingProvider.isEnabled() && this.formattingProviderRegistration) {
				this.formattingProviderRegistration.dispose();
				this.formattingProviderRegistration = null;

			} else if (this.formattingProvider.isEnabled() && !this.formattingProviderRegistration) {
				this.formattingProviderRegistration = languages.registerDocumentRangeFormattingEditProvider(this.description.modeIds, this.formattingProvider);
			}
		}

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

		const basename = path.basename(file);
		if (!!basename && basename === this.description.configFile) {
			return true;
		}
		return false;
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
			this.currentDiagnostics.clear();
		}
	}

	public reInitialize(): void {
		this.currentDiagnostics.clear();
		this.syntaxDiagnostics = Object.create(null);
		this.bufferSyncSupport.reOpenDocuments();
		this.bufferSyncSupport.requestAllDiagnostics();
		this.registerVersionDependentProviders();
	}

	private registerVersionDependentProviders(): void {
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
			this.versionDependentDisposables.push(languages.registerImplementationProvider(selector, new ImplementationProvider(this.client)));
		}

		if (this.client.apiVersion.has213Features()) {
			this.versionDependentDisposables.push(languages.registerTypeDefinitionProvider(selector, new TypeDefintionProvider(this.client)));
		}
	}

	public triggerAllDiagnostics(): void {
		this.bufferSyncSupport.requestAllDiagnostics();
	}

	public syntaxDiagnosticsReceived(file: string, diagnostics: Diagnostic[]): void {
		this.syntaxDiagnostics[file] = diagnostics;
	}

	public semanticDiagnosticsReceived(file: string, diagnostics: Diagnostic[]): void {
		const syntaxMarkers = this.syntaxDiagnostics[file];
		if (syntaxMarkers) {
			delete this.syntaxDiagnostics[file];
			diagnostics = syntaxMarkers.concat(diagnostics);
		}
		this.currentDiagnostics.set(this.client.asUrl(file), diagnostics);
	}

	public configFileDiagnosticsReceived(file: string, diagnostics: Diagnostic[]): void {
		this.currentDiagnostics.set(this.client.asUrl(file), diagnostics);
	}
}

class TypeScriptServiceClientHost implements ITypescriptServiceClientHost {
	private client: TypeScriptServiceClient;
	private languages: LanguageProvider[] = [];
	private languagePerId: ObjectMap<LanguageProvider>;
	private readonly disposables: Disposable[] = [];

	constructor(
		descriptions: LanguageDescription[],
		storagePath: string | undefined,
		globalState: Memento,
		workspaceState: Memento,
		plugins: TypeScriptServerPlugin[]
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

		this.client = new TypeScriptServiceClient(this, storagePath, globalState, workspaceState, plugins, this.disposables);
		this.languagePerId = Object.create(null);
		for (const description of descriptions) {
			const manager = new LanguageProvider(this.client, description);
			this.languages.push(manager);
			this.disposables.push(manager);
			this.languagePerId[description.id] = manager;
		}

		this.client.onReady().then(() => {
			if (!this.client.apiVersion.has230Features()) {
				return;
			}

			const langauges = new Set<string>();
			for (const plugin of plugins) {
				for (const language of plugin.languages) {
					langauges.add(language);
				}
			}
			if (langauges.size) {
				const description: LanguageDescription = {
					id: 'typescript-plugins',
					modeIds: Array.from(langauges.values()),
					diagnosticSource: 'ts-plugins'
				};
				const manager = new LanguageProvider(this.client, description);
				this.languages.push(manager);
				this.disposables.push(manager);
				this.languagePerId[description.id] = manager;
			}
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

	public goToProjectConfig(
		isTypeScriptProject: boolean,
		resource: Uri
	): Thenable<TextEditor | undefined> | undefined {
		const rootPath = workspace.rootPath;
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

		return this.client.execute('projectInfo', { file, needFileNameList: false } as protocol.ProjectInfoRequestArgs).then(res => {
			if (!res || !res.body) {
				return window.showWarningMessage(localize('typescript.projectConfigCouldNotGetInfo', 'Could not determine TypeScript or JavaScript project'))
					.then(() => void 0);
			}

			const { configFileName } = res.body;
			if (configFileName && configFileName.indexOf('/dev/null/') !== 0) {
				return workspace.openTextDocument(configFileName)
					.then(doc =>
						window.showTextDocument(doc, window.activeTextEditor ? window.activeTextEditor.viewColumn : undefined));
			}

			return window.showInformationMessage<ProjectConfigMessageItem>(
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
				}).then(selected => {
					switch (selected && selected.id) {
						case ProjectConfigAction.CreateConfig:
							const configFile = Uri.file(path.join(rootPath, isTypeScriptProject ? 'tsconfig.json' : 'jsconfig.json'));
							const col = window.activeTextEditor ? window.activeTextEditor.viewColumn : undefined;
							return workspace.openTextDocument(configFile)
								.then(doc => {
									return window.showTextDocument(doc, col);
								}, _ => {
									return workspace.openTextDocument(configFile.with({ scheme: 'untitled' }))
										.then(doc => window.showTextDocument(doc, col))
										.then(editor => editor.insertSnippet(new SnippetString('{\n\t$0\n}')));
								});

						case ProjectConfigAction.LearnMore:
							if (isTypeScriptProject) {
								commands.executeCommand('vscode.open', Uri.parse('https://go.microsoft.com/fwlink/?linkid=841896'));
							} else {
								commands.executeCommand('vscode.open', Uri.parse('https://go.microsoft.com/fwlink/?linkid=759670'));
							}
							return;

						default:
							return Promise.resolve(undefined);
					}
				});
		});
	}

	private findLanguage(file: string): Thenable<LanguageProvider | null> {
		return workspace.openTextDocument(file).then((doc: TextDocument) => {
			for (const language of this.languages) {
				if (language.handles(file, doc)) {
					return language;
				}
			}
			return null;
		}, () => null);
	}

	private triggerAllDiagnostics() {
		Object.keys(this.languagePerId).forEach(key => this.languagePerId[key].triggerAllDiagnostics());
	}

	/* internal */ populateService(): void {
		// See https://github.com/Microsoft/TypeScript/issues/5530
		workspace.saveAll(false).then(_ => {
			Object.keys(this.languagePerId).forEach(key => this.languagePerId[key].reInitialize());
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
		/*
		if (Is.defined(body.queueLength)) {
			BuildStatus.update({ queueLength: body.queueLength });
		}
		*/
	}

	/* internal */ configFileDiagnosticsReceived(event: Proto.ConfigFileDiagnosticEvent): void {
		// See https://github.com/Microsoft/TypeScript/issues/10384
		const body = event.body;
		if (!body || !body.diagnostics || !body.configFile) {
			return;
		}

		(body.triggerFile ? this.findLanguage(body.triggerFile) : this.findLanguage(body.configFile)).then(language => {
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
			const range = new Range(start.line - 1, start.offset - 1, end.line - 1, end.offset - 1);
			const converted = new Diagnostic(range, text);
			converted.severity = this.getDiagnosticSeverity(diagnostic);
			converted.source = diagnostic.source || source;
			converted.code = '' + diagnostic.code;
			result.push(converted);
		}
		return result;
	}

	private getDiagnosticSeverity(diagnostic: Proto.Diagnostic): DiagnosticSeverity {
		switch (diagnostic.category) {
			case PConst.DiagnosticCategory.error:
				return DiagnosticSeverity.Error;

			case PConst.DiagnosticCategory.warning:
				return DiagnosticSeverity.Warning;

			default:
				return DiagnosticSeverity.Error;
		}
	}
}
