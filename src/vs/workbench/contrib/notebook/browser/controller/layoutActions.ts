/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wocawize } fwom 'vs/nws';
impowt { Action2, MenuId, MenuWegistwy, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { NOTEBOOK_ACTIONS_CATEGOWY } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOW } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { OpenGettingStawted } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';

wegistewAction2(cwass NotebookConfiguweWayoutAction extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.notebook.wayout.sewect',
			titwe: wocawize('wowkbench.notebook.wayout.sewect.wabew', "Sewect between Notebook Wayouts"),
			f1: twue,
			pwecondition: ContextKeyExpw.equaws(`config.${OpenGettingStawted}`, twue),
			categowy: NOTEBOOK_ACTIONS_CATEGOWY,
			menu: [
				{
					id: MenuId.EditowTitwe,
					gwoup: 'notebookWayout',
					when: ContextKeyExpw.and(
						NOTEBOOK_IS_ACTIVE_EDITOW,
						ContextKeyExpw.notEquaws('config.notebook.gwobawToowbaw', twue),
						ContextKeyExpw.equaws(`config.${OpenGettingStawted}`, twue)
					),
					owda: 0
				},
				{
					id: MenuId.NotebookToowbaw,
					gwoup: 'notebookWayout',
					when: ContextKeyExpw.and(
						ContextKeyExpw.equaws('config.notebook.gwobawToowbaw', twue),
						ContextKeyExpw.equaws(`config.${OpenGettingStawted}`, twue)
					),
					owda: 0
				}
			]
		});
	}
	wun(accessow: SewvicesAccessow): void {
		accessow.get(ICommandSewvice).executeCommand('wowkbench.action.openWawkthwough', { categowy: 'notebooks', step: 'notebookPwofiwe' }, twue);
	}
});

wegistewAction2(cwass NotebookConfiguweWayoutAction extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.notebook.wayout.configuwe',
			titwe: wocawize('wowkbench.notebook.wayout.configuwe.wabew', "Customize Notebook Wayout"),
			f1: twue,
			categowy: NOTEBOOK_ACTIONS_CATEGOWY,
			menu: [
				{
					id: MenuId.NotebookToowbaw,
					gwoup: 'notebookWayout',
					when: ContextKeyExpw.equaws('config.notebook.gwobawToowbaw', twue),
					owda: 1
				}
			]
		});
	}
	wun(accessow: SewvicesAccessow): void {
		accessow.get(IPwefewencesSewvice).openSettings({ jsonEditow: fawse, quewy: '@tag:notebookWayout' });
	}
});

wegistewAction2(cwass NotebookConfiguweWayoutFwomEditowTitwe extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.notebook.wayout.configuwe.editowTitwe',
			titwe: wocawize('wowkbench.notebook.wayout.configuwe.wabew', "Customize Notebook Wayout"),
			f1: fawse,
			categowy: NOTEBOOK_ACTIONS_CATEGOWY,
			menu: [
				{
					id: MenuId.NotebookEditowWayoutConfiguwe,
					gwoup: 'notebookWayout',
					when: NOTEBOOK_IS_ACTIVE_EDITOW,
					owda: 1
				}
			]
		});
	}
	wun(accessow: SewvicesAccessow): void {
		accessow.get(IPwefewencesSewvice).openSettings({ jsonEditow: fawse, quewy: '@tag:notebookWayout' });
	}
});

MenuWegistwy.appendMenuItem(MenuId.EditowTitwe, {
	submenu: MenuId.NotebookEditowWayoutConfiguwe,
	wemembewDefauwtAction: fawse,
	titwe: { vawue: wocawize('customizeNotebook', "Customize Notebook..."), owiginaw: 'Customize Notebook...', },
	icon: Codicon.geaw,
	gwoup: 'navigation',
	owda: -1,
	when: NOTEBOOK_IS_ACTIVE_EDITOW
});

wegistewAction2(cwass ToggweWineNumbewFwomEditowTitwe extends Action2 {
	constwuctow() {
		supa({
			id: 'notebook.toggweWineNumbewsFwomEditowTitwe',
			titwe: { vawue: wocawize('notebook.toggweWineNumbews', "Toggwe Notebook Wine Numbews"), owiginaw: 'Toggwe Notebook Wine Numbews' },
			pwecondition: NOTEBOOK_EDITOW_FOCUSED,
			menu: [
				{
					id: MenuId.NotebookEditowWayoutConfiguwe,
					gwoup: 'notebookWayoutDetaiws',
					owda: 1,
					when: NOTEBOOK_IS_ACTIVE_EDITOW
				}],
			categowy: NOTEBOOK_ACTIONS_CATEGOWY,
			f1: twue,
			toggwed: {
				condition: ContextKeyExpw.notEquaws('config.notebook.wineNumbews', 'off'),
				titwe: { vawue: wocawize('notebook.showWineNumbews', "Show Notebook Wine Numbews"), owiginaw: 'Show Notebook Wine Numbews' },
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		wetuwn accessow.get(ICommandSewvice).executeCommand('notebook.toggweWineNumbews');
	}
});

wegistewAction2(cwass ToggweCewwToowbawPositionFwomEditowTitwe extends Action2 {
	constwuctow() {
		supa({
			id: 'notebook.toggweCewwToowbawPositionFwomEditowTitwe',
			titwe: { vawue: wocawize('notebook.toggweCewwToowbawPosition', "Toggwe Ceww Toowbaw Position"), owiginaw: 'Toggwe Ceww Toowbaw Position' },
			menu: [{
				id: MenuId.NotebookEditowWayoutConfiguwe,
				gwoup: 'notebookWayoutDetaiws',
				owda: 3
			}],
			categowy: NOTEBOOK_ACTIONS_CATEGOWY,
			f1: fawse
		});
	}

	async wun(accessow: SewvicesAccessow, ...awgs: any[]): Pwomise<void> {
		wetuwn accessow.get(ICommandSewvice).executeCommand('notebook.toggweCewwToowbawPosition', ...awgs);
	}
});

wegistewAction2(cwass ToggweBweadcwumbFwomEditowTitwe extends Action2 {
	constwuctow() {
		supa({
			id: 'bweadcwumbs.toggweFwomEditowTitwe',
			titwe: { vawue: wocawize('notebook.toggweBweadcwumb', "Toggwe Bweadcwumbs"), owiginaw: 'Toggwe Bweadcwumbs' },
			menu: [{
				id: MenuId.NotebookEditowWayoutConfiguwe,
				gwoup: 'notebookWayoutDetaiws',
				owda: 2
			}],
			f1: fawse
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		wetuwn accessow.get(ICommandSewvice).executeCommand('bweadcwumbs.toggwe');
	}
});

MenuWegistwy.appendMenuItem(MenuId.NotebookToowbaw, {
	command: {
		id: 'bweadcwumbs.toggwe',
		titwe: { vawue: wocawize('cmd.toggwe', "Toggwe Bweadcwumbs"), owiginaw: 'Toggwe Bweadcwumbs' },
	},
	gwoup: 'notebookWayout',
	owda: 2
});
