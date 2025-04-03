/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { IPromptsService } from '../../service/types.js';
import { ProviderInstanceBase } from './providerInstanceBase.js';
import { chatSlashCommandBackground } from '../../../chatColors.js';
import { Color, RGBA } from '../../../../../../../base/common/color.js';
import { assertNever } from '../../../../../../../base/common/assert.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { Range, IRange } from '../../../../../../../editor/common/core/range.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { BaseToken } from '../../../../../../../editor/common/codecs/baseToken.js';
import { ModelDecorationOptions } from '../../../../../../../editor/common/model/textModel.js';
import { IPromptFileEditor, ProviderInstanceManagerBase } from './providerInstanceManagerBase.js';
import { contrastBorder, registerColor } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { IModelDecorationsChangeAccessor, TrackedRangeStickiness } from '../../../../../../../editor/common/model.js';
import { FrontMatterHeader } from '../../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterHeader.js';
import { IColorTheme, ICssStyleCollector, registerThemingParticipant } from '../../../../../../../platform/theme/common/themeService.js';

/**
 * TODO: @legomushroom - list
 * - add active/inactive logic for front matter header
 */

/**
 * TODO: @legomushroom
 */
abstract class Decoration<TPromptToken extends BaseToken, TCssClassName extends string = string> {
	/**
	 * TODO: @legomushroom
	 */
	protected abstract get description(): string;

	/**
	 * TODO: @legomushroom
	 */
	protected abstract get className(): TCssClassName;

	/**
	 * TODO: @legomushroom
	 */
	protected abstract get inlineClassName(): TCssClassName;

	/**
	 * TODO: @legomushroom
	 */
	protected get isWholeLine(): boolean {
		return false;
	}

	/**
	 * TODO: @legomushroom
	 */
	protected get hoverMessage(): IMarkdownString | IMarkdownString[] | null {
		return null;
	}

	/**
	 * TODO: @legomushroom
	 */
	public readonly id: string;

	constructor(
		accessor: Pick<IModelDecorationsChangeAccessor, 'addDecoration'>,
		protected readonly token: TPromptToken,
	) {
		this.id = accessor.addDecoration(this.range, this.decorationOptions);
	}

	/**
	 * Range of the decoration.
	 */
	public get range(): Range {
		return this.token.range;
	}

	/**
	 * TODO: @legomushroom
	 */
	public render(
		accessor: Pick<IModelDecorationsChangeAccessor, 'changeDecoration' | 'changeDecorationOptions'>,
	): this {
		accessor.changeDecorationOptions(
			this.id,
			this.decorationOptions,
		);

		return this;
	}

	/**
	 * TODO: @legomushroom
	 */
	protected get decorationOptions(): ModelDecorationOptions {
		return ModelDecorationOptions.createDynamic({
			description: this.description,
			hoverMessage: this.hoverMessage,
			className: this.className,
			inlineClassName: this.inlineClassName,
			isWholeLine: this.isWholeLine,
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			shouldFillLineOnLineBreak: true,
		});
	}
}

/**
 * TODO: @legomushroom
 */
abstract class ReactiveDecoration<TPromptToken extends BaseToken, TCssClassName extends string = string> extends Decoration<TPromptToken, TCssClassName> {
	/**
	 * Whether the decoration has changed since the last {@link render}.
	 */
	public get changed(): boolean {
		return this.didChange;
	}

	/**
	 * TODO: @legomushroom
	 */
	private cursorPosition?: Position | null;

	/**
	 * Private field for the {@link changed} property.
	 */
	private didChange = true;

	constructor(
		accessor: Pick<IModelDecorationsChangeAccessor, 'addDecoration'>,
		token: TPromptToken,
	) {
		super(accessor, token);
	}

	/**
	 * Whether cursor is currently inside the decoration range.
	 */
	protected get active(): boolean {
		if (!this.cursorPosition) {
			return false;
		}

		// when cursor is at the end of a range, the range considered to
		// not contain the position, but we want to include it
		const atEnd = (this.range.endLineNumber === this.cursorPosition.lineNumber)
			&& (this.range.endColumn === this.cursorPosition.column);

		return atEnd || this.range.containsPosition(this.cursorPosition);
	}

	/**
	 * TODO: @legomushroom
	 */
	public setCursorPosition(position: Position | null | undefined): boolean {
		if (this.cursorPosition === position) {
			return false;
		}

		if (this.cursorPosition && position) {
			if (this.cursorPosition.equals(position)) {
				return false;
			}
		}

		const wasActive = this.active;
		this.cursorPosition = position;
		this.didChange = (wasActive !== this.active);

		return this.didChange;
	}

	public override render(
		accessor: Pick<IModelDecorationsChangeAccessor, 'changeDecoration' | 'changeDecorationOptions'>,
	): this {
		if (this.didChange === false) {
			return this;
		}

		super.render(accessor);
		this.didChange = false;

		return this;
	}
}

/**
 * Decoration CSS class names.
 */
export enum FrontMatterCssClassNames {
	/**
	 * TODO: @legomushroom
	 */
	frontMatterHeader = 'prompt-front-matter-header',
	frontMatterHeaderInlineInactive = 'prompt-front-matter-header-inline-inactive',
	frontMatterHeaderInlineActive = 'prompt-front-matter-header-inline-active',
}

/**
 * TODO: @legomushroom
 */
class FrontMatterHeaderDecoration extends ReactiveDecoration<FrontMatterHeader, FrontMatterCssClassNames> {
	protected override get isWholeLine(): boolean {
		return true;
	}

	protected override get description(): string {
		return 'Front Matter header decoration.';
	}

	protected override get className(): FrontMatterCssClassNames.frontMatterHeader {
		return FrontMatterCssClassNames.frontMatterHeader;
	}

	protected override get inlineClassName(): FrontMatterCssClassNames.frontMatterHeaderInlineActive | FrontMatterCssClassNames.frontMatterHeaderInlineInactive {
		return (this.active)
			? FrontMatterCssClassNames.frontMatterHeaderInlineActive
			: FrontMatterCssClassNames.frontMatterHeaderInlineInactive;
	}
}

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
 * TODO: @legomushroom
 */
type TDecoratedToken = FrontMatterHeader;

/**
 * Prompt syntax decorations provider for text models.
 */
export class TextModelPromptDecorator extends ProviderInstanceBase {
	/**
	 * TODO: @legomushroom
	 */
	private readonly decorations: Decoration<BaseToken>[] = [];

	constructor(
		editor: IPromptFileEditor,
		@IPromptsService promptsService: IPromptsService,
	) {
		super(editor, promptsService);

		this.watchCursorPosition();
	}

	/**
	 * Handler for the prompt parser update event.
	 */
	// TODO: @legomushroom - update existing decorations instead of recreating them every time
	protected override async onPromptParserUpdate(): Promise<this> {
		await this.parser.allSettled();

		this.removeAllDecorations();
		this.addDecorations(this.parser.tokens);

		return this;
	}

	/**
	 * TODO: @legomushroom
	 */
	private watchCursorPosition(): this {
		const interval = setInterval(() => {
			const cursorPosition = this.editor.getPosition();

			const changedDecorations: Decoration<BaseToken>[] = [];
			for (const decoration of this.decorations) {
				if ((decoration instanceof ReactiveDecoration) === false) {
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
	 * TODO: @legomushroom
	 */
	private changeEditorDecorations(
		decorations: readonly Decoration<BaseToken>[],
	): this {
		this.editor.changeDecorations((accessor) => {
			for (const decoration of decorations) {
				decoration.render(accessor);
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

		const decoratedTokens: TDecoratedToken[] = [];
		for (const token of tokens) {
			if (token instanceof FrontMatterHeader) {
				decoratedTokens.push(token);
			}
		}

		if (decoratedTokens.length === 0) {
			return this;
		}

		this.editor.changeDecorations((accessor) => {
			for (const token of decoratedTokens) {
				if (token instanceof FrontMatterHeader) {
					const decoration = new FrontMatterHeaderDecoration(
						accessor,
						token,
					);

					this.decorations.push(decoration);

					continue;
				}

				assertNever(
					token,
					`Unexpected decorated token '${token}'.`,
				);
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
				accessor.removeDecoration(decoration.id);
			}

			this.decorations.splice(0);
		});

		return this;
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		return `text-model-prompt-decorator:${this.model.uri.path}`;
	}

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

	const frontMatterHeaderCssSelector = `.monaco-editor .${FrontMatterCssClassNames.frontMatterHeader}`;
	collector.addRule(
		`${frontMatterHeaderCssSelector} { ${styles.join(' ')} }`,
	);

	const inlineInactiveStyles = [];
	inlineInactiveStyles.push('color: var(--vscode-disabledForeground);');

	const inlineActiveStyles = [];
	inlineActiveStyles.push('color: var(--vscode-foreground);');

	const frontMatterHeaderInlineActiveCssSelector = `.monaco-editor .${FrontMatterCssClassNames.frontMatterHeaderInlineActive}`;
	collector.addRule(
		`${frontMatterHeaderInlineActiveCssSelector} { ${inlineActiveStyles.join(' ')} }`,
	);

	const frontMatterHeaderInlineInactiveCssSelector = `.monaco-editor .${FrontMatterCssClassNames.frontMatterHeaderInlineInactive}`;
	collector.addRule(
		`${frontMatterHeaderInlineInactiveCssSelector} { ${inlineInactiveStyles.join(' ')} }`,
	);
};

/**
 * Provider for prompt syntax decorators on text models.
 */
export class PromptDecoratorsInstanceManager extends ProviderInstanceManagerBase<TextModelPromptDecorator> {
	protected override get InstanceClass() {
		return TextModelPromptDecorator;
	}
}
