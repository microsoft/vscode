/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatMessage, ChatMessageRole } from '../../../common/languageModels.js';
import { ILocalAIGenerationOptions } from './localAI.js';
import { ILocalAIInferenceWorker, LocalAIInferenceWorkerHost } from './localAIWorker.protocol.js';
import { IWebWorkerServerRequestHandler, IWebWorkerServer } from '../../../../../../base/common/worker/webWorker.js';

/**
 * Factory function to create the worker instance
 * This is called by the bootstrapWebWorker function from the Main entry point
 */
export function create(workerServer: IWebWorkerServer): IWebWorkerServerRequestHandler {
	console.log('[Worker] Worker factory called, getting host channel...');
	const host = LocalAIInferenceWorkerHost.getChannel(workerServer);
	console.log('[Worker] Host channel obtained, creating LocalAIInferenceWorker instance');
	const worker = new LocalAIInferenceWorker(host);
	console.log('[Worker] LocalAIInferenceWorker instance created');
	return worker;
}

/**
 * Web worker implementation for running inference with transformers.js
 * This runs in a separate thread to avoid blocking the UI
 */
export class LocalAIInferenceWorker implements ILocalAIInferenceWorker, IWebWorkerServerRequestHandler {
	_requestHandlerBrand: void = undefined;

	private model: unknown; // transformers.js model
	private tokenizer: unknown; // Tokenizer
	private stoppingCriteria: unknown;
	private modelId: string | undefined;
	private transformers: unknown;
	private readonly host: LocalAIInferenceWorkerHost;

	constructor(host: LocalAIInferenceWorkerHost) {
		this.host = host;
		console.log('[Worker] LocalAIInferenceWorker constructor called');

		// Log all methods on this instance
		const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(this)).filter(m => m.startsWith('$'));
		console.log('[Worker] Available $ methods on instance:', methods);
	}

	/**
	 * Test method to verify RPC communication
	 */
	async $ping(): Promise<string> {
		console.log('[Worker] $ping called!');
		await this.host.$logMessage('info', 'Ping received!');
		return 'pong';
	}

	/**
	 * Second test method added at the same location as $ping
	 */
	async $ping2(): Promise<string> {
		console.log('[Worker] $ping2 called!');
		await this.host.$logMessage('info', 'Ping2 received!');
		return 'pong2';
	}

	/**
	 * Load and initialize the worker with a specific model
	 */
	async $loadModel(modelId: string, huggingFaceId: string): Promise<string> {
		try {
			console.log('[Worker] $loadModel called with modelId:', modelId, 'huggingFaceId:', huggingFaceId);
			await this.host.$logMessage('info', `Loading model: ${modelId} (${huggingFaceId})`);

			type TransformersLib = {
				env: { allowLocalModels: boolean; allowRemoteModels: boolean; useBrowserCache: boolean };
				AutoTokenizer: { from_pretrained: (id: string, options?: unknown) => Promise<unknown> };
				AutoModelForCausalLM: { from_pretrained: (id: string, options?: unknown) => Promise<unknown> };
				InterruptableStoppingCriteria: new () => unknown;
			};
			const tf = await this.loadTransformers() as TransformersLib;

			// Configure transformers.js environment
			const env = tf.env;
			env.allowLocalModels = true;
			env.allowRemoteModels = true; // Allow downloading from HuggingFace
			env.useBrowserCache = true; // Use browser's Cache API for caching
			try {
				// Ensure the ONNX runtime assets are loaded from our local dependency
				const wasmPath = new URL('../../../../../../../../node_modules/onnxruntime-web/dist/', import.meta.url).toString();
				type TransformersEnv = { backends?: { onnx?: { wasm?: { wasmPaths?: string } } } };
				const typedEnv = env as TransformersEnv;
				typedEnv.backends ??= {};
				typedEnv.backends.onnx ??= {};
				typedEnv.backends.onnx.wasm ??= {};
				typedEnv.backends.onnx.wasm.wasmPaths = wasmPath;
			} catch {
				// Best-effort; ignore if URL resolution fails
			}

			try {
				// Load tokenizer and model using transformers.js with WebGPU
				// Let transformers.js download and cache files using its built-in mechanism
				await this.host.$logMessage('info', `[Tokenizer] Loading from: ${huggingFaceId}`);
				this.tokenizer = await tf.AutoTokenizer.from_pretrained(huggingFaceId, {
					progress_callback: async (data: { status?: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
						if (data?.status) {
							await this.host.$logMessage('info', `[Tokenizer] ${data.status}${data.file ? ` - ${data.file}` : ''}${data.progress ? ` (${data.progress.toFixed(1)}%)` : ''}`);
							await this.host.$onLoadProgress('tokenizer', data.status, data.file, data.progress, data.loaded, data.total);
						}
					}
				});

				await this.host.$logMessage('info', `[Model] Loading from: ${huggingFaceId}`);
				this.model = await tf.AutoModelForCausalLM.from_pretrained(huggingFaceId, {
					dtype: 'q4f16',
					device: 'webgpu',
					progress_callback: async (data: { status?: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
						if (data?.status) {
							await this.host.$logMessage('info', `[Model] ${data.status}${data.file ? ` - ${data.file}` : ''}${data.progress ? ` (${data.progress.toFixed(1)}%)` : ''}`);
							await this.host.$onLoadProgress('model', data.status, data.file, data.progress, data.loaded, data.total);
						}
					}
				});

				this.stoppingCriteria = new tf.InterruptableStoppingCriteria();
				this.modelId = modelId;
				await this.host.$logMessage('info', 'Transformers.js model loaded successfully with WebGPU');
				return `loaded: ${modelId}`;
			} catch (error) {
				await this.host.$logMessage('error', `Failed to initialize transformers.js: ${error}`);
				throw error;
			}
		} catch (error) {
			await this.host.$logMessage('error', `Failed to load model: ${error}`);
			throw error;
		}
	}

	/**
	 * Generate text from messages with streaming support using TextStreamer
	 * Streams tokens back to main thread via callbacks
	 */
	async $generateText(
		requestId: string,
		messages: IChatMessage[],
		options: ILocalAIGenerationOptions
	): Promise<void> {
		if (!this.model || !this.tokenizer || !this.modelId || !this.transformers) {
			await this.host.$onGenerationError(requestId, 'Worker not initialized');
			throw new Error('Worker not initialized');
		}

		try {
			await this.host.$logMessage('info', `Generating text for ${messages.length} messages`);

			const hfMessages = this.toHuggingFaceMessages(messages);

			// Inject a system prompt to encourage English reasoning.
			// We only add it if it's not already there to avoid duplicates.
			const hasSystemPrompt = hfMessages.some(m => m.role === 'system');
			if (!hasSystemPrompt) {
				hfMessages.unshift({
					role: 'system',
					content: 'You are a helpful assistant. Your internal monologue, or reasoning process, should be in English.'
				});
			}

			const inputs = await (this.tokenizer as { apply_chat_template: (msgs: unknown[], opts: unknown) => Promise<{ input_ids?: unknown[] }> }).apply_chat_template(hfMessages, {
				add_generation_prompt: true,
				return_dict: true
			});

			await this.host.$logMessage('info', `Prepared chat template with ${(inputs.input_ids as unknown[])?.length ?? 0} input tokens`);

			(this.stoppingCriteria as { reset: () => void }).reset();

			// Create TextStreamer for automatic streaming with delta support
			type TextStreamerConstructor = new (tokenizer: unknown, options: {
				skip_prompt: boolean;
				skip_special_tokens: boolean;
				callback_function: (output: string) => void;
			}) => unknown;

			const tf = this.transformers as { TextStreamer: TextStreamerConstructor };

			// Track the accumulated output to send deltas
			let lastOutput = '';

			const callback_function = (output: string) => {
				let delta = '';
				if (output.startsWith(lastOutput)) {
					// Standard case: new output is an extension of the old one.
					delta = output.substring(lastOutput.length);
					lastOutput = output;
				} else if (lastOutput.startsWith(output)) {
					// Model backtracked. Do nothing and wait for it to move forward again.
					// Don't update lastOutput.
				} else {
					// Divergence. This is tricky with a delta-only API.
					// We'll reset our state and send the entire new output.
					// This will likely cause the UI to append the new output, which might look odd.
					// A more robust solution would require the host to support replacing the entire message.
					console.warn('[Worker] Output stream diverged. This may cause display issues due to appending.');
					delta = output; // Send the entire current output
					lastOutput = output;
				}

				if (delta) {
					// Fire and forget - don't await to avoid blocking generation
					this.host.$onGeneratedToken(requestId, delta).catch(err => {
						console.error('[Worker] Error sending token:', err);
					});
				}
			};

			const streamer = new tf.TextStreamer(this.tokenizer, {
				skip_prompt: true,
				skip_special_tokens: true,
				callback_function
			});

			// Generate with streaming
			await (this.model as {
				generate: (opts: unknown) => Promise<unknown>;
			}).generate({
				...inputs,
				do_sample: true,
				temperature: options.temperature ?? 0.7,
				top_p: options.topP ?? 0.9,
				max_new_tokens: options.maxTokens ?? 512,
				return_dict_in_generate: true,
				stopping_criteria: this.stoppingCriteria,
				streamer
			});

			await this.host.$logMessage('info', 'Text generation completed');
			await this.host.$onGenerationComplete(requestId);
		} catch (error) {
			await this.host.$logMessage('error', `Failed to generate text: ${error}`);
			await this.host.$onGenerationError(requestId, String(error));
			throw error;
		}
	}

	/**
	 * Convert VS Code chat messages into Hugging Face message format
	 */
	private toHuggingFaceMessages(messages: IChatMessage[]): { role: string; content: string }[] {
		return messages.map(message => {
			let role = 'user';
			if (message.role === ChatMessageRole.System) {
				role = 'system';
			} else if (message.role === ChatMessageRole.Assistant) {
				role = 'assistant';
			}

			let content = '';
			if (typeof (message as { content?: unknown }).content !== 'undefined') {
				const messageContent = (message as { content: string | Array<{ type: string; value: string }> }).content;
				if (typeof messageContent === 'string') {
					content = messageContent;
				} else if (Array.isArray(messageContent)) {
					for (const part of messageContent) {
						if (part.type === 'text') {
							content += part.value;
						}
					}
				}
			}

			return { role, content };
		});
	}

	/**
	 * Estimate token count for text
	 * Simple estimation: ~4 characters per token
	 */
	async $estimateTokens(text: string): Promise<number> {
		return Math.ceil(text.length / 4);
	}

	/**
	 * Cleanup and dispose resources
	 */
	async $dispose(): Promise<void> {
		this.tokenizer = undefined;
		this.model = undefined;
		this.modelId = undefined;
		(this.stoppingCriteria as { reset: () => void }).reset();
	}

	/**
	 * Load transformers.js from the locally bundled dependency
	 */
	private async loadTransformers(): Promise<unknown> {
		if (this.transformers) {
			return this.transformers;
		}

		const candidates: string[] = [];
		try {
			// Try minified then unminified bundles served from the repo
			candidates.push(new URL('../../../../../../../../node_modules/@huggingface/transformers/dist/transformers.min.js', import.meta.url).toString());
			candidates.push(new URL('../../../../../../../../node_modules/@huggingface/transformers/dist/transformers.js', import.meta.url).toString());
		} catch {
			// ignore URL construction errors
		}

		let lastError: unknown;
		for (const candidate of candidates) {
			try {
				await this.host.$logMessage('info', `Attempting to import transformers.js from: ${candidate}`);
				const mod = await import(/* webpackIgnore: true */ candidate);
				this.transformers = (mod as { default?: unknown }).default ?? mod;
				return this.transformers;
			} catch (error) {
				lastError = error;
				await this.host.$logMessage('error', `Import failed from ${candidate}: ${error}`);
			}
		}

		throw lastError ?? new Error('Failed to load transformers.js');
	}
}


