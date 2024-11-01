/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ColorScheme } from '../../../../platform/theme/common/theme.js';
import type { IEditorConfiguration } from '../../../common/config/editorConfiguration.js';
import { EditorOption } from '../../../common/config/editorOptions.js';

export class ViewLineOptions {
	public readonly themeType: ColorScheme;
	public readonly renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
	public readonly renderControlCharacters: boolean;
	public readonly spaceWidth: number;
	public readonly middotWidth: number;
	public readonly wsmiddotWidth: number;
	public readonly useMonospaceOptimizations: boolean;
	public readonly canUseHalfwidthRightwardsArrow: boolean;
	public readonly lineHeight: number;
	public readonly stopRenderingLineAfter: number;
	public readonly fontLigatures: string;
	public readonly useGpu: boolean;

	constructor(config: IEditorConfiguration, themeType: ColorScheme) {
		this.themeType = themeType;
		const options = config.options;
		const fontInfo = options.get(EditorOption.fontInfo);
		const experimentalWhitespaceRendering = options.get(EditorOption.experimentalWhitespaceRendering);
		if (experimentalWhitespaceRendering === 'off') {
			this.renderWhitespace = options.get(EditorOption.renderWhitespace);
		} else {
			// whitespace is rendered in a different layer
			this.renderWhitespace = 'none';
		}
		this.renderControlCharacters = options.get(EditorOption.renderControlCharacters);
		this.spaceWidth = fontInfo.spaceWidth;
		this.middotWidth = fontInfo.middotWidth;
		this.wsmiddotWidth = fontInfo.wsmiddotWidth;
		this.useMonospaceOptimizations = (
			fontInfo.isMonospace
			&& !options.get(EditorOption.disableMonospaceOptimizations)
		);
		this.canUseHalfwidthRightwardsArrow = fontInfo.canUseHalfwidthRightwardsArrow;
		this.lineHeight = options.get(EditorOption.lineHeight);
		this.stopRenderingLineAfter = options.get(EditorOption.stopRenderingLineAfter);
		this.fontLigatures = options.get(EditorOption.fontLigatures);
		this.useGpu = options.get(EditorOption.experimentalGpuAcceleration) === 'on';
	}

	public equals(other: ViewLineOptions): boolean {
		return (
			this.themeType === other.themeType
			&& this.renderWhitespace === other.renderWhitespace
			&& this.renderControlCharacters === other.renderControlCharacters
			&& this.spaceWidth === other.spaceWidth
			&& this.middotWidth === other.middotWidth
			&& this.wsmiddotWidth === other.wsmiddotWidth
			&& this.useMonospaceOptimizations === other.useMonospaceOptimizations
			&& this.canUseHalfwidthRightwardsArrow === other.canUseHalfwidthRightwardsArrow
			&& this.lineHeight === other.lineHeight
			&& this.stopRenderingLineAfter === other.stopRenderingLineAfter
			&& this.fontLigatures === other.fontLigatures
			&& this.useGpu === other.useGpu
		);
	}
}
