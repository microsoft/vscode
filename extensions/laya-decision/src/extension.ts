/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Worker } from 'node:worker_threads';
import { appendFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import type { Question, SystemOneResult } from '@receptron/laya';

interface WorkerRequest {
	readonly type: 'decide';
	readonly id: number;
	readonly state: unknown;
	readonly questions: Record<string, Question>;
	readonly cacheDir: string;
	readonly modelDir?: string;
}

interface WorkerResult {
	readonly type: 'result';
	readonly id: number;
	readonly result: SystemOneResult<Record<string, Question>>;
	readonly metrics: LayaPerformanceMetrics;
}

interface WorkerFailure {
	readonly type: 'error';
	readonly id: number;
	readonly message: string;
}

interface WorkerProgress {
	readonly type: 'progress';
	readonly id: number;
	readonly file: string;
	readonly received: number;
	readonly total?: number;
}

type WorkerResponse = WorkerResult | WorkerFailure | WorkerProgress;

interface PendingRequest {
	readonly resolve: (response: LayaDecisionResponse) => void;
	readonly reject: (error: Error) => void;
	readonly progress?: (progress: WorkerProgress) => void;
}

interface ResourceSnapshot {
	readonly timestamp: string;
	readonly rssBytes: number;
	readonly heapUsedBytes: number;
	readonly externalBytes: number;
	readonly arrayBuffersBytes: number;
	readonly systemFreeMemoryBytes: number;
	readonly systemTotalMemoryBytes: number;
	readonly systemLoadAverage: number[];
	readonly systemCpuTimes: {
		readonly idleMs: number;
		readonly totalMs: number;
	};
}

interface LayaPerformanceMetrics {
	readonly executionProvider: 'cpu';
	readonly gpuUsed: false;
	readonly modelWasLoaded: boolean;
	readonly modelLoadMs: number;
	readonly inferenceMs: number;
	readonly totalMs: number;
	readonly cpuUserMs: number;
	readonly cpuSystemMs: number;
	readonly systemCpuUtilizationPercent: number;
	readonly rssDeltaBytes: number;
	readonly systemFreeMemoryDeltaBytes: number;
	readonly before: ResourceSnapshot;
	readonly afterLoad: ResourceSnapshot;
	readonly afterInference: ResourceSnapshot;
}

interface LayaDecisionResponse {
	readonly result: SystemOneResult<Record<string, Question>>;
	readonly metrics: LayaPerformanceMetrics;
}

export interface LayaDecisionModelApi {
	decide<Q extends Record<string, Question>>(state: unknown, questions: Q): Promise<SystemOneResult<Q>>;
	unload(): Promise<void>;
}

export interface ModelRoutingRequest {
	readonly prompt: string;
	readonly routes?: Record<string, string>;
}

const defaultRoutes: Record<string, string> = {
	fast: 'Routine requests, simple edits, formatting, summarization, or short factual answers where latency and cost matter most.',
	balanced: 'Requests needing moderate reasoning, several related edits, or a balance of capability, latency, and cost.',
	capable: 'Complex planning, deep reasoning, unfamiliar code, broad changes, or tasks where quality matters more than latency or cost.',
};

const chatModels: Record<string, string> = {
	'GPT Astra': 'The most capable model. Use for complex planning, deep reasoning, unfamiliar code, broad changes, or tasks where quality matters more than latency or cost.',
	'GPT Sol': 'The balanced model. Use for requests needing moderate reasoning, several related edits, or a balance of capability, latency, and cost.',
	'GPT Luna': 'The fastest and least expensive model. Use for routine requests, simple localized edits, formatting, summarization, or short factual answers.',
};

const reasoningLevels: Record<string, string> = {
	minimal: 'Little or no deliberate reasoning. Use for mechanical, obvious, or highly constrained requests.',
	low: 'Brief reasoning. Use for straightforward requests with a small number of decisions.',
	medium: 'Moderate reasoning. Use for multi-step requests, ambiguity, or changes spanning several related areas.',
	high: 'Substantial reasoning. Use for complex architecture, debugging, planning, or broad changes.',
	xhigh: 'Maximum practical reasoning. Reserve for exceptionally difficult, high-risk, or deeply ambiguous requests.',
};

class LayaWorker implements vscode.Disposable {
	private worker: Worker | undefined;
	private requestId = 0;
	private readonly pendingRequests = new Map<number, PendingRequest>();

	constructor(
		private readonly context: vscode.ExtensionContext,
	) { }

	decide(
		state: unknown,
		questions: Record<string, Question>,
		progress?: (progress: WorkerProgress) => void,
	): Promise<LayaDecisionResponse> {
		const worker = this.getWorker();
		const id = ++this.requestId;
		const result = new Promise<LayaDecisionResponse>((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject, progress });
		});
		const modelDir = process.env['LAYA_MODEL_DIR'];
		worker.postMessage({
			type: 'decide',
			id,
			state,
			questions,
			cacheDir: this.context.globalStorageUri.fsPath,
			...(modelDir ? { modelDir } : {}),
		} satisfies WorkerRequest);
		return result;
	}

	async unload(): Promise<void> {
		const worker = this.worker;
		this.worker = undefined;
		if (worker) {
			await worker.terminate();
		}
		this.rejectPendingRequests(new Error(vscode.l10n.t('The Laya decision model was unloaded.')));
	}

	dispose(): void {
		void this.unload();
	}

	private getWorker(): Worker {
		if (this.worker) {
			return this.worker;
		}

		const outputDirectory = this.context.extension.packageJSON.main.includes('/dist/') ? 'dist' : 'out';
		const worker = new Worker(vscode.Uri.joinPath(this.context.extensionUri, outputDirectory, 'worker.mjs').fsPath);
		worker.on('message', (message: WorkerResponse) => this.handleMessage(message));
		worker.on('error', error => this.handleWorkerFailure(error));
		worker.on('exit', code => {
			if (this.worker === worker) {
				this.worker = undefined;
			}
			if (code !== 0) {
				this.rejectPendingRequests(new Error(vscode.l10n.t('The Laya worker exited with code {0}.', code)));
			}
		});
		this.worker = worker;
		return worker;
	}

	private handleMessage(message: WorkerResponse): void {
		const pendingRequest = this.pendingRequests.get(message.id);
		if (!pendingRequest) {
			return;
		}
		if (message.type === 'progress') {
			pendingRequest.progress?.(message);
			return;
		}

		this.pendingRequests.delete(message.id);
		if (message.type === 'error') {
			pendingRequest.reject(new Error(message.message));
		} else {
			pendingRequest.resolve({ result: message.result, metrics: message.metrics });
		}
	}

	private handleWorkerFailure(error: Error): void {
		this.worker = undefined;
		this.rejectPendingRequests(error);
	}

	private rejectPendingRequests(error: Error): void {
		for (const pendingRequest of this.pendingRequests.values()) {
			pendingRequest.reject(error);
		}
		this.pendingRequests.clear();
	}
}

export function activate(context: vscode.ExtensionContext): LayaDecisionModelApi {
	const worker = new LayaWorker(context);
	const output = vscode.window.createOutputChannel(vscode.l10n.t('Laya Decision Model'));
	const metricsUri = vscode.Uri.joinPath(context.globalStorageUri, 'performance.jsonl');
	context.subscriptions.push(worker, output);

	const decide = async <Q extends Record<string, Question>>(state: unknown, questions: Q): Promise<SystemOneResult<Q>> => {
		const response = await worker.decide(state, questions);
		return response.result as SystemOneResult<Q>;
	};

	const decideWithProgress = async <Q extends Record<string, Question>>(prompt: string, questions: Q): Promise<{ result: SystemOneResult<Q>; metrics: LayaPerformanceMetrics }> => {
		return vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: vscode.l10n.t('Running the Laya decision model'),
		}, async progress => {
			return worker.decide(prompt, questions, update => {
				const percentage = update.total ? Math.round(update.received / update.total * 100) : undefined;
				progress.report({
					message: percentage === undefined
						? vscode.l10n.t('Downloading {0}', update.file)
						: vscode.l10n.t('Downloading {0} ({1}%)', update.file, percentage),
				});
			}) as Promise<{ result: SystemOneResult<Q>; metrics: LayaPerformanceMetrics }>;
		});
	};

	const recordMetrics = async (command: string, prompt: string, recommendation: object, metrics: LayaPerformanceMetrics): Promise<void> => {
		await vscode.workspace.fs.createDirectory(context.globalStorageUri);
		await appendFile(metricsUri.fsPath, `${JSON.stringify({
			timestamp: new Date().toISOString(),
			command,
			promptLength: prompt.length,
			recommendation,
			metrics,
		})}\n`, 'utf8');
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('layaDecisionModel.route', async (request?: ModelRoutingRequest) => {
			const prompt = request?.prompt ?? await vscode.window.showInputBox({
				title: vscode.l10n.t('Laya Model Routing Prototype'),
				prompt: vscode.l10n.t('Enter a request to route'),
				placeHolder: vscode.l10n.t('For example: Refactor the authentication service and update its callers'),
			});
			if (!prompt) {
				return;
			}

			const routes = request?.routes ?? defaultRoutes;
			const response = await decideWithProgress(prompt, {
				route: {
					type: 'choice',
					instructions: 'Which model route should handle this request? Prefer the fastest and least expensive route that can reliably complete it.',
					criteria: routes,
				},
			});
			const { result, metrics } = response;

			const answer = result.answers.route;
			if (answer.type !== 'choice') {
				throw new Error(vscode.l10n.t('Laya returned an unexpected answer type.'));
			}
			await recordMetrics('layaDecisionModel.route', prompt, { route: answer.choice }, metrics);

			output.clear();
			output.appendLine(JSON.stringify({ prompt, routes, result, metrics, metricsFile: metricsUri.fsPath }, undefined, 2));
			const showDetails = vscode.l10n.t('Show Details');
			const selection = await vscode.window.showInformationMessage(
				vscode.l10n.t('Laya selected route "{0}" with {1}% confidence.', answer.choice, Math.round(answer.confidence * 100)),
				showDetails,
			);
			if (selection === showDetails) {
				output.show();
			}
			return answer;
		}),
		vscode.commands.registerCommand('_layaDecisionModel.routeChatInput', async (prompt: string) => {
			const response = await decideWithProgress(prompt, {
				model: {
					type: 'choice',
					instructions: 'Which model should run this prompt? Prefer the fastest and least expensive model that can reliably complete the request.',
					criteria: chatModels,
				},
				reasoning: {
					type: 'choice',
					instructions: 'What is the minimum reasoning level needed to reliably complete this prompt?',
					criteria: reasoningLevels,
				},
			});
			const { result, metrics } = response;
			const model = result.answers.model;
			const reasoning = result.answers.reasoning;
			if (model.type !== 'choice' || reasoning.type !== 'choice') {
				throw new Error(vscode.l10n.t('Laya returned an unexpected answer type.'));
			}
			await recordMetrics('_layaDecisionModel.routeChatInput', prompt, {
				model: model.choice,
				reasoning: reasoning.choice,
			}, metrics);

			output.clear();
			output.appendLine(JSON.stringify({ prompt, models: chatModels, reasoningLevels, result, metrics, metricsFile: metricsUri.fsPath }, undefined, 2));
			const showDetails = vscode.l10n.t('Show Details');
			const openMetrics = vscode.l10n.t('Open Metrics');
			const selection = await vscode.window.showInformationMessage(
				vscode.l10n.t('Laya recommends {0} with {1} reasoning.', model.choice, reasoning.choice),
				showDetails,
				openMetrics,
			);
			if (selection === showDetails) {
				output.show();
			} else if (selection === openMetrics) {
				await vscode.commands.executeCommand('vscode.open', metricsUri);
			}
			return {
				model: model.choice,
				reasoning: reasoning.choice,
			};
		}),
		vscode.commands.registerCommand('layaDecisionModel.unload', async () => {
			await worker.unload();
			void vscode.window.showInformationMessage(vscode.l10n.t('The Laya decision model was unloaded.'));
		}),
	);

	return {
		decide,
		unload: () => worker.unload(),
	};
}

export function deactivate(): void { }
