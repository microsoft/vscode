/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isPreRelease } from '../../../../../platform/env/common/packagejson';
import { IFileSystemService } from '../../../../../platform/filesystem/common/fileSystemService';
import { CodeActionData } from '../../../../../platform/inlineEdits/common/dataTypes/codeActionData';
import { DocumentId } from '../../../../../platform/inlineEdits/common/dataTypes/documentId';
import { LanguageId } from '../../../../../platform/inlineEdits/common/dataTypes/languageId';
import { IObservableDocument } from '../../../../../platform/inlineEdits/common/observableWorkspace';
import { ILogger } from '../../../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { isAbsolute } from '../../../../../util/vs/base/common/path';
import { dirname, resolvePath } from '../../../../../util/vs/base/common/resources';
import { URI } from '../../../../../util/vs/base/common/uri';
import { TextReplacement } from '../../../../../util/vs/editor/common/core/edits/textEdit';
import { Position } from '../../../../../util/vs/editor/common/core/position';
import { INextEditDisplayLocation } from '../../../node/nextEditResult';
import { IVSCodeObservableDocument } from '../../parts/vscodeWorkspace';
import { Diagnostic, DiagnosticCompletionItem, DiagnosticInlineEditRequestLogContext, IDiagnosticCompletionProvider, isDiagnosticWithinDistance, log, logList } from './diagnosticsCompletions';

class ImportCodeAction {

	public get importName(): string {
		return this._importDetails.importName;
	}

	public get importPath(): string {
		return this._importDetails.importPath;
	}

	public get labelShort(): string {
		return this._importDetails.labelShort;
	}

	public get labelDeduped(): string {
		return this._importDetails.labelDeduped;
	}

	public get importSource(): ImportSource {
		return this._importDetails.importSource;
	}

	constructor(
		public readonly codeAction: CodeActionData,
		public readonly edit: TextReplacement,
		private readonly _importDetails: ImportDetails,
		public readonly hasExistingSameFileImport: boolean
	) { }

	compareTo(other: ImportCodeAction): number {
		if (this.hasExistingSameFileImport && !other.hasExistingSameFileImport) {
			return -1;
		}
		if (!this.hasExistingSameFileImport && other.hasExistingSameFileImport) {
			return 1;
		}

		if (
			this.importSource === ImportSource.local && other.importSource !== ImportSource.local ||
			this.importSource !== ImportSource.external && other.importSource === ImportSource.external
		) {
			return -1;
		}

		if (
			this.importSource !== ImportSource.local && other.importSource === ImportSource.local ||
			this.importSource === ImportSource.external && other.importSource !== ImportSource.external
		) {
			return 1;
		}

		if (this.importSource !== ImportSource.unknown && other.importSource !== ImportSource.unknown) {
			const aPathDistance = this.importPath.split('/').length - 1;
			const bPathDistance = other.importPath.split('/').length - 1;
			if (aPathDistance !== bPathDistance) {
				return aPathDistance - bPathDistance;
			}
		}

		return -1;
	}

	toString(): string {
		return this.codeAction.toString();
	}
}

export class ImportDiagnosticCompletionItem extends DiagnosticCompletionItem {
	public static readonly type = 'import';
	public readonly providerName = 'import';

	get importItemName(): string {
		return this._importCodeAction.importName;
	}

	private readonly _importSourceFile: DocumentId;
	get importSourceFile(): DocumentId {
		return this._importSourceFile;
	}

	get isLocalImport(): boolean | undefined {
		switch (this._importCodeAction.importSource) {
			case ImportSource.local: return true;
			case ImportSource.external: return false;
			default: return undefined;
		}
	}

	get hasExistingSameFileImport(): boolean {
		return this._importCodeAction.hasExistingSameFileImport;
	}

	constructor(
		private readonly _importCodeAction: ImportCodeAction,
		diagnostic: Diagnostic,
		private _importLabel: string,
		workspaceDocument: IVSCodeObservableDocument,
		public readonly alternativeImportsCount: number,
	) {
		super(ImportDiagnosticCompletionItem.type, diagnostic, _importCodeAction.edit, workspaceDocument);

		let importFilePath: string;
		if (isAbsolute(this._importCodeAction.importPath)) {
			importFilePath = this._importCodeAction.importPath;
		} else {
			importFilePath = resolvePath(dirname(workspaceDocument.id.toUri()), this._importCodeAction.importPath).path;
		}

		this._importSourceFile = DocumentId.create(importFilePath);
	}

	protected override _getDisplayLocation(): INextEditDisplayLocation | undefined {
		const transformer = this._workspaceDocument.value.get().getTransformer();
		return { range: transformer.getRange(this.diagnostic.range), label: this._importLabel };
	}
}

class WorkspaceInformation {
	private _nodeModules: Set<string>;
	public get nodeModules(): Set<string> {
		return this._nodeModules;
	}
	public readonly tsconfigPaths: Record<string, string[]>;

	constructor(private readonly _workspaceService: IWorkspaceService, private readonly _fileService: IFileSystemService) {
		this._nodeModules = new Set<string>();
		this.tsconfigPaths = {};
	}

	async updateNodeModules(): Promise<void> {
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();

		const workspaceNodeModules = await Promise.all(workspaceFolders.map(async folder => {
			try {
				const nodeModulesFolder = URI.joinPath(folder, 'node_modules');

				// Check if node_modules folder exists
				const resourceStat = await this._fileService.stat(nodeModulesFolder);
				if (resourceStat.type !== vscode.FileType.Directory) {
					return new Set<string>();
				}

				// Read all node_modules directories
				const entries = await this._fileService.readDirectory(nodeModulesFolder);
				const directories = entries.filter(([_, type]) => type === vscode.FileType.Directory);
				const directoryNames = directories.map(([name, _]) => name);

				return new Set<string>(directoryNames);
			} catch {
				return new Set<string>();
			}
		}));

		this._nodeModules = new Set<string>(...workspaceNodeModules);
	}
}

export class ImportDiagnosticCompletionProvider implements IDiagnosticCompletionProvider<ImportDiagnosticCompletionItem> {

	public static SupportedLanguages = new Set<string>(['typescript', 'javascript', 'typescriptreact', 'javascriptreact', 'python', 'java']);

	public readonly providerName = 'import';

	private readonly _importRejectionMap = new Map<DocumentId, Set<string>>();
	private readonly _workspaceInfo: WorkspaceInformation;
	private readonly _importHandlers: Map<string, ILanguageImportHandler>;

	constructor(
		private readonly _logger: ILogger,
		private readonly _workspaceService: IWorkspaceService,
		private readonly _fileService: IFileSystemService,
	) {
		this._workspaceInfo = new WorkspaceInformation(this._workspaceService, this._fileService);
		this._workspaceInfo.updateNodeModules(); // Only update once on startup

		const javascriptImportHandler = new JavascriptImportHandler();
		const pythonImportHandler = new PythonImportHandler();
		const javaImportHandler = new JavaImportHandler();
		this._importHandlers = new Map<string, ILanguageImportHandler>([
			['javascript', javascriptImportHandler],
			['typescript', javascriptImportHandler],
			['typescriptreact', javascriptImportHandler],
			['javascriptreact', javascriptImportHandler],
			['python', pythonImportHandler],
		]);

		if (isPreRelease) {
			this._importHandlers.set('java', javaImportHandler);
		}
	}

	public providesCompletionsForDiagnostic(workspaceDocument: IVSCodeObservableDocument, diagnostic: Diagnostic, language: LanguageId, pos: Position): boolean {
		const importHandler = this._importHandlers.get(language);
		if (!importHandler) {
			return false;
		}

		if (!isDiagnosticWithinDistance(workspaceDocument, diagnostic, pos, 12)) {
			return false;
		}

		return importHandler.isImportDiagnostic(diagnostic);
	}

	async provideDiagnosticCompletionItem(workspaceDocument: IVSCodeObservableDocument, sortedDiagnostics: Diagnostic[], pos: Position, logContext: DiagnosticInlineEditRequestLogContext, token: CancellationToken): Promise<ImportDiagnosticCompletionItem | null> {
		const language = workspaceDocument.languageId.get();
		const importDiagnosticToFix = sortedDiagnostics.find(diagnostic => this.providesCompletionsForDiagnostic(workspaceDocument, diagnostic, language, pos));
		if (!importDiagnosticToFix) {
			return null;
		}

		// fetch code actions for missing import
		const startTime = Date.now();
		const availableCodeActions = await workspaceDocument.getCodeActions(importDiagnosticToFix.range, 3, token);
		const resolveCodeActionDuration = Date.now() - startTime;
		if (availableCodeActions === undefined) {
			log(`Fetching code actions likely timed out for \`${importDiagnosticToFix.message}\``, logContext, this._logger);
			return null;
		}

		log(`Resolving code actions for \`${importDiagnosticToFix.message}\` took \`${resolveCodeActionDuration}ms\``, logContext, this._logger);

		const availableImportCodeActions = this._getImportCodeActions(availableCodeActions, workspaceDocument, importDiagnosticToFix, this._workspaceInfo);
		if (availableImportCodeActions.length === 0) {
			log('No import code actions found in the available code actions', logContext, this._logger);
			return null;
		}

		const sortedImportCodeActions = availableImportCodeActions.sort((a, b) => a.compareTo(b));

		logList(`Sorted import code actions for \`${importDiagnosticToFix.message}\``, sortedImportCodeActions, logContext, this._logger);

		for (const codeAction of sortedImportCodeActions) {
			const importCodeActionLabel = availableImportCodeActions.length === 1 && codeAction.importSource !== ImportSource.external ? codeAction.labelShort : codeAction.labelDeduped;

			const item = new ImportDiagnosticCompletionItem(codeAction, importDiagnosticToFix, importCodeActionLabel, workspaceDocument, availableImportCodeActions.length - 1);

			if (this._hasImportBeenRejected(item)) {
				log(`Rejected import completion item ${codeAction.labelDeduped} for ${importDiagnosticToFix.toString()}`, logContext, this._logger);
				logContext.markToBeLogged();
				continue;
			}

			log(`Created import completion item ${codeAction.labelDeduped} for ${importDiagnosticToFix.toString()}`, logContext, this._logger);

			return item;
		}

		return null;
	}

	completionItemRejected(item: ImportDiagnosticCompletionItem): void {
		let rejectedItems = this._importRejectionMap.get(item.importSourceFile);

		if (rejectedItems === undefined) {
			rejectedItems = new Set<string>();
			this._importRejectionMap.set(item.importSourceFile, rejectedItems);
		}

		rejectedItems.add(item.importItemName);
	}

	isCompletionItemStillValid(item: ImportDiagnosticCompletionItem, workspaceDocument: IObservableDocument): boolean {
		if (this._hasImportBeenRejected(item)) {
			return false;
		}
		return item.diagnostic.range.substring(workspaceDocument.value.get().value) === item.importItemName;
	}

	private _hasImportBeenRejected(item: ImportDiagnosticCompletionItem): boolean {
		const rejected = this._importRejectionMap.get(item.importSourceFile);
		return rejected?.has(item.importItemName) ?? false;
	}

	private _getImportCodeActions(codeActions: CodeActionData[], workspaceDocument: IVSCodeObservableDocument, diagnostic: Diagnostic, workspaceInfo: WorkspaceInformation): ImportCodeAction[] {
		const documentContent = workspaceDocument.value.get();
		const importName = diagnostic.range.substring(documentContent.value);
		const language = workspaceDocument.languageId.get();

		const importHandler = this._importHandlers.get(language);
		if (!importHandler) {
			throw new Error(`No import handler found for language: ${language}`);
		}

		const importCodeActions: ImportCodeAction[] = [];
		for (const codeAction of codeActions) {

			if (!importHandler.isImportCodeAction(codeAction)) {
				continue;
			}

			if (!codeAction.edits) {
				continue;
			}

			const joinedEdit = TextReplacement.joinReplacements(codeAction.edits, documentContent);

			// The diagnostic might have changed in the meantime to a different range
			// So we need to get the import name from the referenced diagnostic
			let codeActionImportName = importName;
			if (codeAction.diagnostics && codeAction.diagnostics.length > 0) {
				codeActionImportName = codeAction.diagnostics[0].range.substring(documentContent.value);
			}

			const importDetails = importHandler.getImportDetails(codeAction, codeActionImportName, workspaceInfo);
			if (!importDetails) {
				continue;
			}

			const importCodeAction = new ImportCodeAction(
				codeAction,
				joinedEdit,
				importDetails,
				!joinedEdit.text.includes('import')
			);

			if (codeActionImportName.length < 2 || importHandler.isImportInIgnoreList(importCodeAction)) {
				continue;
			}

			importCodeActions.push(importCodeAction);
		}

		return importCodeActions;
	}
}

enum ImportSource {
	local,
	external,
	unknown,
}

export type ImportDetails = {
	importName: string;
	importPath: string;
	labelShort: string;
	labelDeduped: string;
	importSource: ImportSource;
}

export interface ILanguageImportHandler {
	isImportDiagnostic(diagnostic: Diagnostic): boolean;
	isImportCodeAction(codeAction: CodeActionData): boolean;
	isImportInIgnoreList(importCodeAction: ImportCodeAction): boolean;
	getImportDetails(codeAction: CodeActionData, importName: string, workspaceInfo: WorkspaceInformation): ImportDetails | null;
}

class JavascriptImportHandler implements ILanguageImportHandler {

	private static CodeActionTitlePrefixes = ['Add import from', 'Update import from'];
	private static ImportsToIgnore = new Set<string>(['type', 'namespace', 'module', 'declare', 'abstract', 'from', 'of', 'require', 'async']);
	private static ModulesToIgnore = new Set<string>([]);

	isImportDiagnostic(diagnostic: Diagnostic): boolean {
		return diagnostic.message.includes('Cannot find name');
	}

	isImportCodeAction(codeAction: CodeActionData): boolean {
		return JavascriptImportHandler.CodeActionTitlePrefixes.some(prefix => codeAction.title.startsWith(prefix));
	}

	isImportInIgnoreList(importCodeAction: ImportCodeAction): boolean {
		if (importCodeAction.importSource === ImportSource.local) {
			return false;
		}

		if (importCodeAction.importSource === ImportSource.external && importCodeAction.importPath.includes('/')) {
			return true; // Ignore imports that are from node_modules and point to a subpath
		}

		if (importCodeAction.importSource === ImportSource.external && importCodeAction.importName === importCodeAction.importName.toLowerCase()) {
			return true; // Ignore imports which consits of a single word as they are likely variable names. All lowercase is an over approximation for this
		}

		if (JavascriptImportHandler.ImportsToIgnore.has(importCodeAction.importName)) {
			return true;
		}

		if (JavascriptImportHandler.ModulesToIgnore.has(importCodeAction.importPath.split(':')[0])) {
			return true;
		}

		return false;
	}

	getImportDetails(codeAction: CodeActionData, importName: string, workspaceInfo: WorkspaceInformation): ImportDetails | null {
		const importTitlePrefix = JavascriptImportHandler.CodeActionTitlePrefixes.find(prefix => codeAction.title.startsWith(prefix));
		if (!importTitlePrefix) {
			return null;
		}

		const pathAsInTitle = codeAction.title.substring(importTitlePrefix.length).trim();
		let importPath = pathAsInTitle;
		if ((importPath.startsWith('"') && importPath.endsWith('"')) ||
			(importPath.startsWith(`'`) && importPath.endsWith(`'`)) ||
			(importPath.startsWith('`') && importPath.endsWith('`'))) {
			importPath = importPath.slice(1, -1);
		}

		return {
			importName,
			importPath,
			labelShort: `import ${importName}`,
			labelDeduped: `import ${importName} from ${pathAsInTitle}`,
			importSource: this._getImportSource(importPath, workspaceInfo)
		};
	}

	private _getImportSource(importPath: string, workspaceInfo: WorkspaceInformation): ImportSource {
		if (importPath.startsWith('./') || importPath.startsWith('../')) {
			return ImportSource.local;
		}

		// Resolve against tsconfig paths
		for (const [alias, _] of Object.entries(workspaceInfo.tsconfigPaths)) {
			const aliasBase = alias.replace(/\*$/, '');
			if (importPath.startsWith(aliasBase)) {
				return ImportSource.local;
			}
		}

		if (importPath.includes(':')) {
			return ImportSource.external;
		}

		const potentialNodeModules = [importPath, importPath.split('/')[0]];
		if (potentialNodeModules.some(importPath => workspaceInfo.nodeModules.has(importPath))) {
			return ImportSource.external;
		}

		return ImportSource.unknown;
	}
}

class PythonImportHandler implements ILanguageImportHandler {

	isImportDiagnostic(diagnostic: Diagnostic): boolean {
		return diagnostic.message.includes('is not defined');
	}

	isImportCodeAction(codeAction: CodeActionData): boolean {
		return codeAction.title.startsWith('Add "from') || codeAction.title.startsWith('Add "import');
	}

	isImportInIgnoreList(importCodeAction: ImportCodeAction): boolean {
		return false;
	}

	getImportDetails(codeAction: CodeActionData, importName: string, workspaceInfo: WorkspaceInformation): ImportDetails | null {
		const fromImportMatch = codeAction.title.match(/Add "from\s+(.+?)\s+import\s(.+?)"/);
		if (fromImportMatch) {
			const importPath = fromImportMatch[1];
			const importName = fromImportMatch[2];
			return { importName, importPath, labelDeduped: `import from ${importPath}`, labelShort: `import ${importName}`, importSource: this._getImportSource(importPath) };
		}

		const importAsMatch = codeAction.title.match(/Add "import\s+(.+?)\s+as\s(.+?)"/);
		if (importAsMatch) {
			const importName = importAsMatch[1];
			const importAs = importAsMatch[2];
			return { importName, importPath: importName, labelDeduped: `import ${importName} as ${importAs}`, labelShort: `import ${importName} as ${importAs}`, importSource: ImportSource.unknown };
		}

		const importMatch = codeAction.title.match(/Add "import\s+(.+?)"/);
		if (importMatch) {
			const importName = importMatch[1];
			return { importName, importPath: importName, labelDeduped: `import ${importName}`, labelShort: `import ${importName}`, importSource: ImportSource.unknown };
		}

		return null;
	}

	private _getImportSource(importPath: string): ImportSource {
		if (importPath.startsWith('.')) {
			return ImportSource.local;
		}

		return ImportSource.unknown;
	}
}

class JavaImportHandler implements ILanguageImportHandler {

	isImportDiagnostic(diagnostic: Diagnostic): boolean {
		return String(diagnostic.data.code) === '16777218' || diagnostic.message.endsWith('cannot be resolved to a type');
	}

	isImportCodeAction(codeAction: CodeActionData): boolean {
		return codeAction.title.startsWith('Import');
	}

	isImportInIgnoreList(importCodeAction: ImportCodeAction): boolean {
		return false;
	}

	getImportDetails(codeAction: CodeActionData, importName: string, workspaceInfo: WorkspaceInformation): ImportDetails | null {
		return {
			importName,
			importPath: codeAction.title.split(`\'`)[2].trim(),
			labelShort: 'import ' + importName,
			labelDeduped: codeAction.title,
			importSource: ImportSource.unknown
		};
	}
}
