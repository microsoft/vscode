/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IframeEmbeddedEditorProvider, VirtualizedIframeEmbeddedEditorFactory, VirtualizedIframeEmbeddedEditorOptions } from '@vscode/markdown-editor/web-editors';

export class LazyCodeBlockEditorFactory implements CodeBlockEditorFactory {
	#providers: readonly IframeEmbeddedEditorProvider[];
	#factory: CodeBlockEditorFactory | undefined;
	#loadStarted = false;
	#disposed = false;
	readonly #options: VirtualizedIframeEmbeddedEditorOptions;
	readonly #load: () => Promise<(options: VirtualizedIframeEmbeddedEditorOptions) => CodeBlockEditorFactory>;
	readonly #onError: (error: unknown) => void;

	constructor(
		options: VirtualizedIframeEmbeddedEditorOptions,
		load: () => Promise<(options: VirtualizedIframeEmbeddedEditorOptions) => CodeBlockEditorFactory>,
		onError: (error: unknown) => void,
	) {
		this.#providers = options.providers;
		this.#options = options;
		this.#load = load;
		this.#onError = onError;
	}

	create(...args: Parameters<CodeBlockEditorFactory['create']>): ReturnType<CodeBlockEditorFactory['create']> {
		if (this.#disposed) {
			return undefined;
		}
		if (this.#factory) {
			return this.#factory.create(...args);
		}
		// Leave provider selection to the adapter; load only when a block and providers both exist.
		if (this.#providers.length && !this.#loadStarted) {
			this.#loadStarted = true;
			void this.#loadFactory();
		}
		return undefined;
	}

	updateProviders(providers: readonly IframeEmbeddedEditorProvider[]): void {
		if (this.#disposed) {
			return;
		}
		this.#providers = providers;
		if (this.#factory) {
			this.#factory.updateProviders(providers);
		} else {
			this.#options.onDidChange?.();
		}
	}

	dispose(): void {
		if (this.#disposed) {
			return;
		}
		this.#disposed = true;
		this.#factory?.dispose();
		this.#factory = undefined;
	}

	async #loadFactory(): Promise<void> {
		try {
			const createFactory = await this.#load();
			if (this.#disposed) {
				return;
			}
			this.#factory = createFactory({ ...this.#options, providers: this.#providers });
			this.#options.onDidChange?.();
		} catch (error) {
			if (!this.#disposed) {
				this.#onError(error);
			}
		}
	}
}

type CodeBlockEditorFactory = Pick<VirtualizedIframeEmbeddedEditorFactory, 'create' | 'updateProviders' | 'dispose'>;
