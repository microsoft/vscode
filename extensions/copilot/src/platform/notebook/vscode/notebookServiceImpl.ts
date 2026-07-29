/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, DocumentSymbol, extensions, NotebookCell, Uri, window, workspace } from 'vscode';
import { _hasSupportedNotebooks, EditorAssociation, extractEditorAssociation as extractEditorAssociations, findNotebook, INotebookEditorContribution, isNotebookEditorContribution } from '../../../util/common/notebooks';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { ILogService } from '../../log/common/logService';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { INotebookService, PipPackage, Variable, VariablesResult } from '../common/notebookService';
import { NotebookExecutionServiceImpl } from './notebookExectionServiceImpl';

export const NOTEBOOK_ALTERNATIVE_CONTENT_SCHEME = 'alternative-notebook-content';
const NOTEBOOK_AGENT_USAGE_KEY = 'github.copilot.notebookAgentModeUsage';

export interface ICellExecution {
	cell: NotebookCell;
	executionCount?: number;
}

export class NotebookService implements INotebookService {
	declare readonly _serviceBrand: undefined;

	private _cellExecution: Map<string, ICellExecution[]> = new Map();
	private _cellSymbols = new WeakMap<NotebookCell, DocumentSymbol[]>();
	private readonly _executionService = new NotebookExecutionServiceImpl();
	private _disposables: IDisposable[] = [];
	private _isVariableFilteringEnabled = false;

	private _notebookEditorContribInitFlag = false;
	private _notebookEditorContributions: INotebookEditorContribution[] = [];

	private followExecutionState: boolean = false;

	get isVariableFilteringEnabled() {
		return this._isVariableFilteringEnabled;
	}

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@ILogService private readonly _logger: ILogService,
	) {
		this._isVariableFilteringEnabled = this._experimentationService.getTreatmentVariable('copilotchat.notebookVariableFiltering')
			|| this._configurationService.getConfig(ConfigKey.Advanced.NotebookVariableFilteringEnabled);
		this._registerExecutionListener();
	}

	private _hasJupyterExtension() {
		return extensions.getExtension('ms-toolsai.jupyter')?.isActive;
	}

	public trackAgentUsage(): void {
		commands.executeCommand('setContext', NOTEBOOK_AGENT_USAGE_KEY, true);
	}

	public setFollowState(state: boolean): void {
		this.followExecutionState = state;
	}

	public getFollowState(): boolean {
		return this.followExecutionState;
	}

	async getVariables(notebook: Uri): Promise<VariablesResult[]> {
		if (!this._hasJupyterExtension()) {
			try {
				const results = await commands.executeCommand<Variable | VariablesResult>('vscode.executeNotebookVariableProvider', notebook);
				if (results && Array.isArray(results)) {
					const variableResults = results.map(this._convertResult);
					return this._filterVariables(notebook, variableResults);
				}

				return [];
			} catch (_ex) {
				this._logger.error(`Failed to get notebook variables (vscode.executeNotebookVariableProvider) for ${notebook.toString()}: ${_ex}`);
				return [];
			}
		}

		try {
			const results = await commands.executeCommand<Variable | VariablesResult>('jupyter.listVariables', notebook);
			if (results && Array.isArray(results)) {
				const variableResults = results.map(this._convertResult);
				return this._filterVariables(notebook, variableResults);
			}

			return [];
		} catch (_ex) {
			this._logger.error(`Failed to get notebook variables (jupyter.listVariables) for ${notebook.toString()}: ${_ex}`);
			return [];
		}
	}

	private _convertResult(result: Variable | VariablesResult): VariablesResult {
		if ('variable' in result) {
			return result;
		} else {
			return {
				variable: result,
				hasNamedChildren: false,
				indexedChildrenCount: 0
			};
		}
	}

	private _filterVariables(notebook: Uri, variables: VariablesResult[]): VariablesResult[] {
		if (!this.isVariableFilteringEnabled) {
			return variables;
		}

		const symbolNames = new Set<string>();
		findNotebook(notebook, workspace.notebookDocuments)?.getCells().forEach(cell => {
			const cellSymbols = this._cellSymbols.get(cell);
			if (cellSymbols) {
				cellSymbols.forEach(symbol => symbolNames.add(symbol.name));
			}
		});

		return variables.filter(v => symbolNames.has(v.variable.name));
	}

	async getPipPackages(notebook: Uri): Promise<PipPackage[]> {
		if (!this._hasJupyterExtension()) {
			return [];
		}

		try {
			const packages = await commands.executeCommand<PipPackage[]>('jupyter.listPipPackages', notebook);
			return packages;
		} catch (_ex) {
			this._logger.error(`Failed to get pip packages (jupyter.listPipPackages) for ${notebook.toString()}: ${_ex}`);
			return [];
		}
	}

	setVariables(notebook: Uri, variables: VariablesResult[]): void {
		// no op
	}

	//#region Notebook Support

	private populateNotebookEditorContributions() {
		const notebookContributions: Partial<INotebookEditorContribution>[] = [];
		const exts = extensions.all;
		for (const extension of exts) {
			const contrib = extension.packageJSON.contributes?.notebooks;
			if (Array.isArray(contrib)) {
				notebookContributions.push(...contrib);
			}
		}

		for (const contrib of notebookContributions) {
			if (isNotebookEditorContribution(contrib)) {
				this._notebookEditorContributions.push(contrib);
			}
		}
	}

	hasSupportedNotebooks(uri: Uri): boolean {
		if (!this._notebookEditorContribInitFlag) {
			this.populateNotebookEditorContributions();
			this._notebookEditorContribInitFlag = true;
		}

		const editorAssociationObjects = this._configurationService.getNonExtensionConfig<{ [fileNamePattern: string]: string }>('workbench.editorAssociations');
		const validatedEditorAssociations: EditorAssociation[] = extractEditorAssociations(editorAssociationObjects ?? {});

		const res = _hasSupportedNotebooks(uri, this._workspaceService.notebookDocuments, this._notebookEditorContributions, validatedEditorAssociations);
		return res;
	}

	//#endregion

	//#region Execution Summary
	private _registerExecutionListener(): void {
		this._disposables.push(this._executionService.onDidChangeNotebookCellExecutionState(e => {
			const cell = e.cell;
			const notebookUri = cell.notebook.uri;
			const notebookUriString = notebookUri.toString();
			let cellExecutionList = this._cellExecution.get(notebookUriString);

			if (!cellExecutionList) {
				cellExecutionList = [];
				this._cellExecution.set(notebookUriString, cellExecutionList);
			}

			const index = cellExecutionList.findIndex(item => item.cell === cell);
			if (index !== -1) {
				// we are executing cell again
				// remove it from the list first
				cellExecutionList.splice(index, 1);
			}

			cellExecutionList.push({ cell, executionCount: cell.executionSummary?.executionOrder });
		}));

		this._disposables.push(workspace.onDidChangeNotebookDocument(e => {
			if (!this.isVariableFilteringEnabled) {
				return;
			}

			for (const cellChange of e.cellChanges) {
				if (cellChange.executionSummary) {
					const executionSummary = cellChange.executionSummary;

					if (executionSummary.success) {
						// finished execution
						commands.executeCommand<DocumentSymbol[]>(
							'vscode.executeDocumentSymbolProvider',
							cellChange.cell.document.uri
						).then(symbols => {
							this._cellSymbols.set(cellChange.cell, symbols || []);
						});
					}
				}

				if (cellChange.document) {
					// content changed
					this._cellSymbols.delete(cellChange.cell);
				}
			}

			for (const contentChange of e.contentChanges) {
				contentChange.removedCells.forEach(cell => { this._cellSymbols.delete(cell); });
			}
		}));
	}

	getCellExecutions(notebook: Uri): NotebookCell[] {
		return this._cellExecution.get(notebook.toString())?.map(e => e.cell) || [];
	}

	async runCells(notebookUri: Uri, range: { start: number; end: number }, autoReveal: boolean) {
		await commands.executeCommand('notebook.cell.execute', {
			ranges: [range],
			document: notebookUri,
			autoReveal: autoReveal,
		});
	}

	async ensureKernelSelected(notebookUri: Uri) {
		if (window.visibleNotebookEditors.find(editor => editor.notebook.uri.toString() === notebookUri.toString())) {
			await commands.executeCommand('notebook.selectKernel', {
				notebookUri,
				skipIfAlreadySelected: true,
			});
		}
	}
	//#endregion

	dispose() {
		this._disposables.forEach(d => d.dispose());
	}
}
