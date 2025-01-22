/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { IPromptReference } from '../parsers/types.js';
import { basename } from '../../../../../../base/common/path.js';
import { assertNever } from '../../../../../../base/common/assert.js';
import { IRange } from '../../../../../../editor/common/core/range.js';
import { TextModelPromptParser } from '../parsers/textModelPromptParser.js';
import { TrackedDisposable } from '../../../../../../base/common/trackedDisposable.js';
import { ModelDecorationOptions } from '../../../../../../editor/common/model/textModel.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from '../../chatColors.js';
import { ITextModel, TrackedRangeStickiness } from '../../../../../../editor/common/model.js';
import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { registerThemingParticipant } from '../../../../../../platform/theme/common/themeService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';

/**
 * TODO: @legomushroom - add unit tests
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
export class TextModelPromptDecorator extends TrackedDisposable {
	/**
	 * Associated prompt parser instance.
	 */
	private readonly parser: TextModelPromptParser;

	/**
	 * List of IDs of registered text model decorations.
	 */
	private readonly registeredDecorationIDs: string[] = [];

	constructor(
		private readonly editor: ITextModel,
		@IInstantiationService initService: IInstantiationService,
	) {
		super();

		this.editor.onWillDispose(this.dispose.bind(this));

		this.parser = initService.createInstance(TextModelPromptParser, editor, []);
		this.parser.onUpdate(this.onPromptParserUpdate.bind(this));
		this.parser.start();
	}

	/**
	 * Handler for the prompt parser update event.
	 */
	private onPromptParserUpdate(): this {
		// TODO: @legomushroom - add a tracking issue for the work to update existing decorations instead of always recreating them
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
		const { references } = this.parser;

		for (const reference of references) {
			const { range } = reference;

			result.push({
				range,
				options: this.getDecorationFor(reference),
			});
		}

		return result;
	}

	/**
	 * Get decoration options for a provided prompt reference.
	 */
	private getDecorationFor(token: IPromptReference): ModelDecorationOptions {
		return ModelDecorationOptions.createDynamic({
			description: this.getDecorationDescription(token),
			className: this.getCssClassNameFor(token),
			hoverMessage: this.getHoveMessageFor(token),
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		});
	}

	/**
	 * Get decoration description for a provided prompt reference.
	 */
	private getDecorationDescription(token: IPromptReference): string {
		if (token.type === 'file') {
			return 'Prompt file reference decoration.';
		}

		assertNever(
			token.type,
			`Failed to get decoration description for unknown token type: '${token.type}'.`,
		);
	}

	/**
	 * Get CSS class names for a provided prompt reference.
	 */
	private getCssClassNameFor(token: IPromptReference): string {
		if (token.type === 'file') {
			const mainClassName = DecorationClassNames.reference;

			const { topError } = token;
			if (!topError) {
				return mainClassName;
			}

			const { isRootError } = topError;
			const classNameModifier = (isRootError)
				? DecorationClassNameModifiers.error
				: DecorationClassNameModifiers.warning;

			return `${mainClassName} ${classNameModifier}`;
		}

		assertNever(
			token.type,
			`Failed to get CSS class name for unknown token type: '${token.type}'.`,
		);
	}

	/**
	 * Get decoration hover message for a provided prompt reference.
	 */
	private getHoveMessageFor(token: IPromptReference): IMarkdownString[] {
		if (token.type === 'file') {
			const result = [
				new MarkdownString(basename(token.uri.path)),
			];

			const { topError } = token;
			if (!topError) {
				return result;
			}

			const { message, isRootError } = topError;
			const errorCaption = (!isRootError)
				? localize('warning', "Warning")
				: localize('error', "Error");

			result.push(new MarkdownString(`[${errorCaption}]: ${message}`));

			return result;
		}

		assertNever(
			token.type,
			`Failed to create prompt token hover message, unexpected token type: '${token.type}'.`,
		);
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
		return `text-model-prompt-decorator:${this.editor.uri.path}`;
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
 * Register prompt syntax decorations related styles.
 */
registerThemingParticipant((theme, collector) => {
	const styles = ['border-radius: 3px;'];

	const backgroundColor = theme.getColor(chatSlashCommandBackground);
	if (backgroundColor) {
		styles.push(`background-color: ${backgroundColor};`);
	}

	const color = theme.getColor(chatSlashCommandForeground);
	if (color) {
		styles.push(`color: ${color};`);
	}

	const referenceCssSelector = `.monaco-editor .${DecorationClassNames.reference}`;
	collector.addRule(
		`${referenceCssSelector} { ${styles.join(' ')} }`,
	);
});
