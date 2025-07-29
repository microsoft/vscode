/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../../../../../../../editor/common/core/range.js';
import { IMarkdownString } from '../../../../../../../../../base/common/htmlContent.js';
import { BaseToken } from '../../../../codecs/base/baseToken.js';
import { TrackedRangeStickiness } from '../../../../../../../../../editor/common/model.js';
import type { TAddAccessor, TChangeAccessor, TDecorationStyles, TRemoveAccessor } from './types.js';
import { ModelDecorationOptions } from '../../../../../../../../../editor/common/model/textModel.js';

/**
 * Base class for all editor decorations.
 */
export abstract class DecorationBase<
	TPromptToken extends BaseToken,
	TCssClassName extends string = string,
> {
	/**
	 * Description of the decoration.
	 */
	protected abstract get description(): string;

	/**
	 * Default CSS class name of the decoration.
	 */
	protected abstract get className(): TCssClassName;

	/**
	 * Inline CSS class name of the decoration.
	 */
	protected abstract get inlineClassName(): TCssClassName;

	/**
	 * Indicates whether the decoration spans the whole line(s).
	 */
	protected get isWholeLine(): boolean {
		return false;
	}

	/**
	 * Hover message of the decoration.
	 */
	protected get hoverMessage(): IMarkdownString | IMarkdownString[] | null {
		return null;
	}

	/**
	 * ID of editor decoration it was registered with.
	 */
	public readonly id: string;

	constructor(
		accessor: TAddAccessor,
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
	 * Changes the decoration in the editor.
	 */
	public change(
		accessor: TChangeAccessor,
	): this {
		accessor.changeDecorationOptions(
			this.id,
			this.decorationOptions,
		);

		return this;
	}

	/**
	 * Removes associated editor decoration(s).
	 */
	public remove(
		accessor: TRemoveAccessor,
	): this {
		accessor.removeDecoration(this.id);

		return this;
	}

	/**
	 * Get editor decoration options for this decorator.
	 */
	private get decorationOptions(): ModelDecorationOptions {
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
 * Type of a generic decoration class.
 */
export type TDecorationClass<TPromptToken extends BaseToken = BaseToken> = {
	new(
		accessor: TAddAccessor,
		token: TPromptToken,
	): DecorationBase<TPromptToken>;

	/**
	 * CSS styles for the decoration.
	 */
	readonly cssStyles: TDecorationStyles;

	/**
	 * Whether the decoration class handles the provided token.
	 */
	handles(token: BaseToken): token is TPromptToken;
};
