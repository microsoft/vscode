/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HoverAction } from 'vs/base/browser/ui/hover/hoverWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { zoomHover } from 'vs/editor/contrib/hover/browser/hover';
import { showLessHoverInformation, showMoreHoverInformation } from 'vs/editor/contrib/hover/browser/markdownHoverParticipant';
import * as nls from 'vs/nls';

export function renderShowLessHoverAction(editor: ICodeEditor, container: HTMLElement): HoverAction {
	return HoverAction.render(container, {
		label: nls.localize('show less', "Show Less..."),
		commandId: showLessHoverInformation,
		run: () => {
			zoomHover(editor, false);
		}
	}, null);
}

export function renderShowMoreHoverAction(editor: ICodeEditor, container: HTMLElement): HoverAction {
	return HoverAction.render(container, {
		label: nls.localize('show more', "Show More..."),
		commandId: showMoreHoverInformation,
		run: () => {
			zoomHover(editor, true);
		}
	}, null);
}


