/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DecorationBase, TDecorationStyles } from './decorationBase.js';
import { FrontMatterMarker } from '../../../../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterMarker.js';

/**
 * Decoration CSS class names.
 */
export enum CssClassNames {
	main = '.prompt-front-matter-marker',
	inline = '.prompt-front-matter-marker-inline',
}

/**
 * Editor decoration for a marker token of Front Matter header.
 */
export class FrontMatterMarkerDecoration extends DecorationBase<FrontMatterMarker, CssClassNames> {
	protected override get className(): CssClassNames {
		return CssClassNames.main;
	}
	protected override get inlineClassName(): CssClassNames {
		return CssClassNames.inline;
	}

	protected override get description(): string {
		return 'Front Matter marker editor decoration.';
	}

	public static get cssStyles(): TDecorationStyles {
		return {
			[CssClassNames.inline]: [
				'opacity: 0.6;',
			],
		};
	}
}
