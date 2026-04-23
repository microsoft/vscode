/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IViewContainersRegistry, ViewContainerLocation, IViewsRegistry, Extensions as ViewContainerExtensions, WindowEnablement } from '../../../../workbench/common/views.js';
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID } from '../common/changes.js';
import { ChangesViewPane, ChangesViewPaneContainer } from './changesView.js';
import { ChangesTitleBarContribution } from './changesTitleBarWidget.js';
import './changesViewActions.js';
import './checksActions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';

const changesViewIcon = registerIcon('changes-view-icon', Codicon.gitCompare, localize2('changesViewIcon', 'View icon for the Changes view.').value);

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);

const changesViewContainer = viewContainersRegistry.registerViewContainer({
	id: CHANGES_VIEW_CONTAINER_ID,
	title: localize2('changes', 'Changes'),
	icon: changesViewIcon,
	order: 10,
	ctorDescriptor: new SyncDescriptor(ChangesViewPaneContainer, [CHANGES_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: CHANGES_VIEW_CONTAINER_ID,
	hideIfEmpty: false,
	openCommandActionDescriptor: {
		id: CHANGES_VIEW_CONTAINER_ID,
		mnemonicTitle: localize({ key: 'miChanges', comment: ['&& denotes a mnemonic'] }, "Chan&&ges"),
		keybindings: {
			primary: 0,
			win: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG },
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG },
			mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyG },
		},
		order: 1,
	},
	windowEnablement: WindowEnablement.Sessions
}, ViewContainerLocation.AuxiliaryBar);

const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

viewsRegistry.registerViews([{
	id: CHANGES_VIEW_ID,
	name: localize2('changes', 'Changes'),
	containerIcon: changesViewIcon,
	ctorDescriptor: new SyncDescriptor(ChangesViewPane),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 1,
	windowEnablement: WindowEnablement.Sessions,
}], changesViewContainer);

registerWorkbenchContribution2(ChangesTitleBarContribution.ID, ChangesTitleBarContribution, WorkbenchPhase.AfterRestored);
