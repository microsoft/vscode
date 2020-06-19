/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/hover';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { HoverService } from 'vs/workbench/contrib/hover/browser/hoverService';
import { IHoverService } from 'vs/workbench/contrib/hover/browser/hover';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorHoverBackground, editorHoverBorder, textLinkForeground, editorHoverForeground, editorHoverStatusBarBackground, textCodeBlockBackground } from 'vs/platform/theme/common/colorRegistry';

registerSingleton(IHoverService, HoverService, true);

registerThemingParticipant((theme, collector) => {
	const hoverBackground = theme.getColor(editorHoverBackground);
	if (hoverBackground) {
		collector.addRule(`.monaco-workbench .workbench-hover { background-color: ${hoverBackground}; }`);
	}
	const hoverBorder = theme.getColor(editorHoverBorder);
	if (hoverBorder) {
		collector.addRule(`.monaco-workbench .workbench-hover { border: 1px solid ${hoverBorder}; }`);
		collector.addRule(`.monaco-workbench .workbench-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-workbench .workbench-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-workbench .workbench-hover hr { border-bottom: 0px solid ${hoverBorder.transparent(0.5)}; }`);
	}
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-workbench .workbench-hover a { color: ${link}; }`);
	}
	const hoverForeground = theme.getColor(editorHoverForeground);
	if (hoverForeground) {
		collector.addRule(`.monaco-workbench .workbench-hover { color: ${hoverForeground}; }`);
	}
	const actionsBackground = theme.getColor(editorHoverStatusBarBackground);
	if (actionsBackground) {
		collector.addRule(`.monaco-workbench .workbench-hover .hover-row .actions { background-color: ${actionsBackground}; }`);
	}
	const codeBackground = theme.getColor(textCodeBlockBackground);
	if (codeBackground) {
		collector.addRule(`.monaco-workbench .workbench-hover code { background-color: ${codeBackground}; }`);
	}
});
