/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { ILanguageRuntimeMetadata, RuntimeCodeExecutionMode, RuntimeErrorBehavior, RuntimeState } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { CodeAttributionSource, ILanguageRuntimeCodeExecutedEvent } from '../../../services/erdosConsole/common/erdosConsoleCodeExecution.js';
import { ILanguageRuntimeSession, IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { IPYNB_VIEW_TYPE } from '../../notebook/browser/notebookBrowser.js';
import { NotebookCellTextModel } from '../../notebook/common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../notebook/common/model/notebookTextModel.js';
import { INotebookExecutionStateService } from '../../notebook/common/notebookExecutionStateService.js';
import { INotebookKernel, INotebookKernelChangeEvent, VariablesResult } from '../../notebook/common/notebookKernelService.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { NotebookExecutionQueue } from '../common/notebookExecutionQueue.js';
import { ERDOS_RUNTIME_NOTEBOOK_KERNELS_EXTENSION_ID } from '../common/runtimeNotebookKernelConfig.js';
import { RuntimeNotebookCellExecution } from './runtimeNotebookCellExecution.js';

/** A notebook kernel for Erdos's language runtimes. */
export class RuntimeNotebookKernel extends Disposable implements INotebookKernel {
	/**
	 * The kernel's supported view type.
	 */
	public readonly viewType = IPYNB_VIEW_TYPE;

	/**
	 * The kernel's extension. Although this kernel lives in the main thread, some notebook services
	 * still expect it to have an extension ID.
	 */
	public readonly extension = new ExtensionIdentifier(ERDOS_RUNTIME_NOTEBOOK_KERNELS_EXTENSION_ID);

	/**
	 * Preload scripts provided by the kernel. See the vscode.proposed.notebookMessaging.d.ts
	 * proposed API for more.
	 */
	public readonly preloadUris: URI[] = [];

	/**
	 * APIs provided by the kernel's preload scripts. See the vscode.proposed.notebookMessaging.d.ts
	 * proposed API for more.
	 */
	public readonly preloadProvides: string[] = [];

	/**
	 * Whether this kernel implements an interrupt handler.
	 */
	public readonly implementsInterrupt = true;

	/**
	 * Whether this kernel supports execution order so that the UI can render placeholders for them.
	 */
	public readonly implementsExecutionOrder = true;

	/**
	 * Whether this kernel has a variable provider. See the vscode.proposed.notebookVariableProvider.d.ts
	 * proposed API for more. */
	public readonly hasVariableProvider = false;

	/**
	 * Resource roots provided by the kernel. These are added as resource roots of the notebook's
	 * back layer webview. MainThreadKernel uses the extensionLocation, but our kernels live in the
	 * main thread so we leave it blank for now.
	 */
	public readonly localResourceRoot = URI.parse('');

	private readonly _onDidChange = this._register(new Emitter<INotebookKernelChangeEvent>());

	/**
	 * An event that fires when any of the kernel's properties change.
	 */
	public readonly onDidChange = this._onDidChange.event;

	/**
	 * A map of the last queued cell execution promise, keyed by notebook URI.
	 * Each queued cell execution promise is chained to the previous one for the notebook
	 * so that cells are executed sequentially.
	 */
	private readonly _notebookExecutionSequencer = new NotebookExecutionQueue();

	/**
	 * The current pending execution, keyed by notebook URI.
	 */
	private _pendingExecutionsByNotebookUri = new ResourceMap<RuntimeNotebookCellExecution>();

	/**
	 * A map of active sessions, keyed by notebook URI.
	 */
	private _sessionsByNotebookUri = new ResourceMap<ILanguageRuntimeSession>();

	/**
	 * An event that fires when the kernel executes code.
	 */
	private readonly _didExecuteCodeEmitter = this._register(new Emitter<ILanguageRuntimeCodeExecutedEvent>());
	public onDidExecuteCode: Event<ILanguageRuntimeCodeExecutedEvent> = this._didExecuteCodeEmitter.event;

	constructor(
		public readonly runtime: ILanguageRuntimeMetadata,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@INotebookService private readonly _notebookService: INotebookService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IProgressService private readonly _progressService: IProgressService,
		@IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionService,
	) {
		super();
	}

	/** The kernel's ID. */
	get id(): string {
		// This kernel ID format is assumed by a few services and should be changed carefully.
		return `${this.extension.value}/${this.runtime.runtimeId}`;
	}

	/** The kernel's label, displayed in the UI. */
	get label(): string {
		return this.runtime.runtimeName;
	}

	/** The kernel's description, displayed in the UI. */
	get description(): string {
		return this.runtime.runtimePath;
	}

	/** The kernel's detail, displayed in the UI. */
	get detail(): string | undefined {
		return undefined;
	}

	/** Languages supported by the kernel. */
	get supportedLanguages(): string[] {
		return [this.runtime.languageId, 'raw'];
	}

	/**
	 * Execute cells for a notebook.
	 *
	 * @param notebookUri The URI of the notebook.
	 * @param cellHandles The handles of the notebook cells to execute.
	 * @returns A promise that resolves when the cells have been executed.
	 */
	async executeNotebookCellsRequest(notebookUri: URI, cellHandles: number[]): Promise<void> {
		// NOTE: This method should not throw to avoid undefined behavior in the notebook UI.
		try {
			this._logService.debug(
				`[RuntimeNotebookKernel] Executing cells: ${cellHandles.join(', ')} ` +
				`for notebook ${notebookUri.fsPath}`
			);

			// Get the notebook text model.
			const notebook = this._notebookService.getNotebookTextModel(notebookUri);
			if (!notebook) {
				// Not sure when this happens, so we're copying ExtHostNotebookKernels.$executeCells
				// and throwing.
				throw new Error(`No notebook document for '${notebookUri.fsPath}'`);
			}

			// Get the notebook's session.
			let session = this._sessionsByNotebookUri.get(notebookUri);
			if (!session) {
				// There's no active session for the notebook, start one.
				session = await this._progressService.withProgress({
					location: ProgressLocation.Notification,
					title: localize(
						"erdos.notebook.kernel.starting",
						"Starting {0} interpreter for '{1}'",
						this.label,
						notebookUri.fsPath,
					),
				}, async () => {
					return await this.selectRuntime(
						notebookUri,
						`Runtime kernel ${this.id} executed cells for notebook`,
					);
				});
			}

			// Queue the cell executions.
			const executionPromises: Promise<void>[] = [];
			for (const cellHandle of cellHandles) {
				const cell = notebook.cells.find(cell => cell.handle === cellHandle);
				if (!cell) {
					// Not sure when this happens, so we're copying ExtHostNotebookKernels.$executeCells
					// and skipping the cell.
					this._logService.warn(
						`[RuntimeNotebookKernel] Cell handle ${cellHandle} not found in notebook ` +
						`${notebookUri.fsPath}; skipping cell execution`
					);
					continue;
				}

				this._logService.trace(
					`[RuntimeNotebookKernel] Queuing cell execution ${cell.handle} ` +
					`for notebook ${notebookUri.fsPath}`
				);
				const executionPromise = this._notebookExecutionSequencer.queue(
					notebookUri,
					() => this.executeCell(cell, notebook, session),
				);
				executionPromises.push(executionPromise);
			}

			// Wait for all cell executions to end.
			await Promise.all(executionPromises);
		} catch (err) {
			this._logService.error(`Error executing cells: ${err.stack ?? err.toString()}`);
		}
	}

	/**
	 * Execute a notebook cell.
	 *
	 * @param cell The notebook cell text model.
	 * @param notebook The notebook text model.
	 * @param session
	 * @returns
	 */
	private async executeCell(
		cell: NotebookCellTextModel,
		notebook: NotebookTextModel,
		session: ILanguageRuntimeSession,
	): Promise<void> {
		this._logService.trace(`[RuntimeNotebookKernel] Executing cell: ${cell.handle}`);

		// Don't try to execute raw cells; they're often used to define metadata e.g in Quarto notebooks.
		if (cell.language === 'raw') {
			return;
		}

		const code = cell.getValue();

		// If the cell is empty, skip it.
		if (!code.trim()) {
			return;
		}

		// Get the cell execution.
		const cellExecution = this._notebookExecutionStateService.getCellExecution(cell.uri);
		if (!cellExecution) {
			throw new Error(`No execution for cell '${cell.uri.toString()}'`);
		}

		// Determine error behavior based on cell metadata tags
		const errorBehavior = this.getCellErrorBehavior(cell);

		// Create the runtime notebook cell execution.
		const execution = this._register(this._instantiationService.createInstance(
			RuntimeNotebookCellExecution, session, cellExecution, cell, notebook, errorBehavior
		));

		// Set the pending execution for the notebook.
		if (this._pendingExecutionsByNotebookUri.has(notebook.uri)) {
			this._logService.warn(`Overwriting pending execution for notebook ${notebook.uri.fsPath}`);
		}
		this._pendingExecutionsByNotebookUri.set(notebook.uri, execution);

		// Fire the event signaling code execution.
		const event: ILanguageRuntimeCodeExecutedEvent = {
			sessionId: session.sessionId,
			attribution: {
				source: CodeAttributionSource.Notebook,
				metadata: {
					notebook: notebook.uri.path,
				}
			},
			code,
			languageId: cell.language,
			runtimeName: this.runtime.runtimeName,
			errorBehavior,
			mode: RuntimeCodeExecutionMode.Interactive,
		};
		this._didExecuteCodeEmitter.fire(event);

		// Execute the code.
		try {
			session.execute(
				code,
				execution.id,
				RuntimeCodeExecutionMode.Interactive,
				errorBehavior,
			);
		} catch (err) {
			execution.error(err);
		}

		return execution.promise.finally(() => {
			// When the execution ends, remove it from the pending executions map.
			if (this._pendingExecutionsByNotebookUri.get(notebook.uri) === execution) {
				this._pendingExecutionsByNotebookUri.delete(notebook.uri);
			}
		});
	}

	/**
	 * Select a runtime for a notebook.
	 *
	 * @param notebookUri The URI of the notebook.
	 * @param source The source of the request to select the runtime, for debugging purposes.
	 * @returns A promise that resolves with the selected runtime session.
	 */
	public async selectRuntime(notebookUri: URI, source: string): Promise<ILanguageRuntimeSession> {
		// Select the runtime for the notebook.
		const session = await this.doSelectRuntime(notebookUri, source);

		// Add the session to the sessions map.
		this._sessionsByNotebookUri.set(notebookUri, session);

		const disposables = this._register(new DisposableStore());

		/** Dispose event listeners and remove the session from the map. */
		const dispose = () => {
			disposables.dispose();
			this._sessionsByNotebookUri.delete(notebookUri);
		};

		// Dispose when the session ends.
		disposables.add(session.onDidEndSession(() => {
			dispose();
		}));

		// Dispose when the session enters an exiting/exited state.
		disposables.add(session.onDidChangeRuntimeState(state => {
			if (state === RuntimeState.Exiting ||
				state === RuntimeState.Exited ||
				state === RuntimeState.Restarting ||
				state === RuntimeState.Uninitialized) {
				dispose();
			}
		}));

		return session;
	}

	/** Internal method to actually select a runtime for a notebook. */
	private async doSelectRuntime(notebookUri: URI, source: string): Promise<ILanguageRuntimeSession> {
		try {
			// Select the runtime for the notebook.
			await this._runtimeSessionService.selectRuntime(
				this.runtime.runtimeId,
				source,
				notebookUri,
			);

			// Get the new session.
			const session = this._runtimeSessionService.getNotebookSessionForNotebookUri(notebookUri);
			if (!session) {
				throw new Error(`Unexpected error, session not found after starting for notebook '${notebookUri}'`);
			}

			// If the session is still starting, wait for it to be ready.
			if (session.getRuntimeState() === RuntimeState.Starting) {
				this._logService.debug(
					`[RuntimeNotebookKernel] Waiting for session to be ready ` +
					`for notebook ${notebookUri.fsPath}`
				);
				await new Promise<void>(resolve => {
					const disposable = this._register(session.onDidChangeRuntimeState(state => {
						if (state === RuntimeState.Ready) {
							disposable.dispose();
							resolve();
						}
					}));
				});
			}

			return session;
		} catch (err) {
			// Display any errors to the user.
			this._notificationService.error(localize(
				"erdos.notebook.kernel.starting.failed",
				"Starting {0} interpreter for '{1}' failed. Reason: {2}",
				this.label,
				notebookUri.fsPath,
				err.toString(),
			));
			throw err;
		}
	}

	/**
	 * Interrupt a notebook execution.
	 *
	 * @param notebookUri The URI of the notebook.
	 * @param cellHandles The handles of the notebook cells to interrupt.
	 */
	async cancelNotebookCellExecution(notebookUri: URI, cellHandles: number[]): Promise<void> {
		this._logService.debug(`[RuntimeNotebookKernel] Interrupting notebook ${notebookUri.fsPath}`);

		// If there is a session for the notebook, interrupt it.
		const session = this._runtimeSessionService.getNotebookSessionForNotebookUri(notebookUri);
		if (session) {
			session.interrupt();
			return;
		}

		// It's possible that the session exited after the execution started.
		// We should still end the execution.
		const execution = this._pendingExecutionsByNotebookUri.get(notebookUri);
		if (!execution) {
			// It shouldn't be possible to interrupt an execution without a pending execution,
			// but there's nothing more we can do so just log a warning.
			this._logService.warn(
				`Tried to interrupt notebook ${notebookUri.fsPath} with no pending execution`
			);
			return;
		}

		// Log a warning and error the execution.
		this._logService.warn(
			`Tried to interrupt notebook ${notebookUri.fsPath} with no running session. ` +
			`Cancelling execution`
		);
		execution.error({
			name: 'No Active Session',
			message: 'There is no active session for this notebook',
		});
	}

	/**
	 * Determines the error behavior for a cell based on its metadata tags.
	 *
	 * Currently supports:
	 * - 'raises-exception': Allows execution to continue after errors
	 *
	 * To add new tags in the future:
	 * 1. Add the tag name to the switch statement below
	 * 2. Return the appropriate RuntimeErrorBehavior
	 * 3. Update the JSDoc comment above
	 *
	 * @param cell The notebook cell to check
	 * @returns The error behavior to use for this cell
	 */
	private getCellErrorBehavior(cell: NotebookCellTextModel): RuntimeErrorBehavior {
		// VS Code wraps Jupyter metadata in its own structure, hence the nested metadata.metadata
		// The inner metadata contains the actual Jupyter cell metadata including tags
		const innerMetadata = cell.metadata?.metadata;

		// Since metadata is { [key: string]: unknown }, we need to safely access and validate
		const tags = innerMetadata && typeof innerMetadata === 'object' && 'tags' in innerMetadata
			? innerMetadata.tags
			: undefined;

		// Ensure we have a valid tags array
		if (!Array.isArray(tags)) {
			return RuntimeErrorBehavior.Stop;
		}

		// Check for error-handling tags
		for (const tag of tags) {
			switch (tag) {
				case 'raises-exception':
					return RuntimeErrorBehavior.Continue;
				// Future tags can be added here. E.g.:
				// case 'some-other-tag':
				//     return RuntimeErrorBehavior.SomeOtherBehavior;
			}
		}

		// Default behavior
		return RuntimeErrorBehavior.Stop;
	}

	provideVariables(notebookUri: URI, parentId: number | undefined, kind: 'named' | 'indexed', start: number, token: CancellationToken): AsyncIterableObject<VariablesResult> {
		throw new Error('provideVariables not implemented.');
	}
}