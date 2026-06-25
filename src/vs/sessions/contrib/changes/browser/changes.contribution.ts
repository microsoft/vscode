/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IViewContainersRegistry, ViewContainerLocation, IViewsRegistry, Extensions as ViewContainerExtensions, WindowEnablement } from '../../../../workbench/common/views.js';
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID, SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING } from '../common/changes.js';
import { ChangesViewPane, ChangesViewPaneContainer } from './changesView.js';
import { IsPhoneLayoutContext } from '../../../common/contextkeys.js';
import { ISessionChangesService, SessionChangesService } from './sessionChangesService.js';
import './changesActions.js';
import './changesViewActions.js';
import './checksActions.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ChangesViewService } from './changesViewService.js';
import { IChangesViewService } from '../common/changesViewService.js';

registerSingleton(ISessionChangesService, SessionChangesService, InstantiationType.Delayed);


const changesViewIcon = registerIcon('changes-view-icon', Codicon.gitCompare, localize2('changesViewIcon', 'View icon for the Changes view.').value);

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);

const changesViewContainer = viewContainersRegistry.registerViewContainer({
	id: CHANGES_VIEW_CONTAINER_ID,
	title: localize2('changes', 'Changes'),
	icon: changesViewIcon,
	order: 10,
	ctorDescriptor: new SyncDescriptor(ChangesViewPaneContainer),
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
	when: IsPhoneLayoutContext.negate(),
	windowEnablement: WindowEnablement.Sessions,
}], changesViewContainer);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING]: {
			type: 'boolean',
			tags: ['preview'],
			description: localize('sessions.changes.openSingleFileDiff', "Controls whether clicking a file in the Changes view opens a single file diff editor instead of the multi file diff editor."),
			default: false,
		},
	},
});

registerSingleton(IChangesViewService, ChangesViewService, InstantiationType.Delayed);
