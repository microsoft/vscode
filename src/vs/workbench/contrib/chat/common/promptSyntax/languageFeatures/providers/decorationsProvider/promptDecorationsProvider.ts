/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService } from '../../../service/types.js';
import { ProviderInstanceBase } from '../providerInstanceBase.js';
import { ITextModel } from '../../../../../../../../editor/common/model.js';
import { FrontMatterDecoration } from './decorations/frontMatterDecoration.js';
import { toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { ProviderInstanceManagerBase } from '../providerInstanceManagerBase.js';
import { Position } from '../../../../../../../../editor/common/core/position.js';
import { BaseToken } from '../../../../../../../../editor/common/codecs/baseToken.js';
import { registerThemingParticipant } from '../../../../../../../../platform/theme/common/themeService.js';
import { FrontMatterHeader } from '../../../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterHeader.js';
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

	protected override async onPromptParserUpdate(): Promise<this> {
		await this.parser.allSettled();

		this.removeAllDecorations();
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
	 *
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
	 * Add a decorations for all prompt tokens.
	 */
	private addDecorations(): this {
		this.model.changeDecorations((accessor) => {
			const { tokens } = this.parser;

			if (tokens.length === 0) {
				return;
			}

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
			for (const decoration of this.decorations) {
				decoration.remove(accessor);
			}

			this.decorations.splice(0);
		});

		return this;
	}

	public override dispose(): void {
		this.removeAllDecorations();

		super.dispose();
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
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
	protected override get InstanceClass() {
		return PromptDecorator;
	}
}
