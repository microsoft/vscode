import * as vscode from 'vscode';
import { type CredentialStore } from './credentialStore';
import { dialLog } from './logger';
import { isAbortError } from './cancel';
import { type DialModelService } from './dialModelService';

/** Prefix for {@link vscode.lm.registerEmbeddingsProvider} model IDs (used in `chat.embeddingModel`). */
export const DIAL_EMBEDDING_MODEL_PREFIX = 'dial.';

export function toEmbeddingModelId(deploymentId: string): string {
	return `${DIAL_EMBEDDING_MODEL_PREFIX}${deploymentId}`;
}

export function deploymentIdFromEmbeddingModelId(modelId: string): string | undefined {
	return modelId.startsWith(DIAL_EMBEDDING_MODEL_PREFIX)
		? modelId.slice(DIAL_EMBEDDING_MODEL_PREFIX.length)
		: undefined;
}

type EmbeddingsLm = typeof vscode.lm & {
	registerEmbeddingsProvider(
		embeddingsModel: string,
		provider: vscode.EmbeddingsProvider,
	): vscode.Disposable;
};

/**
 * Registers one {@link vscode.lm.registerEmbeddingsProvider} per DIAL embedding deployment.
 * Model IDs use the `dial.{deploymentId}` convention expected by Copilot `chat.embeddingModel`.
 */
export class DialEmbeddingsService implements vscode.Disposable {
	private readonly subs: vscode.Disposable[] = [];
	private registrations: vscode.Disposable[] = [];

	constructor(
		private readonly modelService: DialModelService,
		private readonly credentialStore: CredentialStore,
	) {
		this.subs.push(
			modelService.onDidChangeEmbeddingModels(() => {
				this.syncRegistrations();
			}),
		);
		this.syncRegistrations();
	}

	dispose(): void {
		this.clearRegistrations();
		for (const d of this.subs) {
			d.dispose();
		}
	}

	private clearRegistrations(): void {
		for (const reg of this.registrations) {
			reg.dispose();
		}
		this.registrations = [];
	}

	private syncRegistrations(): void {
		this.clearRegistrations();

		const lm = vscode.lm as EmbeddingsLm;
		if (typeof lm.registerEmbeddingsProvider !== 'function') {
			dialLog.warn(
				'vscode.lm.registerEmbeddingsProvider is unavailable — rebuild VS Code with embeddings proposed API',
			);
			return;
		}

		const deployments = this.modelService.embeddingModels;
		for (const deployment of deployments) {
			const modelId = toEmbeddingModelId(deployment.id);
			const reg = lm.registerEmbeddingsProvider(modelId, {
				provideEmbeddings: (input, token) =>
					this.provideEmbeddings(deployment.id, input, token),
			});
			this.registrations.push(reg);
			dialLog.info(`Registered embeddings provider modelId=${modelId}`);
		}

		dialLog.info(`Embeddings providers synced count=${this.registrations.length}`);
	}

	private async provideEmbeddings(
		deploymentId: string,
		input: readonly string[],
		token: vscode.CancellationToken,
	): Promise<{ values: number[] }[]> {
		if (token.isCancellationRequested) {
			throw new Error('Embeddings request cancelled');
		}

		const client = this.modelService.getDialClient();
		if (!client) {
			throw new Error('DIAL: not authenticated — run "DIAL: Login" first');
		}

		const abort = new AbortController();
		const cancelSub = token.onCancellationRequested(() => abort.abort());

		try {
			const accessToken = await this.credentialStore.ensureValidToken();
			client.updateAuthToken(accessToken);
			const results = await client.createEmbeddings(deploymentId, input, {
				signal: abort.signal,
			});
			return results.map((r) => ({ values: [...r.values] }));
		} catch (e: unknown) {
			if (isAbortError(e)) {
				throw e;
			}
			const detail = e instanceof Error ? e.message : String(e);
			dialLog.error(`Embeddings failed id=${deploymentId}`, detail);
			throw new Error(`DIAL embeddings error (${deploymentId}): ${detail}`);
		} finally {
			cancelSub.dispose();
		}
	}
}
