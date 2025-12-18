/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWebWorkerService } from '../../../../platform/webWorker/browser/webWorkerService.js';
import { WebWorkerDescriptor } from '../../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { ILocalAIService, ILocalAIGenerationOptions } from '../common/localAI.js';
import { ILocalAIInferenceWorker, LocalAIInferenceWorkerHost } from '../common/localAIWorker.protocol.js';
import { LocalAIWebGPUDetector } from './localAIWebGPUDetector.js';
import { IChatMessage } from '../../../contrib/chat/common/languageModels.js';
import { IWebWorkerClient } from '../../../../base/common/worker/webWorker.js';
import { FileAccess } from '../../../../base/common/network.js';
import { IProgressService, ProgressLocation, IProgress, IProgressStep } from '../../../../platform/progress/common/progress.js';

/**
 * Main service for local AI inference
 * Manages worker lifecycle and inference requests
 * Models are cached automatically by transformers.js using the browser's Cache API
 */
export class LocalAIService extends Disposable implements ILocalAIService {
	declare readonly _serviceBrand: undefined;

	private workerClient: IWebWorkerClient<ILocalAIInferenceWorker> | undefined;
	private workerHost: LocalAIInferenceWorkerHostImpl | undefined;
	private currentModelId: string | undefined;
	private workerInitPromise: Promise<void> | undefined;
	private streamingCallbacks: Map<string, {
		onToken: (chunk: string) => void;
		onComplete: () => void;
		onError: (error: string) => void;
	}> = new Map();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IWebWorkerService private readonly webWorkerService: IWebWorkerService,
		@IProgressService private readonly progressService: IProgressService
	) {
		super();
	}

	/**
	 * Check if WebGPU is available
	 */
	async isWebGPUAvailable(): Promise<boolean> {
		return LocalAIWebGPUDetector.isAvailable();
	}

	/**
	 * Generate text using a local model with true streaming
	 */
	async *generateText(
		modelId: string,
		messages: IChatMessage[],
		options: ILocalAIGenerationOptions,
		token: CancellationToken
	): AsyncIterable<string> {
		this.logService.info(`Generating text with model: ${modelId}`);

		// Ensure the worker is initialized with the correct model
		await this.ensureWorkerInitialized(modelId);

		if (!this.workerClient) {
			throw new Error('Worker not initialized');
		}

		const proxy = this.workerClient.proxy;
		const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

		try {
			// Set up a queue to buffer tokens from the worker
			const tokenQueue: string[] = [];
			let generationComplete = false;
			let generationError: string | undefined;
			let resolveNext: (() => void) | undefined;

			// Register callbacks for this request
			this.streamingCallbacks.set(requestId, {
				onToken: (chunk: string) => {
					tokenQueue.push(chunk);
					if (resolveNext) {
						resolveNext();
						resolveNext = undefined;
					}
				},
				onComplete: () => {
					generationComplete = true;
					if (resolveNext) {
						resolveNext();
						resolveNext = undefined;
					}
				},
				onError: (error: string) => {
					generationError = error;
					if (resolveNext) {
						resolveNext();
						resolveNext = undefined;
					}
				}
			});

			// Start generation (non-blocking)
			const generationPromise = proxy.$generateText(requestId, messages, options);

			// Yield tokens as they arrive
			while (!generationComplete && !generationError && !token.isCancellationRequested) {
				if (tokenQueue.length > 0) {
					const chunk = tokenQueue.shift()!;
					yield chunk;
				} else {
					// Wait for next token
					await new Promise<void>(resolve => {
						resolveNext = resolve;
						// Also set a timeout to prevent infinite waiting
						setTimeout(resolve, 100);
					});
				}
			}

			// Yield any remaining tokens
			while (tokenQueue.length > 0) {
				yield tokenQueue.shift()!;
			}

			// Check for errors
			if (generationError) {
				throw new Error(generationError);
			}

			// Wait for generation to fully complete
			await generationPromise;

		} catch (error) {
			this.logService.error(`Error during text generation: ${error}`);
			throw error;
		} finally {
			// Clean up callback
			this.streamingCallbacks.delete(requestId);
		}
	}

	/**
	 * Estimate tokens in text
	 */
	estimateTokens(text: string): number {
		// Simple estimation: ~4 characters per token
		return Math.ceil(text.length / 4);
	}

	/**
	 * Ensure the worker is initialized with the specified model
	 */
	private async ensureWorkerInitialized(modelId: string): Promise<void> {
		// If already initialized with the same model, return
		if (this.workerClient && this.currentModelId === modelId && this.workerInitPromise) {
			return this.workerInitPromise;
		}

		// If initialized with a different model, dispose and reinitialize
		if (this.workerClient && this.currentModelId !== modelId) {
			this.disposeWorker();
		}

		// Create worker if needed
		if (!this.workerClient) {
			this.logService.info('Creating inference worker');

			const descriptor = new WebWorkerDescriptor({
				esmModuleLocation: () => FileAccess.asBrowserUri('vs/workbench/contrib/localAI/browser/localAIInferenceWorker.js'),
				esmModuleLocationBundler: () => new URL('./localAIInferenceWorker.ts?workerModule', import.meta.url),
				label: 'Local AI Inference Worker'
			});

			this.workerClient = this._register(this.webWorkerService.createWorkerClient<ILocalAIInferenceWorker>(descriptor));

			// Set up the worker host to handle requests from worker
			this.workerHost = new LocalAIInferenceWorkerHostImpl(this.logService, this.streamingCallbacks);
			if (this.workerClient) {
				this.workerClient.setChannel(LocalAIInferenceWorkerHost.CHANNEL_NAME, this.workerHost);
			}

			// Wait a moment for the worker to fully initialize
			// The worker script needs to load and run its initialize() call
			console.log('[Main] Worker client created, waiting for worker to be ready...');
			await new Promise(resolve => setTimeout(resolve, 200));
			console.log('[Main] Wait complete, testing worker with ping...');

			// Test if the worker can receive messages
			try {
				const proxy = this.workerClient.proxy;
				console.log('[Main] Calling $ping to test communication...');
				const pongResult = await proxy.$ping();
				console.log('[Main] Ping successful! Response:', pongResult);

				// Test $ping2
				console.log('[Main] Testing $ping2...');
				const pong2Result = await (proxy as ILocalAIInferenceWorker & { $ping2(): Promise<string> }).$ping2();
				console.log('[Main] Ping2 successful! Response:', pong2Result);

			} catch (error) {
				console.error('[Main] Test failed:', error);
				throw new Error('Worker communication test failed: ' + error);
			}
		}

		// Initialize the worker with the model
		this.workerInitPromise = this.initializeWorker(modelId);
		return this.workerInitPromise;
	}

	/**
	 * Initialize the worker with a model
	 */
	private async initializeWorker(modelId: string): Promise<void> {
		if (!this.workerClient) {
			throw new Error('Worker not created');
		}

		this.logService.info(`Initializing worker with model: ${modelId}`);

		try {
			// Import the model metadata to get the HuggingFace ID
			const { LOCAL_AI_MODELS } = await import('../common/localAI.js');
			const modelMetadata = LOCAL_AI_MODELS[modelId];

			if (!modelMetadata) {
				throw new Error(`Unknown model: ${modelId}`);
			}

			const huggingFaceId = modelMetadata.huggingFaceId;
			this.logService.info(`Using HuggingFace ID: ${huggingFaceId}`);

			console.log('[Main] Getting worker proxy...');
			const proxy = this.workerClient.proxy;
			console.log('[Main] Worker proxy obtained:', proxy);
			console.log('[Main] Calling proxy.$loadModel...');

			// Show progress notification while loading
			await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: `Loading ${modelMetadata.name}`,
				cancellable: false
			}, async (progress) => {
				// Set up progress reporter on the host
				if (this.workerHost) {
					this.workerHost.setProgressReporter(progress);
				}

				try {
					// Pass both the internal ID and HuggingFace ID
					const loadPromise = proxy.$loadModel(modelId, huggingFaceId);
					console.log('[Main] $loadModel call made, waiting for promise...');

					await loadPromise;
					console.log('[Main] $loadModel completed!');

					progress.report({ message: 'Model loaded successfully!' });
				} finally {
					// Clear progress reporter
					if (this.workerHost) {
						this.workerHost.clearProgressReporter();
					}
				}
			});

			this.currentModelId = modelId;
			this.logService.info('Worker initialized successfully');
		} catch (error) {
			console.error('[Main] Error during worker initialization:', error);
			this.logService.error(`Failed to initialize worker: ${error}`);
			this.disposeWorker();
			throw error;
		}
	}

	/**
	 * Dispose the current worker
	 */
	private disposeWorker(): void {
		if (this.workerClient) {
			this.logService.info('Disposing inference worker');
			this.workerClient.dispose();
			this.workerClient = undefined;
			this.workerHost = undefined;
			this.currentModelId = undefined;
			this.workerInitPromise = undefined;
		}
	}

	override dispose(): void {
		this.disposeWorker();
		super.dispose();
	}
}

/**
 * Implementation of the worker host that handles requests from the worker
 */
class LocalAIInferenceWorkerHostImpl extends LocalAIInferenceWorkerHost {
	private progressReporter: IProgress<IProgressStep> | undefined;
	private currentPhase: 'tokenizer' | 'model' | undefined;
	private filesLoaded = new Set<string>();
	private totalFilesMap = new Map<'tokenizer' | 'model', number>();

	constructor(
		private readonly logService: ILogService,
		private readonly streamingCallbacks: Map<string, {
			onToken: (chunk: string) => void;
			onComplete: () => void;
			onError: (error: string) => void;
		}>
	) {
		super();
	}

	setProgressReporter(reporter: IProgress<IProgressStep>): void {
		this.progressReporter = reporter;
		this.filesLoaded.clear();
		this.totalFilesMap.clear();
		this.currentPhase = undefined;
	}

	clearProgressReporter(): void {
		this.progressReporter = undefined;
		this.filesLoaded.clear();
		this.totalFilesMap.clear();
		this.currentPhase = undefined;
	}

	async $logMessage(level: 'info' | 'warn' | 'error', message: string): Promise<void> {
		switch (level) {
			case 'info':
				this.logService.info(`[Worker] ${message}`);
				break;
			case 'warn':
				this.logService.warn(`[Worker] ${message}`);
				break;
			case 'error':
				this.logService.error(`[Worker] ${message}`);
				break;
		}
	}

	async $onLoadProgress(
		phase: 'tokenizer' | 'model',
		status: string,
		file?: string,
		progress?: number,
		loaded?: number,
		total?: number
	): Promise<void> {
		if (!this.progressReporter) {
			return;
		}

		// Track phase changes
		if (this.currentPhase !== phase) {
			this.currentPhase = phase;
			const phaseLabel = phase === 'tokenizer' ? 'tokenizer' : 'model';
			this.progressReporter.report({
				message: `Loading ${phaseLabel}...`
			});
		}

		// Handle different status types
		if (status === 'progress' && progress !== undefined && file) {
			// Update progress with percentage
			const fileLabel = file.split('/').pop() || file;
			this.progressReporter.report({
				message: `Loading ${phase} - ${fileLabel} (${progress.toFixed(0)}%)`,
				increment: undefined
			});
		} else if (status === 'done' && file) {
			// Mark file as loaded
			this.filesLoaded.add(`${phase}:${file}`);
		} else if (status === 'ready') {
			// All files loaded for this phase
			this.progressReporter.report({
				message: `${phase === 'tokenizer' ? 'Tokenizer' : 'Model'} loaded successfully`
			});
		}
	}

	async $onGeneratedToken(requestId: string, chunk: string): Promise<void> {
		const callbacks = this.streamingCallbacks.get(requestId);
		if (callbacks) {
			callbacks.onToken(chunk);
		}
	}

	async $onGenerationComplete(requestId: string): Promise<void> {
		const callbacks = this.streamingCallbacks.get(requestId);
		if (callbacks) {
			callbacks.onComplete();
		}
	}

	async $onGenerationError(requestId: string, error: string): Promise<void> {
		const callbacks = this.streamingCallbacks.get(requestId);
		if (callbacks) {
			callbacks.onError(error);
		}
	}
}
