/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CssClassModifiers } from '../types.js';
import { TDecorationStyles, IReactiveDecorationClassNames } from './utils/types.js';
import { FrontMatterMarker } from '../../../codecs/base/markdownExtensionsCodec/tokens/frontMatterMarker.js';
import { ReactiveDecorationBase } from './utils/reactiveDecorationBase.js';

/**
 * Decoration CSS class names.
 */
export enum CssClassNames {
	Main = '.prompt-front-matter-decoration-marker',
	Inline = '.prompt-front-matter-decoration-marker-inline',
	MainInactive = `${CssClassNames.Main}${CssClassModifiers.Inactive}`,
	InlineInactive = `${CssClassNames.Inline}${CssClassModifiers.Inactive}`,
}

/**
 * Editor decoration for a `marker` token of a Front Matter header.
 */
export class FrontMatterMarkerDecoration extends ReactiveDecorationBase<FrontMatterMarker, CssClassNames> {
	/**
	 * Activate/deactivate the decoration.
	 */
	public activate(state: boolean): this {
		const position = (state === true)
			? this.token.range.getStartPosition()
			: null;

		this.setCursorPosition(position);

		return this;
	}

	protected override get classNames(): IReactiveDecorationClassNames<CssClassNames> {
		return CssClassNames;
	}

	protected override get description(): string {
		return 'Marker decoration of a Front Matter header.';
	}

	public static get cssStyles(): TDecorationStyles {
		return {
			[CssClassNames.Inline]: [
				'color: var(--vscode-disabledForeground);',
			],
			[CssClassNames.InlineInactive]: [
				'opacity: 0.25;',
			],
		};
	}
}
