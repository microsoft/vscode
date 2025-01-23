/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { AccessibleViewType, AccessibleContentProvider, IAccessibleViewContentProvider, AccessibleViewProviderId } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplentation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { FocusedViewContext, SidebarFocusContext } from '../../../common/contextkeys.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { HISTORY_VIEW_PANE_ID, ISCMService, ISCMViewService, REPOSITORIES_VIEW_PANE_ID, VIEW_PANE_ID } from '../common/scm.js';

export class SCMAccessibilityHelp implements IAccessibleViewImplentation {
	readonly name = 'scm';
	readonly type = AccessibleViewType.Help;
	readonly priority = 100;
	readonly when = ContextKeyExpr.or(
		ContextKeyExpr.and(ContextKeyExpr.equals('activeViewlet', 'workbench.view.scm'), SidebarFocusContext),
		ContextKeyExpr.equals(FocusedViewContext.key, REPOSITORIES_VIEW_PANE_ID),
		ContextKeyExpr.equals(FocusedViewContext.key, VIEW_PANE_ID),
		ContextKeyExpr.equals(FocusedViewContext.key, HISTORY_VIEW_PANE_ID)
	);

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const commandService = accessor.get(ICommandService);
		const scmService = accessor.get(ISCMService);
		const scmViewService = accessor.get(ISCMViewService);
		const viewsService = accessor.get(IViewsService);

		return new SCMAccessibilityHelpContentProvider(commandService, scmService, scmViewService, viewsService);
	}
}

class SCMAccessibilityHelpContentProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.SourceControl;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.SourceControl;
	readonly options = { type: AccessibleViewType.Help };

	private _focusedView: string | undefined;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@ISCMService private readonly _scmService: ISCMService,
		@ISCMViewService private readonly _scmViewService: ISCMViewService,
		@IViewsService private readonly _viewsService: IViewsService
	) {
		super();
		this._focusedView = this._viewsService.getFocusedViewName();
	}

	onClose(): void {
		switch (this._focusedView) {
			case 'Source Control':
				this._commandService.executeCommand('workbench.scm');
				break;
			case 'Source Control Repositories':
				this._commandService.executeCommand('workbench.scm.repositories');
				break;
			case 'Source Control Graph':
				this._commandService.executeCommand('workbench.scm.history');
				break;
			default:
				this._commandService.executeCommand('workbench.view.scm');
		}
	}

	provideContent(): string {
		const content: string[] = [];

		return content.join('\n');
	}
}
