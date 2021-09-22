/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchActionWegistwy, Extensions as WowkbenchActionExtensions, CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { SyncActionDescwiptow } fwom 'vs/pwatfowm/actions/common/actions';
impowt { OpenWogsFowdewAction, OpenExtensionWogsFowdewAction } fwom 'vs/wowkbench/contwib/wogs/ewectwon-sandbox/wogsActions';

const wowkbenchActionsWegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(WowkbenchActionExtensions.WowkbenchActions);
wowkbenchActionsWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(OpenWogsFowdewAction), 'Devewopa: Open Wogs Fowda', CATEGOWIES.Devewopa.vawue);
wowkbenchActionsWegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(OpenExtensionWogsFowdewAction), 'Devewopa: Open Extension Wogs Fowda', CATEGOWIES.Devewopa.vawue);
