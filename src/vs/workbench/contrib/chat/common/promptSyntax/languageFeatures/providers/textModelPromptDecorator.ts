/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { ProviderInstanceBase } from './providerInstanceBase.js';
import { chatSlashCommandBackground } from '../../../chatColors.js';
import { Color, RGBA } from '../../../../../../../base/common/color.js';
import { IRange } from '../../../../../../../editor/common/core/range.js';
import { ProviderInstanceManagerBase } from './providerInstanceManagerBase.js';
import { BaseToken } from '../../../../../../../editor/common/codecs/baseToken.js';
import { TrackedRangeStickiness } from '../../../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../../../editor/common/model/textModel.js';
import { IMarkdownString, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { contrastBorder, registerColor } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { IColorTheme, ICssStyleCollector, registerThemingParticipant } from '../../../../../../../platform/theme/common/themeService.js';
import { FrontMatterHeaderToken } from '../../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterHeaderToken.js';

/**
 * TODO: @legomushroom - list
 * - add active/inactive logic for front matter header
 */

/**
 * Decoration object.
 */
export interface ITextModelDecoration {
	/**
	 * Range of the decoration.
	 */
	range: IRange;

	/**
	 * Associated decoration options.
	 */
	options: ModelDecorationOptions;
}

/**
 * Decoration CSS class names.
 */
export enum DecorationClassNames {
	/**
	 * CSS class name for `default` prompt syntax decoration.
	 */
	default = 'prompt-decoration',

	/**
	 * CSS class name for `reference` prompt syntax decoration.
	 */
	reference = 'prompt-reference',

	/**
	 * TODO: @legomushroom
	 */
	frontMatterHeader = 'prompt-front-matter-header',
	frontMatterHeaderInlineInactive = 'prompt-front-matter-header-inline-inactive',
	frontMatterHeaderInlineActive = 'prompt-front-matter-header-inline-active',
}

/**
 * Decoration CSS class name modifiers.
 */
export enum DecorationClassNameModifiers {
	/**
	 * CSS class name for `warning` modifier.
	 */
	warning = 'squiggly-warning',

	/**
	 * CSS class name for `error` modifier.
	 */
	error = 'squiggly-error', // TODO: @legomushroom - use "markers" instead?
}

/**
 * Prompt syntax decorations provider for text models.
 */
export class TextModelPromptDecorator extends ProviderInstanceBase {
	/**
	 * List of IDs of registered text model decorations.
	 */
	private readonly registeredDecorationIDs: string[] = [];

	/**
	 * Handler for the prompt parser update event.
	 */
	protected override async onPromptParserUpdate(): Promise<this> {
		// TODO: @legomushroom - update existing decorations instead of always recreating them every time
		this.removeAllDecorations();
		this.addDecorations();

		return this;
	}

	/**
	 * Add a decorations for all prompt tokens.
	 */
	private addDecorations(): this {
		this.editor.changeDecorations((accessor) => {
			for (const decoration of this.decorations) {
				const decorationID = accessor.addDecoration(
					decoration.range,
					decoration.options,
				);

				this.registeredDecorationIDs.push(decorationID);
			}
		});

		return this;
	}

	/**
	 * Get decorations for all currently available prompt tokens.
	 */
	private get decorations(): readonly ITextModelDecoration[] {
		const result: ITextModelDecoration[] = [];
		const { tokens } = this.parser;

		for (const token of tokens) {
			const { range } = token;

			result.push({
				range,
				options: this.getDecorationFor(token),
			});
		}

		return result;
	}

	/**
	 * Get decoration options for a provided prompt reference.
	 */
	private getDecorationFor(token: BaseToken): ModelDecorationOptions {
		const isWholeLine = (token instanceof FrontMatterHeaderToken);

		return ModelDecorationOptions.createDynamic({
			description: this.getDecorationDescription(token),
			className: this.getCssClassNameFor(token),
			inlineClassName: this.getInlineCssClassNameFor(token),
			hoverMessage: this.getHoverMessageFor(token),
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			shouldFillLineOnLineBreak: true,
			isWholeLine,
		});
	}

	/**
	 * Get decoration description for a provided prompt reference.
	 */
	private getDecorationDescription(_token: BaseToken): string {
		// TODO: @legomushroom
		return 'Prompt token decoration.';
	}

	/**
	 * Get CSS class names for a provided prompt reference.
	 */
	private getCssClassNameFor(token: BaseToken): string {
		if (token instanceof FrontMatterHeaderToken) {
			return DecorationClassNames.frontMatterHeader;
		}

		return DecorationClassNames.default;
		// if (token.type === 'file') {
		// 	const mainClassName = DecorationClassNames.reference;

		// 	const { topError } = token;
		// 	if (!topError) {
		// 		return mainClassName;
		// 	}

		// 	const { isRootError } = topError;
		// 	const classNameModifier = (isRootError)
		// 		? DecorationClassNameModifiers.error
		// 		: DecorationClassNameModifiers.warning;

		// 	return `${mainClassName} ${classNameModifier}`;
		// }

		// assertNever(
		// 	token.type,
		// 	`Failed to get CSS class name for unknown token type: '${token.type}'.`,
		// );
	}

	private getInlineCssClassNameFor(token: BaseToken): string {
		if (token instanceof FrontMatterHeaderToken) {
			return DecorationClassNames.frontMatterHeaderInlineInactive;
		}

		return DecorationClassNames.default;
		// if (token.type === 'file') {
		// 	const mainClassName = DecorationClassNames.reference;

		// 	const { topError } = token;
		// 	if (!topError) {
		// 		return mainClassName;
		// 	}

		// 	const { isRootError } = topError;
		// 	const classNameModifier = (isRootError)
		// 		? DecorationClassNameModifiers.error
		// 		: DecorationClassNameModifiers.warning;

		// 	return `${mainClassName} ${classNameModifier}`;
		// }

		// assertNever(
		// 	token.type,
		// 	`Failed to get CSS class name for unknown token type: '${token.type}'.`,
		// );
	}

	/**
	 * Get decoration hover message for a provided prompt reference.
	 */
	private getHoverMessageFor(token: BaseToken): IMarkdownString[] {
		if (token instanceof FrontMatterHeaderToken) {
			return [new MarkdownString('Front Matter header')];
		}

		// TODO: @legomushroom
		return [];
		// if (token.type === 'file') {
		// 	const result = [
		// 		new MarkdownString(basename(token.uri.path)),
		// 	];

		// 	const { topError } = token;
		// 	if (!topError) {
		// 		return result;
		// 	}

		// 	const { message, isRootError } = topError;
		// 	const errorCaption = (!isRootError)
		// 		? localize('warning', "Warning")
		// 		: localize('error', "Error");

		// 	result.push(new MarkdownString(`[${errorCaption}]: ${message}`));

		// 	return result;
		// }

		// assertNever(
		// 	token.type,
		// 	`Failed to create prompt token hover message, unexpected token type: '${token.type}'.`,
		// );
	}

	/**
	 * Remove all existing decorations.
	 */
	private removeAllDecorations(): this {
		this.editor.changeDecorations((accessor) => {
			for (const decoration of this.registeredDecorationIDs) {
				accessor.removeDecoration(decoration);
			}
		});
		this.registeredDecorationIDs.splice(0);

		return this;
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		return `text-model-prompt-decorator:${this.model.uri.path}`;
	}

	/**
	 * @inheritdoc
	 */
	public override dispose(): void {
		this.removeAllDecorations();
		super.dispose();
	}
}

/**
 * Register CSS styles.
 */
registerThemingParticipant((theme, collector) => {
	const styles = ['border-radius: 3px;'];

	const backgroundColor = theme.getColor(chatSlashCommandBackground);
	if (backgroundColor) {
		styles.push(`background-color: ${backgroundColor};`);
	}

	// TODO: @legomushroom
	// const color = theme.getColor(chatSlashCommandForeground);
	// if (color) {
	// 	styles.push(`color: ${color};`);
	// }

	const defaultCssSelector = `.monaco-editor .${DecorationClassNames.default}`;
	collector.addRule(
		`${defaultCssSelector} { ${styles.join(' ')} }`,
	);

	registerFrontMatterStyles(theme, collector);
});

/**
 * TODO: @legomushroom
 */
const frontMatterHeaderBackgroundColor = registerColor(
	'chat.prompt.frontMatterBackground',
	{ dark: new Color(new RGBA(0, 0, 0, 0.20)), light: new Color(new RGBA(0, 0, 0, 0.10)), hcDark: contrastBorder, hcLight: contrastBorder, },
	localize('chat.prompt.frontMatterBackground', "background color of a Front Matter header block."),
);

/**
 * TODO: @legomushroom
 */
const registerFrontMatterStyles = (
	theme: IColorTheme,
	collector: ICssStyleCollector,
) => {
	const styles = [];
	styles.push(
		`background-color: ${theme.getColor(frontMatterHeaderBackgroundColor)};`,
	);

	const frontMatterHeaderCssSelector = `.monaco-editor .${DecorationClassNames.frontMatterHeader}`;
	collector.addRule(
		`${frontMatterHeaderCssSelector} { ${styles.join(' ')} }`,
	);

	const inlineInactiveStyles = [];
	inlineInactiveStyles.push('color: var(--vscode-disabledForeground);');

	const inlineActiveStyles = [];
	inlineActiveStyles.push('color: var(--vscode-foreground);');

	const frontMatterHeaderInlineActiveCssSelector = `.monaco-editor .${DecorationClassNames.frontMatterHeaderInlineActive}`;
	collector.addRule(
		`${frontMatterHeaderInlineActiveCssSelector} { ${inlineActiveStyles.join(' ')} }`,
	);

	const frontMatterHeaderInlineInactiveCssSelector = `.monaco-editor .${DecorationClassNames.frontMatterHeaderInlineInactive}`;
	collector.addRule(
		`${frontMatterHeaderInlineInactiveCssSelector} { ${inlineInactiveStyles.join(' ')} }`,
	);
};

/**
 * Provider for prompt syntax decorators on text models.
 */
export class PromptDecoratorsInstanceManager extends ProviderInstanceManagerBase<TextModelPromptDecorator> {
	protected override readonly InstanceClass = TextModelPromptDecorator;
}
