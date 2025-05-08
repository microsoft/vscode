/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService } from '../../../../service/types.js';
import { ProviderInstanceBase } from '../providerInstanceBase.js';
import { ITextModel } from '../../../../../../../../../editor/common/model.js';
import { FrontMatterDecoration } from './decorations/frontMatterDecoration.js';
import { toDisposable } from '../../../../../../../../../base/common/lifecycle.js';
import { Position } from '../../../../../../../../../editor/common/core/position.js';
import { BaseToken } from '../../../../../../../../../editor/common/codecs/baseToken.js';
import { ProviderInstanceManagerBase, TProviderClass } from '../providerInstanceManagerBase.js';
import { registerThemingParticipant } from '../../../../../../../../../platform/theme/common/themeService.js';
import { FrontMatterHeader } from '../../../../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterHeader.js';
import { DecorationBase, ReactiveDecorationBase, type TDecorationClass, type TChangedDecorator } from './decorations/utils/index.js';

/**
 * Prompt tokens that are decorated by this provider.
 */
type TDecoratedToken = FrontMatterHeader;

/**
 * List of all supported decorations.
 */
const SUPPORTED_DECORATIONS: readonly TDecorationClass<TDecoratedToken>[] = Object.freeze([
	FrontMatterDecoration,
]);

/**
 * Prompt syntax decorations provider for text models.
 */
export class PromptDecorator extends ProviderInstanceBase {
	/**
	 * Currently active decorations.
	 */
	private readonly decorations: DecorationBase<BaseToken>[] = [];

	constructor(
		model: ITextModel,
		@IPromptsService promptsService: IPromptsService,
	) {
		super(model, promptsService);

		this.watchCursorPosition();
	}

	protected override onPromptSettled(
		_error?: Error,
	): this {
		// by the time the promise above completes, either this object
		// or the text model might be already has been disposed
		if (this.disposed || this.model.isDisposed()) {
			return this;
		}

		this.addDecorations();

		return this;
	}

	/**
	 * Get the current cursor position inside an active editor.
	 * Note! Currently not implemented because the provider is disabled, and
	 *       we need to do some refactoring to get accurate cursor position.
	 */
	private get cursorPosition(): Position | null {
		if (this.model.isDisposed()) {
			return null;
		}

		return null;
	}

	/**
	 * Watch editor cursor position and update reactive decorations accordingly.
	 */
	private watchCursorPosition(): this {
		const interval = setInterval(() => {
			const { cursorPosition } = this;

			const changedDecorations: TChangedDecorator[] = [];
			for (const decoration of this.decorations) {
				if ((decoration instanceof ReactiveDecorationBase) === false) {
					continue;
				}

				if (decoration.setCursorPosition(cursorPosition) === true) {
					changedDecorations.push(decoration);
				}
			}

			if (changedDecorations.length === 0) {
				return;
			}

			this.changeModelDecorations(changedDecorations);
		}, 25);

		this._register(toDisposable(() => {
			clearInterval(interval);
		}));

		return this;
	}

	/**
	 * Update existing decorations.
	 */
	private changeModelDecorations(
		decorations: readonly TChangedDecorator[],
	): this {
		this.model.changeDecorations((accessor) => {
			for (const decoration of decorations) {
				decoration.change(accessor);
			}
		});

		return this;
	}

	/**
	 * Add decorations for all prompt tokens.
	 */
	private addDecorations(): this {
		this.model.changeDecorations((accessor) => {
			const { tokens } = this.parser;

			// remove all existing decorations
			for (const decoration of this.decorations.splice(0)) {
				decoration.remove(accessor);
			}

			// then add new decorations based on the current tokens
			for (const token of tokens) {
				for (const Decoration of SUPPORTED_DECORATIONS) {
					if (Decoration.handles(token) === false) {
						continue;
					}

					this.decorations.push(
						new Decoration(accessor, token),
					);
					break;
				}
			}
		});

		return this;
	}

	/**
	 * Remove all existing decorations.
	 */
	private removeAllDecorations(): this {
		if (this.decorations.length === 0) {
			return this;
		}

		this.model.changeDecorations((accessor) => {
			for (const decoration of this.decorations.splice(0)) {
				decoration.remove(accessor);
			}
		});

		return this;
	}

	public override dispose(): void {
		if (this.disposed) {
			return;
		}

		this.removeAllDecorations();
		super.dispose();
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString(): string {
		return `text-model-prompt-decorator:${this.model.uri.path}`;
	}
}

/**
 * Register CSS styles of the supported decorations.
 */
registerThemingParticipant((_theme, collector) => {
	for (const Decoration of SUPPORTED_DECORATIONS) {
		for (const [className, styles] of Object.entries(Decoration.cssStyles)) {
			collector.addRule(`.monaco-editor ${className} { ${styles.join(' ')} }`);
		}
	}
});

/**
 * Provider for prompt syntax decorators on text models.
 */
export class PromptDecorationsProviderInstanceManager extends ProviderInstanceManagerBase<PromptDecorator> {
	protected override get InstanceClass(): TProviderClass<PromptDecorator> {
		return PromptDecorator;
	}
}
