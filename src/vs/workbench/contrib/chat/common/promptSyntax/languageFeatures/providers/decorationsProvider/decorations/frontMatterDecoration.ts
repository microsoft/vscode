/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CssClassModifiers } from '../types.js';
import { localize } from '../../../../../../../../../nls.js';
import { FrontMatterMarkerDecoration } from './frontMatterMarkerDecoration.js';
import { Position } from '../../../../../../../../../editor/common/core/position.js';
import { BaseToken } from '../../../../../../../../../editor/common/codecs/baseToken.js';
import { TAddAccessor, TDecorationStyles, ReactiveDecorationBase, asCssVariable } from './utils/index.js';
import { contrastBorder, editorBackground } from '../../../../../../../../../platform/theme/common/colorRegistry.js';
import { ColorIdentifier, darken, registerColor } from '../../../../../../../../../platform/theme/common/colorUtils.js';
import { FrontMatterHeader } from '../../../../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterHeader.js';

/**
 * Decoration CSS class names.
 */
export enum CssClassNames {
	main = '.prompt-front-matter-decoration',
	inline = '.prompt-front-matter-decoration-inline',
	mainInactive = `${CssClassNames.main}${CssClassModifiers.inactive}`,
	inlineInactive = `${CssClassNames.inline}${CssClassModifiers.inactive}`,
}

/**
 * Main background color of `active` Front Matter header block.
 */
export const BACKGROUND_COLOR: ColorIdentifier = registerColor(
	'prompt.frontMatter.background',
	{ dark: darken(editorBackground, 0.2), light: darken(editorBackground, 0.05), hcDark: contrastBorder, hcLight: contrastBorder },
	localize('chat.prompt.frontMatter.background.description', "Background color of a Front Matter header block."),
);

/**
 * Background color of `inactive` Front Matter header block.
 */
export const INACTIVE_BACKGROUND_COLOR: ColorIdentifier = registerColor(
	'prompt.frontMatter.inactiveBackground',
	{ dark: darken(editorBackground, 0.1), light: darken(editorBackground, 0.025), hcDark: contrastBorder, hcLight: contrastBorder },
	localize('chat.prompt.frontMatter.inactiveBackground.description', "Background color of an inactive Front Matter header block."),
);

/**
 * CSS styles for the decoration.
 */
export const CSS_STYLES = {
	[CssClassNames.main]: [
		`background-color: ${asCssVariable(BACKGROUND_COLOR)};`,
		'z-index: -1;', // this is required to allow for selections to appear above the decoration background
	],
	[CssClassNames.mainInactive]: [
		`background-color: ${asCssVariable(INACTIVE_BACKGROUND_COLOR)};`,
	],
	[CssClassNames.inlineInactive]: [
		'color: var(--vscode-disabledForeground);',
	],
	...FrontMatterMarkerDecoration.cssStyles,
};

/**
 * Editor decoration for the Front Matter header token inside a prompt.
 */
export class FrontMatterDecoration extends ReactiveDecorationBase<FrontMatterHeader, CssClassNames> {
	constructor(
		accessor: TAddAccessor,
		token: FrontMatterHeader,
	) {
		super(accessor, token);

		this.childDecorators.push(
			new FrontMatterMarkerDecoration(accessor, token.startMarker),
			new FrontMatterMarkerDecoration(accessor, token.endMarker),
		);
	}

	public override setCursorPosition(
		position: Position | null | undefined,
	): this is { readonly changed: true } {
		const result = super.setCursorPosition(position);

		for (const marker of this.childDecorators) {
			if ((marker instanceof FrontMatterMarkerDecoration) === false) {
				continue;
			}

			// activate/deactivate markers based on the active state
			// of the main Front Matter header decoration
			marker.activate(this.active);
		}

		return result;
	}

	protected override get classNames() {
		return CssClassNames;
	}

	protected override get isWholeLine(): boolean {
		return true;
	}

	protected override get description(): string {
		return 'Front Matter header decoration.';
	}

	public static get cssStyles(): TDecorationStyles {
		return CSS_STYLES;
	}

	/**
	 * Whether current decoration class can decorate provided token.
	 */
	public static handles(
		token: BaseToken,
	): token is FrontMatterHeader {
		return token instanceof FrontMatterHeader;
	}
}
