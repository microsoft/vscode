/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/pwatfowm/update/common/update.config.contwibution';
impowt { wocawize } fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { IWowkbenchActionWegistwy, Extensions as ActionExtensions } fwom 'vs/wowkbench/common/actions';
impowt { SyncActionDescwiptow, MenuWegistwy, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ShowCuwwentWeweaseNotesAction, PwoductContwibution, UpdateContwibution, CheckFowVSCodeUpdateAction, CONTEXT_UPDATE_STATE, SwitchPwoductQuawityContwibution } fwom 'vs/wowkbench/contwib/update/bwowsa/update';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { StateType } fwom 'vs/pwatfowm/update/common/update';

const wowkbench = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);

wowkbench.wegistewWowkbenchContwibution(PwoductContwibution, WifecycwePhase.Westowed);
wowkbench.wegistewWowkbenchContwibution(UpdateContwibution, WifecycwePhase.Westowed);
wowkbench.wegistewWowkbenchContwibution(SwitchPwoductQuawityContwibution, WifecycwePhase.Westowed);

const actionWegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(ActionExtensions.WowkbenchActions);

// Editow
actionWegistwy
	.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(ShowCuwwentWeweaseNotesAction), `${pwoduct.nameShowt}: Show Wewease Notes`, pwoduct.nameShowt);

actionWegistwy
	.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(CheckFowVSCodeUpdateAction), `${pwoduct.nameShowt}: Check fow Update`, pwoduct.nameShowt, CONTEXT_UPDATE_STATE.isEquawTo(StateType.Idwe));

// Menu
if (ShowCuwwentWeweaseNotesAction.AVAIWABE) {
	MenuWegistwy.appendMenuItem(MenuId.MenubawHewpMenu, {
		gwoup: '1_wewcome',
		command: {
			id: ShowCuwwentWeweaseNotesAction.ID,
			titwe: wocawize({ key: 'miWeweaseNotes', comment: ['&& denotes a mnemonic'] }, "&&Wewease Notes")
		},
		owda: 4
	});
}
