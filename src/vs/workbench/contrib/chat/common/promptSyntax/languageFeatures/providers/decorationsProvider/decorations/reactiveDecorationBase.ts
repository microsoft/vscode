/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DecorationBase } from './decorationBase.js';
import { Position } from '../../../../../../../../../editor/common/core/position.js';
import { BaseToken } from '../../../../../../../../../editor/common/codecs/baseToken.js';
import { IModelDecorationsChangeAccessor } from '../../../../../../../../../editor/common/model.js';

/**
 * CSS class names of the decoration.
 */
interface IClassNames<T extends string = string> {
	/**
	 * Main, default CSS class name of the decoration
	 * for the `active` decoration state.
	 */
	readonly main: T;

	/**
	 * CSS class name of the decoration for the `inline`(text)
	 * styles.
	 */
	readonly inline: T;

	/**
	 * main CSS class name of the decoration for the `inactive`
	 * decoration state.
	 */
	readonly mainInactive: T;

	/**
	 * CSS class name of the decoration for the `inline`(text)
	 * styles when decoration is in the `inactive` state.
	 */
	readonly inlineInactive: T;
}

/**
 * Base class for all reactive editor decorations. A reactive decoration
 * is a decoration that can change its appearance based on current cursor
 * position in the editor, hence can "react" to the user's actions.
 */
export abstract class ReactiveDecorationBase<
	TPromptToken extends BaseToken,
	TCssClassName extends string = string,
> extends DecorationBase<TPromptToken, TCssClassName> {
	/**
	 * CSS class names of the decoration.
	 */
	protected abstract get classNames(): IClassNames<TCssClassName>;

	/**
	 * Whether the decoration has changed since the last {@link render}.
	 */
	public get changed(): boolean {
		return this.didChange;
	}

	/**
	 * Current position of cursor in the editor.
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
	 * Set cursor position and update {@link changed} property if needed.
	 */
	public setCursorPosition(position: Position | null | undefined): this is { readonly changed: true } {
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

	protected override get className() {
		return (this.active)
			? this.classNames.main
			: this.classNames.mainInactive;
	}

	protected override get inlineClassName() {
		return (this.active)
			? this.classNames.inline
			: this.classNames.inlineInactive;
	}
}

/**
 * Type for a decorator with {@link ReactiveDecorationBase.changed changed} property set to `true`.
 */
export type TChangedDecorator = ReactiveDecorationBase<BaseToken> & { readonly changed: true };
