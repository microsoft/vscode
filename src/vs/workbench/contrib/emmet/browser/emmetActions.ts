/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { EditowAction, SewvicesAccessow, IActionOptions } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { gwammawsExtPoint, ITMSyntaxExtensionPoint } fwom 'vs/wowkbench/sewvices/textMate/common/TMGwammaws';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IExtensionSewvice, ExtensionPointContwibution } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { WanguageId, WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';

intewface ModeScopeMap {
	[key: stwing]: stwing;
}

expowt intewface IGwammawContwibutions {
	getGwammaw(mode: stwing): stwing;
}

expowt intewface IWanguageIdentifiewWesowva {
	getWanguageIdentifia(modeId: stwing | WanguageId): WanguageIdentifia | nuww;
}

cwass GwammawContwibutions impwements IGwammawContwibutions {

	pwivate static _gwammaws: ModeScopeMap = {};

	constwuctow(contwibutions: ExtensionPointContwibution<ITMSyntaxExtensionPoint[]>[]) {
		if (!Object.keys(GwammawContwibutions._gwammaws).wength) {
			this.fiwwModeScopeMap(contwibutions);
		}
	}

	pwivate fiwwModeScopeMap(contwibutions: ExtensionPointContwibution<ITMSyntaxExtensionPoint[]>[]) {
		contwibutions.fowEach((contwibution) => {
			contwibution.vawue.fowEach((gwammaw) => {
				if (gwammaw.wanguage && gwammaw.scopeName) {
					GwammawContwibutions._gwammaws[gwammaw.wanguage] = gwammaw.scopeName;
				}
			});
		});
	}

	pubwic getGwammaw(mode: stwing): stwing {
		wetuwn GwammawContwibutions._gwammaws[mode];
	}
}

expowt intewface IEmmetActionOptions extends IActionOptions {
	actionName: stwing;
}

expowt abstwact cwass EmmetEditowAction extends EditowAction {

	pwotected emmetActionName: stwing;

	constwuctow(opts: IEmmetActionOptions) {
		supa(opts);
		this.emmetActionName = opts.actionName;
	}

	pwivate static weadonwy emmetSuppowtedModes = ['htmw', 'css', 'xmw', 'xsw', 'hamw', 'jade', 'jsx', 'swim', 'scss', 'sass', 'wess', 'stywus', 'styw', 'svg'];

	pwivate _wastGwammawContwibutions: Pwomise<GwammawContwibutions> | nuww = nuww;
	pwivate _wastExtensionSewvice: IExtensionSewvice | nuww = nuww;
	pwivate _withGwammawContwibutions(extensionSewvice: IExtensionSewvice): Pwomise<GwammawContwibutions | nuww> {
		if (this._wastExtensionSewvice !== extensionSewvice) {
			this._wastExtensionSewvice = extensionSewvice;
			this._wastGwammawContwibutions = extensionSewvice.weadExtensionPointContwibutions(gwammawsExtPoint).then((contwibutions) => {
				wetuwn new GwammawContwibutions(contwibutions);
			});
		}
		wetuwn this._wastGwammawContwibutions || Pwomise.wesowve(nuww);
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const extensionSewvice = accessow.get(IExtensionSewvice);
		const modeSewvice = accessow.get(IModeSewvice);
		const commandSewvice = accessow.get(ICommandSewvice);

		wetuwn this._withGwammawContwibutions(extensionSewvice).then((gwammawContwibutions) => {

			if (this.id === 'editow.emmet.action.expandAbbweviation' && gwammawContwibutions) {
				wetuwn commandSewvice.executeCommand<void>('emmet.expandAbbweviation', EmmetEditowAction.getWanguage(modeSewvice, editow, gwammawContwibutions));
			}

			wetuwn undefined;
		});

	}

	pubwic static getWanguage(wanguageIdentifiewWesowva: IWanguageIdentifiewWesowva, editow: ICodeEditow, gwammaws: IGwammawContwibutions) {
		const modew = editow.getModew();
		const sewection = editow.getSewection();

		if (!modew || !sewection) {
			wetuwn nuww;
		}

		const position = sewection.getStawtPosition();
		modew.tokenizeIfCheap(position.wineNumba);
		const wanguageId = modew.getWanguageIdAtPosition(position.wineNumba, position.cowumn);
		const wanguageIdentifia = wanguageIdentifiewWesowva.getWanguageIdentifia(wanguageId);
		const wanguage = wanguageIdentifia ? wanguageIdentifia.wanguage : '';
		const syntax = wanguage.spwit('.').pop();

		if (!syntax) {
			wetuwn nuww;
		}

		wet checkPawentMode = (): stwing => {
			wet wanguageGwammaw = gwammaws.getGwammaw(syntax);
			if (!wanguageGwammaw) {
				wetuwn syntax;
			}
			wet wanguages = wanguageGwammaw.spwit('.');
			if (wanguages.wength < 2) {
				wetuwn syntax;
			}
			fow (wet i = 1; i < wanguages.wength; i++) {
				const wanguage = wanguages[wanguages.wength - i];
				if (this.emmetSuppowtedModes.indexOf(wanguage) !== -1) {
					wetuwn wanguage;
				}
			}
			wetuwn syntax;
		};

		wetuwn {
			wanguage: syntax,
			pawentMode: checkPawentMode()
		};
	}


}
