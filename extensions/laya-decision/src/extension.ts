/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { LoadOptions } from './common/protocol';
import type { DecisionResult, Question } from './common/types';
import { CancellationError, forkWorker, LayaWorkerClient } from './node/layaWorkerClient';
import { DEFAULT_MODEL_MANIFEST, ensureModelDownloaded, ModelNotConfiguredError, validateModelDirectory } from './node/modelLocator';

export type { Answer, AnswerFor, ChoiceAnswer, ChoiceQuestion, DecisionResult, NoulAnswer, NoulQuestion, Question, ScoreAnswer, ScoreQuestion } from './common/types';

/**
 * API exported to other extensions through `vscode.extensions.getExtension('vscode.laya-decision').exports`.
 */
export interface LayaDecisionApi {
	/** Whether the model may currently be used (the feature is enabled and AI features are not disabled). */
	readonly isEnabled: boolean;
	/** Answers every question about `state` in one forward pass of the local decision model. */
	decide<Q extends Record<string, Question>>(state: unknown, questions: Q, token?: vscode.CancellationToken): Promise<DecisionResult<Q>>;
}

const enum Setting {
	Enabled = 'laya.enabled',
	ModelPath = 'laya.modelPath',
	MaxThreads = 'laya.maxThreads',
	IdleUnloadMinutes = 'laya.idleUnloadMinutes',
	DisableAIFeatures = 'chat.disableAIFeatures',
}

function isEnabled(): boolean {
	const configuration = vscode.workspace.getConfiguration();
	return configuration.get<boolean>(Setting.Enabled, false) && !configuration.get<boolean>(Setting.DisableAIFeatures, false);
}

function getThreadCount(): number {
	const configured = vscode.workspace.getConfiguration().get<number>(Setting.MaxThreads, 0);
	if (configured > 0) {
		return Math.floor(configured);
	}
	// Leave headroom for the editor: half of the cores, capped at 4.
	return Math.max(1, Math.min(4, Math.floor(os.availableParallelism() / 2)));
}

async function resolveModelDirectory(context: vscode.ExtensionContext, log: vscode.LogOutputChannel): Promise<string> {
	const configuredPath = vscode.workspace.getConfiguration().get<string>(Setting.ModelPath, '').trim();
	if (configuredPath) {
		const modelDir = configuredPath.startsWith('~') ? path.join(os.homedir(), configuredPath.slice(1)) : configuredPath;
		if (!path.isAbsolute(modelDir)) {
			throw new Error(vscode.l10n.t('The setting "{0}" must be an absolute path.', Setting.ModelPath));
		}
		await validateModelDirectory(modelDir);
		return modelDir;
	}

	const manifest = DEFAULT_MODEL_MANIFEST;
	if (!manifest) {
		throw new ModelNotConfiguredError();
	}

	return vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: vscode.l10n.t('Downloading Laya decision model'),
		cancellable: true,
	}, async (progress, token) => {
		const abort = new AbortController();
		const cancellation = token.onCancellationRequested(() => abort.abort());
		let reported = 0;
		try {
			const dir = await ensureModelDownloaded(manifest, context.globalStorageUri.fsPath, {
				signal: abort.signal,
				onProgress: (received, total) => {
					const percent = total > 0 ? Math.floor(received / total * 100) : 0;
					if (percent > reported) {
						progress.report({ increment: percent - reported });
						reported = percent;
					}
				},
			});
			log.info(`Model bundle ${manifest.id} is available at ${dir}.`);
			return dir;
		} finally {
			cancellation.dispose();
		}
	});
}

export function activate(context: vscode.ExtensionContext): LayaDecisionApi {
	const log = vscode.window.createOutputChannel(vscode.l10n.t('Laya Decision Model'), { log: true });
	context.subscriptions.push(log);

	const client = new LayaWorkerClient({
		spawnWorker: () => forkWorker(context.asAbsolutePath(path.join('dist', 'worker.js')), message => log.info(message)),
		resolveLoadOptions: async (): Promise<LoadOptions> => ({
			modelDir: await resolveModelDirectory(context, log),
			intraOpNumThreads: getThreadCount(),
		}),
		idleTimeoutMs: () => Math.max(0, vscode.workspace.getConfiguration().get<number>(Setting.IdleUnloadMinutes, 5)) * 60_000,
		log: message => log.info(message),
	});
	context.subscriptions.push({ dispose: () => client.dispose() });

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (!isEnabled() || e.affectsConfiguration(Setting.ModelPath) || e.affectsConfiguration(Setting.MaxThreads)) {
			// Reload with the new settings on the next request, or free memory if disabled.
			client.unload();
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('laya.showStatus', () => {
		const status = client.status;
		const state = status.state === 'loaded'
			? vscode.l10n.t('Loaded')
			: status.state === 'loading' ? vscode.l10n.t('Loading') : vscode.l10n.t('Not loaded');
		const details = [
			vscode.l10n.t('Model: {0}', status.modelDir ?? vscode.l10n.t('(not resolved)')),
			vscode.l10n.t('Load time: {0}', status.loadTimeMs === undefined ? '-' : `${Math.round(status.loadTimeMs)} ms`),
			vscode.l10n.t('Last decision: {0}', status.lastInferenceTimeMs === undefined ? '-' : `${Math.round(status.lastInferenceTimeMs)} ms`),
			vscode.l10n.t('Decisions: {0}', status.requestCount),
			vscode.l10n.t('Threads: {0}', getThreadCount()),
		].join('\n');
		vscode.window.showInformationMessage(vscode.l10n.t('Laya decision model: {0}', state), { modal: true, detail: details });
	}));

	context.subscriptions.push(vscode.commands.registerCommand('laya.unloadModel', () => {
		client.unload();
	}));

	return {
		get isEnabled() {
			return isEnabled();
		},
		decide: async (state, questions, token) => {
			if (!isEnabled()) {
				throw new Error(vscode.l10n.t('The Laya decision model is disabled. Enable the "{0}" setting to use it.', Setting.Enabled));
			}
			try {
				return await client.decide(state, questions, token);
			} catch (error) {
				if (error instanceof CancellationError) {
					throw new vscode.CancellationError();
				}
				log.error(error instanceof Error ? error : String(error));
				throw error;
			}
		},
	};
}

export function deactivate(): void { }
