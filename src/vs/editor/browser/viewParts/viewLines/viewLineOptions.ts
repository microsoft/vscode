/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ColorScheme } from '../../../../platform/theme/common/theme.js';
import type { IEditorConfiguration } from '../../../common/config/editorConfiguration.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { getFullwidthCharacterWidth, getFullwidthLetterSpacing } from '../../../common/config/fontInfo.js';

export class ViewLineOptions {
	public readonly themeType: ColorScheme;
	public readonly renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
	public readonly experimentalWhitespaceRendering: 'svg' | 'font' | 'off';
	public readonly renderControlCharacters: boolean;
	public readonly spaceWidth: number;
	public readonly middotWidth: number;
	public readonly wsmiddotWidth: number;
	public readonly useMonospaceOptimizations: boolean;
	public readonly canUseHalfwidthRightwardsArrow: boolean;
	/**
	 * The advance width of a full-width character, already corrected for
	 * `editor.forceFullwidthCharacterWidth`.
	 */
	public readonly fullwidthCharacterWidth: number;
	/**
	 * The `letter-spacing` that makes full-width characters advance `fullwidthCharacterWidth`, or
	 * `null` when they need no correction.
	 */
	public readonly fullwidthLetterSpacing: number | null;
	public readonly lineHeight: number;
	public readonly stopRenderingLineAfter: number;
	public readonly fontLigatures: string;
	public readonly verticalScrollbarSize: number;
	public readonly useGpu: boolean;

	constructor(config: IEditorConfiguration, themeType: ColorScheme) {
		this.themeType = themeType;
		const options = config.options;
		const fontInfo = options.get(EditorOption.fontInfo);
		this.renderWhitespace = options.get(EditorOption.renderWhitespace);
		this.experimentalWhitespaceRendering = options.get(EditorOption.experimentalWhitespaceRendering);
		this.renderControlCharacters = options.get(EditorOption.renderControlCharacters);
		this.spaceWidth = fontInfo.spaceWidth;
		this.middotWidth = fontInfo.middotWidth;
		this.wsmiddotWidth = fontInfo.wsmiddotWidth;
		this.useMonospaceOptimizations = (
			fontInfo.isMonospace
			&& !options.get(EditorOption.disableMonospaceOptimizations)
		);
		this.canUseHalfwidthRightwardsArrow = fontInfo.canUseHalfwidthRightwardsArrow;
		const forceFullwidthCharacterWidth = options.get(EditorOption.forceFullwidthCharacterWidth);
		this.fullwidthCharacterWidth = getFullwidthCharacterWidth(fontInfo, forceFullwidthCharacterWidth);
		this.fullwidthLetterSpacing = getFullwidthLetterSpacing(fontInfo, forceFullwidthCharacterWidth);
		this.lineHeight = options.get(EditorOption.lineHeight);
		this.stopRenderingLineAfter = options.get(EditorOption.stopRenderingLineAfter);
		this.fontLigatures = options.get(EditorOption.fontLigatures);
		this.verticalScrollbarSize = options.get(EditorOption.scrollbar).verticalScrollbarSize;
		this.useGpu = options.get(EditorOption.experimentalGpuAcceleration) === 'on';
	}

	public equals(other: ViewLineOptions): boolean {
		return (
			this.themeType === other.themeType
			&& this.renderWhitespace === other.renderWhitespace
			&& this.experimentalWhitespaceRendering === other.experimentalWhitespaceRendering
			&& this.renderControlCharacters === other.renderControlCharacters
			&& this.spaceWidth === other.spaceWidth
			&& this.middotWidth === other.middotWidth
			&& this.wsmiddotWidth === other.wsmiddotWidth
			&& this.useMonospaceOptimizations === other.useMonospaceOptimizations
			&& this.canUseHalfwidthRightwardsArrow === other.canUseHalfwidthRightwardsArrow
			&& this.fullwidthCharacterWidth === other.fullwidthCharacterWidth
			&& this.fullwidthLetterSpacing === other.fullwidthLetterSpacing
			&& this.lineHeight === other.lineHeight
			&& this.stopRenderingLineAfter === other.stopRenderingLineAfter
			&& this.fontLigatures === other.fontLigatures
			&& this.verticalScrollbarSize === other.verticalScrollbarSize
			&& this.useGpu === other.useGpu
		);
	}
}
