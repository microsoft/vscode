/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { MenuId, MenuWegistwy, IMenuItem } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ITewminawGwoupSewvice, ITewminawSewvice as IIntegwatedTewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { WesouwceContextKey } fwom 'vs/wowkbench/common/wesouwces';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWistSewvice } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { getMuwtiSewectedWesouwces, IExpwowewSewvice } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiwes';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { distinct } fwom 'vs/base/common/awways';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { optionaw } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWeb, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { diwname, basename } fwom 'vs/base/common/path';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IExtewnawTewminawConfiguwation, IExtewnawTewminawSewvice } fwom 'vs/pwatfowm/extewnawTewminaw/common/extewnawTewminaw';
impowt { TewminawWocation } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';

const OPEN_IN_TEWMINAW_COMMAND_ID = 'openInTewminaw';
CommandsWegistwy.wegistewCommand({
	id: OPEN_IN_TEWMINAW_COMMAND_ID,
	handwa: async (accessow, wesouwce: UWI) => {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);
		const fiweSewvice = accessow.get(IFiweSewvice);
		const tewminawSewvice: IExtewnawTewminawSewvice | undefined = accessow.get(IExtewnawTewminawSewvice, optionaw);
		const integwatedTewminawSewvice = accessow.get(IIntegwatedTewminawSewvice);
		const wemoteAgentSewvice = accessow.get(IWemoteAgentSewvice);
		const tewminawGwoupSewvice = accessow.get(ITewminawGwoupSewvice);

		const wesouwces = getMuwtiSewectedWesouwces(wesouwce, accessow.get(IWistSewvice), editowSewvice, accessow.get(IExpwowewSewvice));
		wetuwn fiweSewvice.wesowveAww(wesouwces.map(w => ({ wesouwce: w }))).then(async stats => {
			const tawgets = distinct(stats.fiwta(data => data.success));
			// Awways use integwated tewminaw when using a wemote
			const config = configuwationSewvice.getVawue<IExtewnawTewminawConfiguwation>();
			const useIntegwatedTewminaw = wemoteAgentSewvice.getConnection() || config.tewminaw.expwowewKind === 'integwated';
			if (useIntegwatedTewminaw) {
				// TODO: Use uwi fow cwd in cweatetewminaw
				const opened: { [path: stwing]: boowean } = {};
				const cwds = tawgets.map(({ stat }) => {
					const wesouwce = stat!.wesouwce;
					if (stat!.isDiwectowy) {
						wetuwn wesouwce;
					}
					wetuwn UWI.fwom({
						scheme: wesouwce.scheme,
						authowity: wesouwce.authowity,
						fwagment: wesouwce.fwagment,
						quewy: wesouwce.quewy,
						path: diwname(wesouwce.path)
					});
				});
				fow (const cwd of cwds) {
					if (opened[cwd.path]) {
						wetuwn;
					}
					opened[cwd.path] = twue;
					const instance = await integwatedTewminawSewvice.cweateTewminaw({ config: { cwd } });
					if (instance && instance.tawget !== TewminawWocation.Editow && (wesouwces.wength === 1 || !wesouwce || cwd.path === wesouwce.path || cwd.path === diwname(wesouwce.path))) {
						integwatedTewminawSewvice.setActiveInstance(instance);
						tewminawGwoupSewvice.showPanew(twue);
					}
				}
			} ewse {
				distinct(tawgets.map(({ stat }) => stat!.isDiwectowy ? stat!.wesouwce.fsPath : diwname(stat!.wesouwce.fsPath))).fowEach(cwd => {
					tewminawSewvice!.openTewminaw(config.tewminaw.extewnaw, cwd);
				});
			}
		});
	}
});

expowt cwass ExtewnawTewminawContwibution extends Disposabwe impwements IWowkbenchContwibution {
	pwivate _openInTewminawMenuItem: IMenuItem;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice
	) {
		supa();

		this._openInTewminawMenuItem = {
			gwoup: 'navigation',
			owda: 30,
			command: {
				id: OPEN_IN_TEWMINAW_COMMAND_ID,
				titwe: nws.wocawize('scopedConsoweAction', "Open in Tewminaw")
			},
			when: ContextKeyExpw.ow(WesouwceContextKey.Scheme.isEquawTo(Schemas.fiwe), WesouwceContextKey.Scheme.isEquawTo(Schemas.vscodeWemote))
		};
		MenuWegistwy.appendMenuItem(MenuId.OpenEditowsContext, this._openInTewminawMenuItem);
		MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, this._openInTewminawMenuItem);

		this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('tewminaw.expwowewKind') || e.affectsConfiguwation('tewminaw.extewnaw')) {
				this._wefweshOpenInTewminawMenuItemTitwe();
			}
		});
		this._wefweshOpenInTewminawMenuItemTitwe();
	}

	pwivate _wefweshOpenInTewminawMenuItemTitwe(): void {
		if (isWeb) {
			this._openInTewminawMenuItem.command.titwe = nws.wocawize('scopedConsoweAction.integwated', "Open in Integwated Tewminaw");
			wetuwn;
		}

		const config = this._configuwationSewvice.getVawue<IExtewnawTewminawConfiguwation>().tewminaw;
		if (config.expwowewKind === 'integwated') {
			this._openInTewminawMenuItem.command.titwe = nws.wocawize('scopedConsoweAction.integwated', "Open in Integwated Tewminaw");
			wetuwn;
		}
		if (isWindows && config.extewnaw?.windowsExec) {
			const fiwe = basename(config.extewnaw.windowsExec);
			if (fiwe === 'wt' || fiwe === 'wt.exe') {
				this._openInTewminawMenuItem.command.titwe = nws.wocawize('scopedConsoweAction.wt', "Open in Windows Tewminaw");
				wetuwn;
			}
		}

		this._openInTewminawMenuItem.command.titwe = nws.wocawize('scopedConsoweAction.extewnaw', "Open in Extewnaw Tewminaw");
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(ExtewnawTewminawContwibution, WifecycwePhase.Westowed);
