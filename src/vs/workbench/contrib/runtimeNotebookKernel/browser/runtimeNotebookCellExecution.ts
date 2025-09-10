/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ILanguageRuntimeMessageError, ILanguageRuntimeMessageInput, ILanguageRuntimeMessageOutput, ILanguageRuntimeMessageOutputData, ILanguageRuntimeMessagePrompt, ILanguageRuntimeMessageState, ILanguageRuntimeMessageStream, RuntimeErrorBehavior, ILanguageRuntimeMessageUpdateOutput, RuntimeOnlineState } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { NotebookCellTextModel } from '../../notebook/common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../notebook/common/model/notebookTextModel.js';
import { IOutputItemDto } from '../../notebook/common/notebookCommon.js';
import { CellExecutionUpdateType } from '../../notebook/common/notebookExecutionService.js';
import { INotebookCellExecution } from '../../notebook/common/notebookExecutionStateService.js';

const outputIdKey = 'runtimeOutputId';

/**
 * The type of a Jupyter notebook cell output.
 *
 * @link https://jupyter-client.readthedocs.io/en/latest/messaging.html
 */
enum JupyterNotebookCellOutputType {
	/** An error occurred during an execution. */
	Error = 'error',

	/** Output from one of the standard streams (stdout or stderr). */
	Stream = 'stream',

	/** One of possibly many outputs related to an execution. */
	DisplayData = 'display_data',

	/** The result of an execution. */
	ExecuteResult = 'execute_result',
}

/**
 * Updates a wrapped INotebookCellExecution using replies to the parent language runtime message.
 */
export class RuntimeNotebookCellExecution extends Disposable {
	/**
	 * The execution ID. Only replies to this ID are handled.
	 */
	public readonly id = generateUuid();

	/**
	 * Deferred promise that resolves when the runtime execution completes,
	 * or rejects if the execution errors.
	 */
	private _deferred = new DeferredPromise<void>();

	constructor(
		private readonly _session: ILanguageRuntimeSession,
		private readonly _cellExecution: INotebookCellExecution,
		private readonly _cell: NotebookCellTextModel,
		private readonly _notebook: NotebookTextModel,
		private readonly _errorBehavior: RuntimeErrorBehavior,
		@ILogService private readonly _logService: ILogService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super();


		// Handle replies of different types.

		this._register(this._session.onDidReceiveRuntimeMessageInput(message => {
			this.handleRuntimeMessageInput(message);
		}));

		this._register(this._session.onDidReceiveRuntimeMessagePrompt(async message => {
			await this.handleRuntimeMessagePrompt(message);
		}));

		this._register(this._session.onDidReceiveRuntimeMessageOutput(message => {
			this.handleRuntimeMessageOutput(message, JupyterNotebookCellOutputType.DisplayData);
		}));

		this._register(this._session.onDidReceiveRuntimeMessageResult(message => {
			this.handleRuntimeMessageOutput(message, JupyterNotebookCellOutputType.ExecuteResult);
		}));

		this._register(this._session.onDidReceiveRuntimeMessageStream(message => {
			this.handleRuntimeMessageStream(message);
		}));

		this._register(this._session.onDidReceiveRuntimeMessageError(message => {
			this.handleRuntimeMessageError(message);
		}));

		this._register(this._session.onDidReceiveRuntimeMessageState(message => {
			this.handleRuntimeMessageState(message);
		}));

		this._register(this._session.onDidReceiveRuntimeMessageUpdateOutput(message => {
			this.handleRuntimeMessageUpdateOutput(message);
		}));

		this._cellExecution.update([{
			// Start the execution timer.
			editType: CellExecutionUpdateType.ExecutionState,
			runStartTime: Date.now(),
		}, {
			// Clear any existing outputs.
			editType: CellExecutionUpdateType.Output,
			cellHandle: this._cellExecution.cellHandle,
			outputs: [],
		}]);
	}

	/**
	 * End the execution successfully.
	 */
	public complete(): void {
		// End the cell execution successfully.
		this._cellExecution.complete({
			runEndTime: Date.now(),
			lastRunSuccess: true,
		});

		// Complete the deferred promise.
		this._deferred.complete();

		// Stop listening for replies.
		this.dispose();
	}

	/**
	 * End the execution with an error.
	 */
	public error(err: Error): void {
		// End the cell execution with the error.
		this._cellExecution.complete({
			runEndTime: Date.now(),
			lastRunSuccess: false,
			error: {
				name: err.name,
				message: err.message,
				stack: err?.stack ?? JSON.stringify(err),
				uri: this._cell.uri,
				location: undefined,
			},
		});

		// Reject the deferred promise.
		this._deferred.error(err);

		// Stop listening for replies.
		this.dispose();
	}

	private handleRuntimeMessageInput(message: ILanguageRuntimeMessageInput): void {
		// Only handle replies to this execution.
		if (message.parent_id !== this.id) {
			return;
		}

		// Update the cell's execution order.
		this._cellExecution.update([{
			editType: CellExecutionUpdateType.ExecutionState,
			executionOrder: message.execution_count,
		}]);
	}

	private async handleRuntimeMessagePrompt(message: ILanguageRuntimeMessagePrompt): Promise<void> {
		// Only handle replies to this execution.
		if (message.parent_id !== this.id) {
			return;
		}

		// Let the user input a reply.
		const reply = await this._quickInputService.input({
			password: message.password,
			prompt: message.prompt,
		});

		// Reply to the prompt.
		this._session.replyToPrompt(message.id, reply ?? '');
	}

	private handleRuntimeMessageOutput(
		message: ILanguageRuntimeMessageOutput,
		outputType: JupyterNotebookCellOutputType,
	): void {
		// Only handle replies to this execution.
		if (message.parent_id !== this.id) {
			return;
		}


		// Convert the message data entries into output items.
		const outputItems = toOutputItems(message.data);

		// If the runtime specified an output ID, update existing outputs with that ID.
		if (message.output_id) {
			this.updateOutputsById(message.output_id, outputItems);
		}

		// Append the output items to the current cell.
		this._cellExecution.update([{
			editType: CellExecutionUpdateType.Output,
			cellHandle: this._cellExecution.cellHandle,
			append: true,
			outputs: [{
				outputId: generateNotebookCellOutputId(),
				outputs: outputItems,
				metadata: { outputType, [outputIdKey]: message.output_id },
			}]
		}]);
	}

	private handleRuntimeMessageUpdateOutput(message: ILanguageRuntimeMessageUpdateOutput): void {
		// Only handle replies to this execution.
		if (message.parent_id !== this.id) {
			return;
		}

		// Convert the message data entries into output items.
		const outputItems = toOutputItems(message.data);

		// Update existing outputs with the specified output ID.
		this.updateOutputsById(message.output_id, outputItems);
	}

	/** Update all outputs with the specified ID. */
	private updateOutputsById(outputId: string, outputItems: IOutputItemDto[]): void {
		for (const cell of this._notebook.cells) {
			for (const output of cell.outputs) {
				if (output.metadata?.[outputIdKey] === outputId) {
					this._cellExecution.update([{
						editType: CellExecutionUpdateType.OutputItems,
						outputId: output.outputId,
						items: outputItems,
					}]);
				}
			}
		}
	}

	private handleRuntimeMessageStream(message: ILanguageRuntimeMessageStream): void {
		// Only handle replies to this execution.
		if (message.parent_id !== this.id) {
			return;
		}

		// Convert the runtime message into an output item.
		let mime: string;
		if (message.name === 'stdout') {
			mime = 'application/vnd.code.notebook.stdout';
		} else if (message.name === 'stderr') {
			mime = 'application/vnd.code.notebook.stderr';
		} else {
			this._logService.warn(`[NotebookRuntimeKernel] Ignoring runtime message with unknown stream name: ${message.name}`);
			return;
		}
		const newOutputItem: IOutputItemDto = { data: VSBuffer.fromString(message.text), mime };

		// If the last output has items of the same mime type (i.e. from the same stream: stdout/stderr),
		// append the new item to the last output. Otherwise, create a new output.
		const lastOutput = this._cell.outputs.at(-1);
		const lastOutputItems = lastOutput?.outputs;
		if (lastOutputItems && lastOutputItems.every(item => item.mime === mime)) {
			this._cellExecution.update([{
				editType: CellExecutionUpdateType.OutputItems,
				append: true,
				outputId: lastOutput.outputId,
				items: [newOutputItem],
			}]);
		} else {
			this._cellExecution.update([{
				editType: CellExecutionUpdateType.Output,
				cellHandle: this._cellExecution.cellHandle,
				append: true,
				outputs: [{
					outputId: generateNotebookCellOutputId(),
					outputs: [newOutputItem],
					// Set the outputType, used by by the ipynb notebook serializer
					// (extensions/ipynb/src/serializers.ts) to convert from VSCode notebook cell
					// outputs to Jupyter notebook cell outputs.
					metadata: { outputType: JupyterNotebookCellOutputType.Stream },
				}]
			}]);
		}
	}

	private handleRuntimeMessageError(message: ILanguageRuntimeMessageError): void {
		// Only handle replies to this execution.
		if (message.parent_id !== this.id) {
			return;
		}

		// Append an error output item to the cell.
		this._cellExecution.update([{
			editType: CellExecutionUpdateType.Output,
			cellHandle: this._cellExecution.cellHandle,
			append: true,
			outputs: [{
				outputId: generateNotebookCellOutputId(),
				outputs: [{
					data: VSBuffer.fromString(JSON.stringify({
						name: message.name,
						message: message.message,
						stack: message.traceback.join('\n'),
					}, undefined, '\t')),
					mime: 'application/vnd.code.notebook.error',
				}],
				// Set the outputType, used by by the ipynb notebook serializer
				// (extensions/ipynb/src/serializers.ts) to convert from VSCode notebook cell
				// outputs to Jupyter notebook cell outputs.
				metadata: { outputType: JupyterNotebookCellOutputType.Error },
			}],
		}]);

		// Handle error based on the error behavior.
		if (this._errorBehavior === RuntimeErrorBehavior.Continue) {
			// For cells with 'raises-exception' tag, complete the execution successfully
			// so that subsequent cells can continue running.
			this.complete();
		} else {
			// Default behavior: error the execution to stop subsequent cells.
			this.error({
				name: message.name,
				message: message.message,
				stack: message.traceback.join('\n'),
			});
		}
	}

	private handleRuntimeMessageState(message: ILanguageRuntimeMessageState): void {
		// Only handle replies to this execution.
		if (message.parent_id !== this.id) {
			return;
		}

		// If an idle message is received, error the execution.
		if (message.state === RuntimeOnlineState.Idle) {
			this.complete();
		}
	}

	/**
	 * The promise that resolves when the execution completes, or rejects if the execution errors.
	 */
	public get promise(): Promise<void> {
		return this._deferred.p;
	}
}

/**
 * Convert the data from a language runtime output message into Notebook output items.
 */
function toOutputItems(data: ILanguageRuntimeMessageOutputData): IOutputItemDto[] {
	const outputItems: IOutputItemDto[] = [];
	for (const [mime, value] of Object.entries(data)) {
		switch (mime) {
			case 'image/png':
			case 'image/jpeg':
				outputItems.push({ data: decodeBase64(String(value)), mime });
				break;
			// This list is a subset of src/vs/workbench/contrib/notebook/browser/view/cellParts/cellOutput.JUPYTER_RENDERER_MIMETYPES
			case 'application/geo+json':
			case 'application/vdom.v1+json':
			case 'application/vnd.dataresource+json':
			case 'application/vnd.jupyter.widget-view+json':
			case 'application/vnd.plotly.v1+json':
			case 'application/vnd.r.htmlwidget':
			case 'application/vnd.vega.v2+json':
			case 'application/vnd.vega.v3+json':
			case 'application/vnd.vega.v4+json':
			case 'application/vnd.vega.v5+json':
			case 'application/vnd.vegalite.v1+json':
			case 'application/vnd.vegalite.v2+json':
			case 'application/vnd.vegalite.v3+json':
			case 'application/vnd.vegalite.v4+json':
			case 'application/x-nteract-model-debug+json':
				// The JSON cell output item will be rendered using the appropriate notebook renderer.
				outputItems.push({ data: VSBuffer.fromString(JSON.stringify(value, undefined, '\t')), mime });
				break;
			default:
				outputItems.push({ data: VSBuffer.fromString(String(value)), mime });
		}
	}
	return outputItems;
}

/**
 * Generate a notebook cell output ID.
 *
 * NOTE: src/vs/workbench/contrib/notebook/common/notebookCommon.ts:CellUri.parseCellOutputUri
 * assumes that output IDs are generated using {@link generateUuid}. If they aren't,
 * an error will occur when opening a truncated cell output in a text editor.
 */
function generateNotebookCellOutputId(): string {
	return generateUuid();
}
