/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IModelDecorationsChangeAccessor } from '../../../../../../../../../editor/common/model.js';

/**
 * CSS class names of a `reactive` decoration.
 */
export interface IReactiveDecorationClassNames<T extends string = string> {
	/**
	 * Main, default CSS class name of the decoration.
	 */
	readonly Main: T;

	/**
	 * CSS class name of the decoration for the `inline`(text) styles.
	 */
	readonly Inline: T;

	/**
	 * main CSS class name of the decoration for the `inactive`
	 * decoration state.
	 */
	readonly MainInactive: T;

	/**
	 * CSS class name of the decoration for the `inline`(text)
	 * styles when decoration is in the `inactive` state.
	 */
	readonly InlineInactive: T;
}

/**
 * CSS styles for a decoration to be registered with editor.
 */
export type TDecorationStyles<TClassNames extends string = string> = {
	readonly [key in TClassNames]: readonly string[];
};

/**
 * A model decorations accessor that can be used to `add` a decoration.
 */
export type TAddAccessor = Pick<IModelDecorationsChangeAccessor, 'addDecoration'>;

/**
 * A model decorations accessor that can be used to `change` a decoration.
 */
export type TChangeAccessor = Pick<IModelDecorationsChangeAccessor, 'changeDecoration' | 'changeDecorationOptions'>;

/**
 * A model decorations accessor that can be used to `remove` a decoration.
 */
export type TRemoveAccessor = Pick<IModelDecorationsChangeAccessor, 'removeDecoration'>;

