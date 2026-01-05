/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { ChatMcpAppModel } from './chatMcpAppModel.js';
import { IMcpAppRenderData } from './chatMcpAppSubPart.js';

/** Time in ms to retain a model after it's released before disposing */
const RELEASE_DELAY_MS = 100;

/**
 * Pool entry wrapping a ChatMcpAppModel with reference counting.
 */
interface McpAppPoolEntry {
	readonly model: ChatMcpAppModel;
	readonly disposables: DisposableStore;
	refCount: number;
	releaseTimeout: IDisposable | undefined;
}

/**
 * Pool that manages ChatMcpAppModel instances keyed by tool call ID.
 * Models are retained for a short period after release to handle rapid re-renders.
 */
export class McpAppWebviewPool extends Disposable {

	/** Map of tool call ID to pool entry */
	private readonly _entries = new Map<string, McpAppPoolEntry>();

	constructor(
		private readonly _container: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(toDisposable(() => {
			// Dispose all entries on pool disposal
			for (const entry of this._entries.values()) {
				entry.releaseTimeout?.dispose();
				entry.disposables.dispose();
			}
			this._entries.clear();
		}));
	}

	/**
	 * Acquires a model for the given tool invocation.
	 * Creates a new model if one doesn't exist, or returns the existing one.
	 * The model's reference count is incremented.
	 *
	 * @param toolInvocation The tool invocation to get/create a model for
	 * @param renderData The render data for creating a new model
	 * @returns The ChatMcpAppModel for this tool invocation
	 */
	public acquire(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		renderData: IMcpAppRenderData
	): ChatMcpAppModel {
		const toolCallId = toolInvocation.toolCallId;

		let entry = this._entries.get(toolCallId);

		if (entry) {
			// Cancel any pending release
			if (entry.releaseTimeout) {
				entry.releaseTimeout.dispose();
				entry.releaseTimeout = undefined;
			}
			entry.refCount++;
			return entry.model;
		}

		// Create new model
		const disposables = new DisposableStore();
		const model = disposables.add(this._instantiationService.createInstance(
			ChatMcpAppModel,
			toolInvocation,
			renderData,
			this._container
		));

		entry = {
			model,
			disposables,
			refCount: 1,
			releaseTimeout: undefined,
		};

		this._entries.set(toolCallId, entry);

		return model;
	}

	/**
	 * Releases a reference to the model for the given tool call ID.
	 * When the reference count reaches zero, the model is scheduled for disposal
	 * after a short delay to handle rapid re-renders.
	 *
	 * @param toolCallId The tool call ID to release
	 */
	public release(toolCallId: string): void {
		const entry = this._entries.get(toolCallId);
		if (!entry) {
			return;
		}

		entry.refCount--;

		if (entry.refCount <= 0) {
			// Schedule disposal after delay
			entry.releaseTimeout = disposableTimeout(() => {
				// Double-check ref count hasn't increased
				if (entry.refCount <= 0) {
					this._entries.delete(toolCallId);
					entry.disposables.dispose();
				}
			}, RELEASE_DELAY_MS);
		}
	}

	/**
	 * Gets an existing model for a tool call ID without incrementing the reference count.
	 * Returns undefined if no model exists.
	 *
	 * @param toolCallId The tool call ID to look up
	 * @returns The model if it exists, undefined otherwise
	 */
	public peek(toolCallId: string): ChatMcpAppModel | undefined {
		return this._entries.get(toolCallId)?.model;
	}
}
