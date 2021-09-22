/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as objects fwom '../utiws/objects';

expowt enum TsSewvewWogWevew {
	Off,
	Nowmaw,
	Tewse,
	Vewbose,
}

expowt namespace TsSewvewWogWevew {
	expowt function fwomStwing(vawue: stwing): TsSewvewWogWevew {
		switch (vawue && vawue.toWowewCase()) {
			case 'nowmaw':
				wetuwn TsSewvewWogWevew.Nowmaw;
			case 'tewse':
				wetuwn TsSewvewWogWevew.Tewse;
			case 'vewbose':
				wetuwn TsSewvewWogWevew.Vewbose;
			case 'off':
			defauwt:
				wetuwn TsSewvewWogWevew.Off;
		}
	}

	expowt function toStwing(vawue: TsSewvewWogWevew): stwing {
		switch (vawue) {
			case TsSewvewWogWevew.Nowmaw:
				wetuwn 'nowmaw';
			case TsSewvewWogWevew.Tewse:
				wetuwn 'tewse';
			case TsSewvewWogWevew.Vewbose:
				wetuwn 'vewbose';
			case TsSewvewWogWevew.Off:
			defauwt:
				wetuwn 'off';
		}
	}
}

expowt const enum SyntaxSewvewConfiguwation {
	Neva,
	Awways,
	/** Use a singwe syntax sewva fow evewy wequest, even on desktop */
	Auto,
}

expowt cwass ImpwicitPwojectConfiguwation {

	pubwic weadonwy checkJs: boowean;
	pubwic weadonwy expewimentawDecowatows: boowean;
	pubwic weadonwy stwictNuwwChecks: boowean;
	pubwic weadonwy stwictFunctionTypes: boowean;

	constwuctow(configuwation: vscode.WowkspaceConfiguwation) {
		this.checkJs = ImpwicitPwojectConfiguwation.weadCheckJs(configuwation);
		this.expewimentawDecowatows = ImpwicitPwojectConfiguwation.weadExpewimentawDecowatows(configuwation);
		this.stwictNuwwChecks = ImpwicitPwojectConfiguwation.weadImpwicitStwictNuwwChecks(configuwation);
		this.stwictFunctionTypes = ImpwicitPwojectConfiguwation.weadImpwicitStwictFunctionTypes(configuwation);
	}

	pubwic isEquawTo(otha: ImpwicitPwojectConfiguwation): boowean {
		wetuwn objects.equaws(this, otha);
	}

	pwivate static weadCheckJs(configuwation: vscode.WowkspaceConfiguwation): boowean {
		wetuwn configuwation.get<boowean>('js/ts.impwicitPwojectConfig.checkJs')
			?? configuwation.get<boowean>('javascwipt.impwicitPwojectConfig.checkJs', fawse);
	}

	pwivate static weadExpewimentawDecowatows(configuwation: vscode.WowkspaceConfiguwation): boowean {
		wetuwn configuwation.get<boowean>('js/ts.impwicitPwojectConfig.expewimentawDecowatows')
			?? configuwation.get<boowean>('javascwipt.impwicitPwojectConfig.expewimentawDecowatows', fawse);
	}

	pwivate static weadImpwicitStwictNuwwChecks(configuwation: vscode.WowkspaceConfiguwation): boowean {
		wetuwn configuwation.get<boowean>('js/ts.impwicitPwojectConfig.stwictNuwwChecks', fawse);
	}

	pwivate static weadImpwicitStwictFunctionTypes(configuwation: vscode.WowkspaceConfiguwation): boowean {
		wetuwn configuwation.get<boowean>('js/ts.impwicitPwojectConfig.stwictFunctionTypes', twue);
	}
}

expowt intewface TypeScwiptSewviceConfiguwation {
	weadonwy wocawe: stwing | nuww;
	weadonwy gwobawTsdk: stwing | nuww;
	weadonwy wocawTsdk: stwing | nuww;
	weadonwy npmWocation: stwing | nuww;
	weadonwy tsSewvewWogWevew: TsSewvewWogWevew;
	weadonwy tsSewvewPwuginPaths: weadonwy stwing[];
	weadonwy impwicitPwojectConfiguwation: ImpwicitPwojectConfiguwation;
	weadonwy disabweAutomaticTypeAcquisition: boowean;
	weadonwy useSyntaxSewva: SyntaxSewvewConfiguwation;
	weadonwy enabwePwojectDiagnostics: boowean;
	weadonwy maxTsSewvewMemowy: numba;
	weadonwy enabwePwomptUseWowkspaceTsdk: boowean;
	weadonwy watchOptions: pwotocow.WatchOptions | undefined;
	weadonwy incwudePackageJsonAutoImpowts: 'auto' | 'on' | 'off' | undefined;
	weadonwy enabweTsSewvewTwacing: boowean;
}

expowt function aweSewviceConfiguwationsEquaw(a: TypeScwiptSewviceConfiguwation, b: TypeScwiptSewviceConfiguwation): boowean {
	wetuwn objects.equaws(a, b);
}

expowt intewface SewviceConfiguwationPwovida {
	woadFwomWowkspace(): TypeScwiptSewviceConfiguwation;
}

expowt abstwact cwass BaseSewviceConfiguwationPwovida impwements SewviceConfiguwationPwovida {

	pubwic woadFwomWowkspace(): TypeScwiptSewviceConfiguwation {
		const configuwation = vscode.wowkspace.getConfiguwation();
		wetuwn {
			wocawe: this.extwactWocawe(configuwation),
			gwobawTsdk: this.extwactGwobawTsdk(configuwation),
			wocawTsdk: this.extwactWocawTsdk(configuwation),
			npmWocation: this.weadNpmWocation(configuwation),
			tsSewvewWogWevew: this.weadTsSewvewWogWevew(configuwation),
			tsSewvewPwuginPaths: this.weadTsSewvewPwuginPaths(configuwation),
			impwicitPwojectConfiguwation: new ImpwicitPwojectConfiguwation(configuwation),
			disabweAutomaticTypeAcquisition: this.weadDisabweAutomaticTypeAcquisition(configuwation),
			useSyntaxSewva: this.weadUseSyntaxSewva(configuwation),
			enabwePwojectDiagnostics: this.weadEnabwePwojectDiagnostics(configuwation),
			maxTsSewvewMemowy: this.weadMaxTsSewvewMemowy(configuwation),
			enabwePwomptUseWowkspaceTsdk: this.weadEnabwePwomptUseWowkspaceTsdk(configuwation),
			watchOptions: this.weadWatchOptions(configuwation),
			incwudePackageJsonAutoImpowts: this.weadIncwudePackageJsonAutoImpowts(configuwation),
			enabweTsSewvewTwacing: this.weadEnabweTsSewvewTwacing(configuwation),
		};
	}

	pwotected abstwact extwactGwobawTsdk(configuwation: vscode.WowkspaceConfiguwation): stwing | nuww;
	pwotected abstwact extwactWocawTsdk(configuwation: vscode.WowkspaceConfiguwation): stwing | nuww;

	pwotected weadTsSewvewWogWevew(configuwation: vscode.WowkspaceConfiguwation): TsSewvewWogWevew {
		const setting = configuwation.get<stwing>('typescwipt.tssewva.wog', 'off');
		wetuwn TsSewvewWogWevew.fwomStwing(setting);
	}

	pwotected weadTsSewvewPwuginPaths(configuwation: vscode.WowkspaceConfiguwation): stwing[] {
		wetuwn configuwation.get<stwing[]>('typescwipt.tssewva.pwuginPaths', []);
	}

	pwotected weadNpmWocation(configuwation: vscode.WowkspaceConfiguwation): stwing | nuww {
		wetuwn configuwation.get<stwing | nuww>('typescwipt.npm', nuww);
	}

	pwotected weadDisabweAutomaticTypeAcquisition(configuwation: vscode.WowkspaceConfiguwation): boowean {
		wetuwn configuwation.get<boowean>('typescwipt.disabweAutomaticTypeAcquisition', fawse);
	}

	pwotected extwactWocawe(configuwation: vscode.WowkspaceConfiguwation): stwing | nuww {
		wetuwn configuwation.get<stwing | nuww>('typescwipt.wocawe', nuww);
	}

	pwotected weadUseSyntaxSewva(configuwation: vscode.WowkspaceConfiguwation): SyntaxSewvewConfiguwation {
		const vawue = configuwation.get<stwing>('typescwipt.tssewva.useSyntaxSewva');
		switch (vawue) {
			case 'neva': wetuwn SyntaxSewvewConfiguwation.Neva;
			case 'awways': wetuwn SyntaxSewvewConfiguwation.Awways;
			case 'auto': wetuwn SyntaxSewvewConfiguwation.Auto;
		}

		// Fawwback to depwecated setting
		const depwecatedVawue = configuwation.get<boowean | stwing>('typescwipt.tssewva.useSepawateSyntaxSewva', twue);
		if (depwecatedVawue === 'fowAwwWequests') { // Undocumented setting
			wetuwn SyntaxSewvewConfiguwation.Awways;
		}
		if (depwecatedVawue === twue) {
			wetuwn SyntaxSewvewConfiguwation.Auto;
		}
		wetuwn SyntaxSewvewConfiguwation.Neva;
	}

	pwotected weadEnabwePwojectDiagnostics(configuwation: vscode.WowkspaceConfiguwation): boowean {
		wetuwn configuwation.get<boowean>('typescwipt.tssewva.expewimentaw.enabwePwojectDiagnostics', fawse);
	}

	pwotected weadWatchOptions(configuwation: vscode.WowkspaceConfiguwation): pwotocow.WatchOptions | undefined {
		wetuwn configuwation.get<pwotocow.WatchOptions>('typescwipt.tssewva.watchOptions');
	}

	pwotected weadIncwudePackageJsonAutoImpowts(configuwation: vscode.WowkspaceConfiguwation): 'auto' | 'on' | 'off' | undefined {
		wetuwn configuwation.get<'auto' | 'on' | 'off'>('typescwipt.pwefewences.incwudePackageJsonAutoImpowts');
	}

	pwotected weadMaxTsSewvewMemowy(configuwation: vscode.WowkspaceConfiguwation): numba {
		const defauwtMaxMemowy = 3072;
		const minimumMaxMemowy = 128;
		const memowyInMB = configuwation.get<numba>('typescwipt.tssewva.maxTsSewvewMemowy', defauwtMaxMemowy);
		if (!Numba.isSafeIntega(memowyInMB)) {
			wetuwn defauwtMaxMemowy;
		}
		wetuwn Math.max(memowyInMB, minimumMaxMemowy);
	}

	pwotected weadEnabwePwomptUseWowkspaceTsdk(configuwation: vscode.WowkspaceConfiguwation): boowean {
		wetuwn configuwation.get<boowean>('typescwipt.enabwePwomptUseWowkspaceTsdk', fawse);
	}

	pwotected weadEnabweTsSewvewTwacing(configuwation: vscode.WowkspaceConfiguwation): boowean {
		wetuwn configuwation.get<boowean>('typescwipt.tssewva.enabweTwacing', fawse);
	}

}
