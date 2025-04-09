/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService } from '../../../service/types.js';
import { ProviderInstanceBase } from '../providerInstanceBase.js';
import { toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { FrontMatterDecoration } from './decorations/frontMatterDecoration.js';
import { BaseToken } from '../../../../../../../../editor/common/codecs/baseToken.js';
import { IPromptFileEditor, ProviderInstanceManagerBase } from '../providerInstanceManagerBase.js';
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
export class TextModelPromptDecorator extends ProviderInstanceBase {
	/**
	 * Currently active decorations.
	 */
	private readonly decorations: DecorationBase<BaseToken>[] = [];

	constructor(
		editor: IPromptFileEditor,
		@IPromptsService promptsService: IPromptsService,
	) {
		super(editor, promptsService);

		this.watchCursorPosition();
	}

	protected override async onPromptParserUpdate(): Promise<this> {
		await this.parser.allSettled();

		this.removeAllDecorations();
		this.addDecorations(this.parser.tokens);

		return this;
	}

	/**
	 * Watch editor cursor position and update reactive decorations accordingly.
	 */
	private watchCursorPosition(): this {
		const interval = setInterval(() => {
			const cursorPosition = this.editor.getPosition();

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

			this.changeEditorDecorations(changedDecorations);
		}, 25);

		this._register(toDisposable(() => {
			clearInterval(interval);
		}));

		return this;
	}

	/**
	 *
	 */
	private changeEditorDecorations(
		decorations: readonly TChangedDecorator[],
	): this {
		this.editor.changeDecorations((accessor) => {
			for (const decoration of decorations) {
				decoration.change(accessor);
			}
		});

		return this;
	}

	/**
	 * Add a decorations for all prompt tokens.
	 */
	private addDecorations(
		tokens: readonly BaseToken[],
	): this {
		if (tokens.length === 0) {
			return this;
		}

		this.editor.changeDecorations((accessor) => {
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

		this.editor.changeDecorations((accessor) => {
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
export class PromptDecorationsProviderInstanceManager extends ProviderInstanceManagerBase<TextModelPromptDecorator> {
	protected override get InstanceClass() {
		return TextModelPromptDecorator;
	}
}
