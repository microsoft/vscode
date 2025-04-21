/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CssClassModifiers } from '../types.js';
import { TDecorationStyles, ReactiveDecorationBase } from './utils/index.js';
import { FrontMatterMarker } from '../../../../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterMarker.js';

/**
 * Decoration CSS class names.
 */
export enum CssClassNames {
	main = '.prompt-front-matter-decoration-marker',
	inline = '.prompt-front-matter-decoration-marker-inline',
	mainInactive = `${CssClassNames.main}${CssClassModifiers.inactive}`,
	inlineInactive = `${CssClassNames.inline}${CssClassModifiers.inactive}`,
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

	protected override get classNames() {
		return CssClassNames;
	}

	protected override get description(): string {
		return 'Marker decoration of a Front Matter header.';
	}

	public static get cssStyles(): TDecorationStyles {
		return {
			[CssClassNames.inline]: [
				'color: var(--vscode-disabledForeground);',
			],
			[CssClassNames.inlineInactive]: [
				'opacity: 0.25;',
			],
		};
	}
}
