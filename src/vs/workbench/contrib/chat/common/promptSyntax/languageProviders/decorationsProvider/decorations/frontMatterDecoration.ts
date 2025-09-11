/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from '../../../../../../../../editor/common/core/position.js';
import { localize } from '../../../../../../../../nls.js';
import { contrastBorder, editorBackground } from '../../../../../../../../platform/theme/common/colorRegistry.js';
import { asCssVariable, ColorIdentifier, darken, registerColor } from '../../../../../../../../platform/theme/common/colorUtils.js';
import { BaseToken } from '../../../codecs/base/baseToken.js';
import { FrontMatterHeader } from '../../../codecs/base/markdownExtensionsCodec/tokens/frontMatterHeader.js';
import { CssClassModifiers } from '../types.js';
import { FrontMatterMarkerDecoration } from './frontMatterMarkerDecoration.js';
import { ReactiveDecorationBase } from './utils/reactiveDecorationBase.js';
import { IReactiveDecorationClassNames, TAddAccessor, TDecorationStyles } from './utils/types.js';

/**
 * Decoration CSS class names.
 */
export enum CssClassNames {
	Main = '.prompt-front-matter-decoration',
	Inline = '.prompt-front-matter-decoration-inline',
	MainInactive = `${CssClassNames.Main}${CssClassModifiers.Inactive}`,
	InlineInactive = `${CssClassNames.Inline}${CssClassModifiers.Inactive}`,
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
	[CssClassNames.Main]: [
		`background-color: ${asCssVariable(BACKGROUND_COLOR)};`,
		'z-index: -1;', // this is required to allow for selections to appear above the decoration background
	],
	[CssClassNames.MainInactive]: [
		`background-color: ${asCssVariable(INACTIVE_BACKGROUND_COLOR)};`,
	],
	[CssClassNames.InlineInactive]: [
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

	protected override get classNames(): IReactiveDecorationClassNames<CssClassNames> {
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
