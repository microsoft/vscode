/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DecorationBase } from './decorationBase.js';
import { Position } from '../../../../../../../../../../editor/common/core/position.js';
import { BaseToken } from '../../../../../../../../../../editor/common/codecs/baseToken.js';
import type { IReactiveDecorationClassNames, TAddAccessor, TChangeAccessor, TRemoveAccessor } from './types.js';

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
	protected abstract get classNames(): IReactiveDecorationClassNames<TCssClassName>;

	/**
	 * A list of child decorators that are part of this decoration.
	 * For instance a Front Matter header decoration can have child
	 * decorators for each of the header's `---` markers.
	 */
	protected readonly childDecorators: DecorationBase<BaseToken>[];

	/**
	 * Whether the decoration has changed since the last {@link change}.
	 */
	public get changed(): boolean {
		// if any of the child decorators changed, this object is also
		// considered to be changed
		for (const marker of this.childDecorators) {
			if ((marker instanceof ReactiveDecorationBase) === false) {
				continue;
			}

			if (marker.changed === true) {
				return true;
			}
		}

		return this.didChange;
	}

	constructor(
		accessor: TAddAccessor,
		token: TPromptToken,
	) {
		super(accessor, token);

		this.childDecorators = [];
	}

	/**
	 * Current position of cursor in the editor.
	 */
	private cursorPosition?: Position | null;

	/**
	 * Private field for the {@link changed} property.
	 */
	private didChange = true;

	/**
	 * Whether cursor is currently inside the decoration range.
	 */
	protected get active(): boolean {
		return true;

		/**
		 * Temporarily disable until we have a proper way to get
		 * the cursor position inside active editor.
		 */
		/**
		 * if (!this.cursorPosition) {
		 * 	return false;
		 * }
		 *
		 * // when cursor is at the end of a range, the range considered to
		 * // not contain the position, but we want to include it
		 * const atEnd = (this.range.endLineNumber === this.cursorPosition.lineNumber)
		 * 	&& (this.range.endColumn === this.cursorPosition.column);
		 *
		 * return atEnd || this.range.containsPosition(this.cursorPosition);
		 */
	}

	/**
	 * Set cursor position and update {@link changed} property if needed.
	 */
	public setCursorPosition(
		position: Position | null | undefined,
	): this is { readonly changed: true } {
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

		return this.changed;
	}

	public override change(
		accessor: TChangeAccessor,
	): this {
		if (this.didChange === false) {
			return this;
		}

		super.change(accessor);
		this.didChange = false;

		for (const marker of this.childDecorators) {
			marker.change(accessor);
		}

		return this;
	}

	public override remove(
		accessor: TRemoveAccessor,
	): this {
		super.remove(accessor);

		for (const marker of this.childDecorators) {
			marker.remove(accessor);
		}

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
