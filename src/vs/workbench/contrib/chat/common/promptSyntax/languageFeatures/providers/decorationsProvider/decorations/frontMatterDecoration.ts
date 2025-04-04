/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../../nls.js';
import { Color, RGBA } from '../../../../../../../../../base/common/color.js';
import { FrontMatterMarkerDecoration } from './frontMatterMarkerDecoration.js';
import { BaseToken } from '../../../../../../../../../editor/common/codecs/baseToken.js';
import { registerColor } from '../../../../../../../../../platform/theme/common/colorUtils.js';
import { contrastBorder } from '../../../../../../../../../platform/theme/common/colorRegistry.js';
import { TAddAccessor, TRemoveAccessor, TDecorationStyles, ReactiveDecorationBase, asCssVariable } from './utils/index.js';
import { FrontMatterHeader } from '../../../../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterHeader.js';

/**
 * Decoration CSS class modifiers.
 */
export enum CssClassModifiers {
	Inactive = '.prompt-front-matter-inactive',
}

/**
 * Decoration CSS class names.
 */
export enum CssClassNames {
	main = '.prompt-front-matter',
	inline = '.prompt-front-matter-inline',
	mainInactive = `${CssClassNames.main}${CssClassModifiers.Inactive}`,
	inlineInactive = `${CssClassNames.inline}${CssClassModifiers.Inactive}`,
}

/**
 * Main background color of `active` Front Matter header block.
 */
const BACKGROUND_COLOR = registerColor(
	'prompt.frontMatter.background',
	{ dark: new Color(new RGBA(0, 0, 0, 0.2)), light: new Color(new RGBA(255, 255, 255, 0.2)), hcDark: contrastBorder, hcLight: contrastBorder },
	localize('chat.prompt.frontMatter.background.description', "Background color of a Front Matter header block."),
);

/**
 * Background color of `inactive` Front Matter header block.
 */
const INACTIVE_BACKGROUND_COLOR = registerColor(
	'prompt.frontMatter.inactiveBackground',
	{ dark: new Color(new RGBA(0, 0, 0, 0.10)), light: new Color(new RGBA(255, 255, 255, 0.10)), hcDark: contrastBorder, hcLight: contrastBorder },
	localize('chat.prompt.frontMatter.inactiveBackground.description', "Background color of an inactive Front Matter header block."),
);

/**
 * CSS styles for the decoration.
 */
export const CSS_STYLES = {
	[CssClassNames.main]: [
		`background-color: ${asCssVariable(BACKGROUND_COLOR)};`,
		// this masks vertical block ruler column line
		'border-left: 1px solid var(--vscode-editor-background);',
	],
	[CssClassNames.mainInactive]: [
		`background-color: ${asCssVariable(INACTIVE_BACKGROUND_COLOR)};`,
	],
	[CssClassNames.inlineInactive]: [
		'opacity: 0.5;',
	],
	...FrontMatterMarkerDecoration.cssStyles,
};

/**
 * Editor decoration for the Front Matter header token inside a prompt.
 */
export class FrontMatterDecoration extends ReactiveDecorationBase<FrontMatterHeader, CssClassNames> {
	/**
	 * Decorators for the start and end markers of the Front Matter header.
	 */
	private readonly markerDecorators: [FrontMatterMarkerDecoration, FrontMatterMarkerDecoration];

	constructor(
		accessor: TAddAccessor,
		token: FrontMatterHeader,
	) {
		super(accessor, token);

		this.markerDecorators = [
			new FrontMatterMarkerDecoration(accessor, token.startMarker),
			new FrontMatterMarkerDecoration(accessor, token.endMarker),
		];
	}

	public override remove(
		accessor: TRemoveAccessor,
	): this {
		super.remove(accessor);

		for (const marker of this.markerDecorators) {
			marker.remove(accessor);
		}
		this.markerDecorators.splice(0);

		return this;
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
