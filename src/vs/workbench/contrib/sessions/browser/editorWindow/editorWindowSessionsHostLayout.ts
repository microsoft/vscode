/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { AgentWorkbenchLayout, ISessionsHostLayoutService } from '../../../../services/sessions/browser/sessionsHostLayoutService.js';

/**
 * The layout of an editor window for the sessions features it hosts: its editor area shows when they reveal it, and it
 * never shows or hides by itself as editors open and close, so there is nothing to suppress.
 */
export class EditorWindowSessionsHostLayout implements ISessionsHostLayoutService {

	declare readonly _serviceBrand: undefined;

	readonly agentWorkbenchLayout = AgentWorkbenchLayout.Desktop;

	private suppressions = 0;

	constructor(@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService) { }

	revealEditorPartExplicitly(): void {
		if (!this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
			this.layoutService.setPartHidden(false, Parts.EDITOR_PART);
		}
	}

	suppressEditorPartAutoVisibility(): IDisposable {
		this.suppressions++;
		return toDisposable(() => this.suppressions--);
	}

	isEditorPartAutoVisibilitySuppressed(): boolean {
		return this.suppressions > 0;
	}
}
