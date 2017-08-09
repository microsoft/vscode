/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './colorDetector';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorWidgetBackground, editorWidgetBorder } from 'vs/platform/theme/common/colorRegistry';

registerThemingParticipant((theme, collector) => {
	const widgetBackground = theme.getColor(editorWidgetBackground);
	collector.addRule(`.monaco-editor .colorpicker-widget { background-color: ${widgetBackground}; }`);

	const widgetBorder = theme.getColor(editorWidgetBorder);
	collector.addRule(`.monaco-editor .colorpicker-widget { border: 1px solid ${widgetBorder}; }`);
	collector.addRule(`.monaco-editor .colorpicker-header { border-bottom: 1px solid ${widgetBorder}; }`);
});