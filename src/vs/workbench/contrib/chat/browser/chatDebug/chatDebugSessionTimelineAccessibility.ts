/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatDebugEditor } from './chatDebugEditor.js';
import { CHAT_DEBUG_SESSION_TIMELINE_FOCUSED } from './chatDebugTypes.js';

class SessionTimelineAccessibleView implements IAccessibleViewImplementation {

	readonly priority = 105;
	readonly name = 'session-timeline';
	readonly when = CHAT_DEBUG_SESSION_TIMELINE_FOCUSED;

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (!(editor instanceof ChatDebugEditor)) {
			return undefined;
		}
		const content = editor.getSessionTimelineAccessibilityContent();
		if (content === undefined || (this.type === AccessibleViewType.View && !content)) {
			return undefined;
		}
		const focused = DOM.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionTimeline,
			{ type: this.type },
			() => this.type === AccessibleViewType.Help ? [
				localize('sessionTimeline.help.overview', "Session Timeline groups system, user, assistant, tool, and subagent events into user requests. Assistant and tool activity is indented beneath its semantic owner."),
				localize('sessionTimeline.help.navigation', "Use Tab and Shift+Tab to move between search, filters, request navigation, and event cards. Press Enter or Space on an event card to expand or collapse its readable details."),
				localize('sessionTimeline.help.requests', "User request cards remain visible while their child events scroll. Use the first, previous, next, and last request buttons in a user card to move between requests."),
				localize('sessionTimeline.help.search', "Search filters the timeline and highlights matching text. Collapsed cards show a matching detail line when the match is inside hidden content."),
				localize('sessionTimeline.help.view', "Use {0} to read the filtered timeline in the Accessible View.", '<keybinding:editor.action.accessibleView>'),
			].join('\n\n') : editor.getSessionTimelineAccessibilityContent() ?? '',
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focusSessionTimeline(),
			AccessibilityVerbositySettingId.SessionTimeline,
		);
	}
}

AccessibleViewRegistry.register(new SessionTimelineAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new SessionTimelineAccessibleView(AccessibleViewType.View));
