/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ILanguageRuntimeMetadata, ILanguageRuntimeService, RuntimeExitReason } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { IRuntimeStartupService } from '../../../services/runtimeStartup/common/runtimeStartupService.js';
import { IPYNB_VIEW_TYPE } from '../../notebook/browser/notebookBrowser.js';
import { NotebookTextModel } from '../../notebook/common/model/notebookTextModel.js';
import { CellEditType, CellKind, ICellEditOperation } from '../../notebook/common/notebookCommon.js';
import { INotebookKernelService } from '../../notebook/common/notebookKernelService.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { ActiveNotebookHasRunningRuntimeManager } from '../common/activeNotebookHasRunningRuntime.js';
import { registerRuntimeNotebookKernelActions } from './runtimeNotebookKernelActions.js';
import { IRuntimeNotebookKernelService } from '../common/interfaces/runtimeNotebookKernelService.js';
import { NotebookExecutionStatus } from './notebookExecutionStatus.js';
import { RuntimeNotebookKernel } from './runtimeNotebookKernel.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILanguageRuntimeCodeExecutedEvent } from '../../../services/erdosConsole/common/erdosConsoleCodeExecution.js';
import { LANGUAGE_RUNTIME_SELECT_RUNTIME_ID } from '../../languageRuntime/browser/languageRuntimeActions.js';

/**
 * The affinity of a kernel for a notebook.
 *
 * NOTE: This should match vscode.NotebookControllerAffinity.
 */
enum NotebookKernelAffinity {
	/** The default affinity. */
	Default = 1,

	/** A kernel will be automatically started if it is a notebook's only preferred kernel. */
	Preferred = 2
}

/**
 * The service responsible for managing {@link RuntimeNotebookKernel}s.
 */
export class RuntimeNotebookKernelService extends Disposable implements IRuntimeNotebookKernelService {
	/** Map of runtime notebook kernels keyed by kernel ID. */
	private readonly _kernels = new Map<string, RuntimeNotebookKernel>();

	/** Map of runtime notebook kernels keyed by runtime ID. */
	private readonly _kernelsByRuntimeId = new Map<string, RuntimeNotebookKernel>();

	/** An event that fires when code is executed in any notebook */
	private readonly _didExecuteCodeEmitter = this._register(new Emitter<ILanguageRuntimeCodeExecutedEvent>());
	onDidExecuteCode: Event<ILanguageRuntimeCodeExecutedEvent> = this._didExecuteCodeEmitter.event;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageRuntimeService private readonly _languageRuntimeService: ILanguageRuntimeService,
		@ILogService private readonly _logService: ILogService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionService,
		@IRuntimeStartupService private readonly _runtimeStartupService: IRuntimeStartupService,
	) {
		super();

		// Create the notebook execution status bar entry.
		this._register(this._instantiationService.createInstance(NotebookExecutionStatus));

		// Create the active notebook has running runtime context manager.
		this._register(this._instantiationService.createInstance(ActiveNotebookHasRunningRuntimeManager));

		// Create a kernel when a runtime is registered.
		this._register(this._languageRuntimeService.onDidRegisterRuntime(runtime => {
			this.createRuntimeNotebookKernel(runtime);
		}));

		// Create a kernel for each existing runtime.
		for (const runtime of this._languageRuntimeService.registeredRuntimes) {
			this.createRuntimeNotebookKernel(runtime);
		}

		// When a known kernel is selected for a notebook, select the corresponding runtime.
		this._register(this._notebookKernelService.onDidChangeSelectedNotebooks(async e => {
			// Get the old/new kernel from the map.
			// These will be undefined if the user switched from/to an unknown kernel.
			const oldKernel = e.oldKernel && this._kernels.get(e.oldKernel);
			const newKernel = e.newKernel && this._kernels.get(e.newKernel);
			if (newKernel) {
				// A known kernel was selected.
				// Update the notebook's language to match the selected kernel.
				this.updateNotebookLanguage(e.notebook, newKernel.runtime.languageId);

				// Select the corresponding runtime for the notebook.
				await newKernel.selectRuntime(
					e.notebook,
					`Runtime kernel ${newKernel.id} selected for notebook`,
				);
			} else if (oldKernel && !newKernel) {
				// The user switched from a known kernel to an unknown kernel, shutdown the old kernel's runtime.
				this._runtimeSessionService.shutdownNotebookSession(
					e.notebook,
					RuntimeExitReason.Shutdown,
					`Runtime kernel ${oldKernel.id} deselected for notebook`,
				);
			}
		}));

		// When a notebook is added, update its kernel affinity for kernel auto-selection.
		this._register(this._notebookService.onWillAddNotebookDocument(async notebook => {
			await this.updateKernelNotebookAffinity(notebook);
		}));

		// Update the kernel affinity of all existing notebooks.
		for (const notebook of this._notebookService.getNotebookTextModels()) {
			this.updateKernelNotebookAffinity(notebook)
				.catch(err => this._logService.error(`Error updating affinity for notebook ${notebook.uri.fsPath}: ${err}`));
		}

		// When a notebook is closed, shutdown the corresponding session.
		this._register(this._notebookService.onWillRemoveNotebookDocument(async notebook => {
			await this._runtimeSessionService.shutdownNotebookSession(
				notebook.uri,
				RuntimeExitReason.Shutdown,
				`Notebook closed`,
			);
		}));

		// Register kernel source action providers. This is how we customize the
		// kernel selection quickpick. Each command must return a valid runtime ID
		// (since kernel IDs have the format `${extension}/{runtimeId}`).
		this._register(this._notebookKernelService.registerKernelSourceActionProvider(IPYNB_VIEW_TYPE, {
			viewType: IPYNB_VIEW_TYPE,
			async provideKernelSourceActions() {
				return [
					{
						label: 'Select Environment...',
						command: {
							id: LANGUAGE_RUNTIME_SELECT_RUNTIME_ID,
							title: 'Select Environment',
						},
					}
				];
			},
			// Kernel source actions are currently constant so we don't need this event.
			onDidChangeSourceActions: undefined,
		}));
	}

	/**
	 * Get a runtime notebook kernel by runtime ID.
	 *
	 * @param runtimeId The runtime ID.
	 */
	public getKernelByRuntimeId(runtimeId: string): RuntimeNotebookKernel | undefined {
		return this._kernelsByRuntimeId.get(runtimeId);
	}

	/**
	 * Create and register a notebook kernel for a given language runtime.
	 *
	 * @param runtime The language runtime to create a notebook kernel for.
	 */
	private createRuntimeNotebookKernel(runtime: ILanguageRuntimeMetadata): void {
		// Create the kernel instance.
		const kernel = this._register(this._instantiationService.createInstance(RuntimeNotebookKernel, runtime));

		// Warn if a kernel with the same ID already exists; that shouldn't happen.
		if (this._kernels.has(kernel.id)) {
			this._logService.warn(`Kernel with ID ${kernel.id} already exists, overwriting existing kernel`);
		}

		// Register the kernel with this service.
		this._kernels.set(kernel.id, kernel);
		this._kernelsByRuntimeId.set(runtime.runtimeId, kernel);

		// Register the kernel with the notebook kernel service.
		this._register(this._notebookKernelService.registerKernel(kernel));

		// Listen for code execution events from the kernel.
		this._register(kernel.onDidExecuteCode(e => {
			this._didExecuteCodeEmitter.fire(e);
		}));
	}

	/**
	 * Update the language in a notebook's metadata and cells.
	 *
	 * @param notebookUri URI of the notebook to update.
	 * @param languageId The language ID.
	 */
	private updateNotebookLanguage(notebookUri: URI, languageId: string): void {
		const notebook = this._notebookService.getNotebookTextModel(notebookUri);
		if (!notebook) {
			throw new Error(`No notebook document for '${notebookUri.fsPath}'`);
		}

		// Create the edit operation to update the notebook metadata.
		const documentMetadataEdit: ICellEditOperation = {
			editType: CellEditType.DocumentMetadata,
			metadata: {
				...notebook.metadata,
				metadata: {
					...notebook.metadata.metadata ?? {},
					language_info: {
						name: languageId,
					},
				}
			},
		};

		// Create the edit operations to update the cell languages.
		const cellEdits = new Array<ICellEditOperation>();
		for (const [index, cell] of notebook.cells.entries()) {
			if (cell.cellKind === CellKind.Code &&
				cell.language !== languageId &&
				// Don't change raw cells; they're often used to define metadata e.g in Quarto notebooks.
				cell.language !== 'raw') {
				cellEdits.push({
					editType: CellEditType.CellLanguage,
					index,
					language: languageId,
				});
			}
		}

		// Apply the edits.
		notebook.applyEdits(
			[documentMetadataEdit, ...cellEdits],
			true,
			undefined,
			() => undefined,
			undefined,
			false,
		);
	}

	/**
	 * Update a notebook's affinity for all kernels.
	 *
	 * Erdos automatically starts a kernel if it is the only 'preferred' kernel for the notebook.
	 *
	 * @param notebook The notebook whose affinity to update.
	 * @returns Promise that resolves when the notebook's affinity has been updated for all kernels.
	 */
	private async updateKernelNotebookAffinity(notebook: NotebookTextModel): Promise<void> {
		const cells = notebook.cells;
		if (cells.length === 0 ||
			(cells.length === 1 && cells[0].getValue() === '')) {
			// If its an empty notebook (i.e. it has a single empty cell, or no cells),
			// wait for its data to be updated. This works around the  fact that `vscode.openNotebookDocument()`
			// first creates a notebook (triggering `onDidOpenNotebookDocument`),
			// and later updates its content (triggering `onDidChangeNotebookDocument`).
			await new Promise<void>((resolve) => {
				// Apply a short timeout to avoid waiting indefinitely.
				const timeout = setTimeout(() => {
					disposable.dispose();
					resolve();
				}, 50);
				const disposable = notebook.onDidChangeContent(_e => {
					clearTimeout(timeout);
					disposable.dispose();
					resolve();
				});
			});
		}

		// Get the notebook's language.
		const languageId = getNotebookLanguage(notebook);
		if (!languageId) {
			this._logService.debug(`Could not determine notebook ${notebook.uri.fsPath} language`);
			return;
		}

		// Get the preferred kernel for the language.
		let preferredRuntime: ILanguageRuntimeMetadata;
		try {
			const preferred = this._runtimeStartupService.getPreferredRuntime(languageId);
			if (preferred) {
				preferredRuntime = preferred;
			} else {
				this._logService.debug(`No preferred runtime for language ${languageId}`);
				return;
			}
		} catch (err) {
			// It may error if there are no registered runtimes for the language, so log and return.
			this._logService.debug(`Failed to get preferred runtime for language ${languageId}. Reason: ${err.toString()}`);
			return;
		}
		const preferredKernel = this._kernelsByRuntimeId.get(preferredRuntime.runtimeId);
		this._logService.debug(`Preferred kernel for notebook ${notebook.uri.fsPath}: ${preferredKernel?.label}`);

		// Set the affinity across all known kernels.
		for (const kernel of this._kernels.values()) {
			const affinity = kernel === preferredKernel
				? NotebookKernelAffinity.Preferred
				: NotebookKernelAffinity.Default;
			this._notebookKernelService.updateKernelNotebookAffinity(kernel, notebook.uri, affinity);
			this._logService.trace(`Updated notebook affinity for kernel: ${kernel.label}, ` +
				`notebook: ${notebook.uri.fsPath}, affinity: ${affinity}`);
		}
	}

	/**
	 * Needed for service branding in dependency injector.
	 */
	declare readonly _serviceBrand: undefined;

	/**
	 * Placeholder that gets called to "initialize" the service.
	 */
	initialize(): void {
	}
}

/**
 * Try to determine a notebook's language.
 *
 * @param notebook The notebook to determine the language of.
 * @returns The language ID of the notebook, or `undefined` if it could not be determined.
 */
function getNotebookLanguage(notebook: NotebookTextModel): string | undefined {
	// First try the notebook metadata.
	const metadata = notebook.metadata?.metadata as any;
	const languageId = metadata?.language_info?.name ?? metadata?.kernelspec?.language;
	if (languageId &&
		languageId !== 'raw' &&
		languageId !== 'plaintext'
	) {
		return languageId;
	}

	// Fall back to the first cell's language, if available.
	for (const cell of notebook.cells) {
		if (cell.cellKind === CellKind.Code &&
			cell.language !== 'raw' &&
			cell.language !== 'plaintext') {
			return cell.language;
		}
	}

	// Could not determine the notebook's language.
	return undefined;
}

// Register the service.
registerSingleton(
	IRuntimeNotebookKernelService,
	RuntimeNotebookKernelService,
	InstantiationType.Delayed,
);

// Register actions.
registerRuntimeNotebookKernelActions();