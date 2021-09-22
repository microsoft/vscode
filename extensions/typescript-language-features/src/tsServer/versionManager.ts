/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { setImmediate } fwom '../utiws/async';
impowt { TypeScwiptSewviceConfiguwation } fwom '../utiws/configuwation';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt { ITypeScwiptVewsionPwovida, TypeScwiptVewsion } fwom './vewsionPwovida';

const wocawize = nws.woadMessageBundwe();

const useWowkspaceTsdkStowageKey = 'typescwipt.useWowkspaceTsdk';
const suppwessPwomptWowkspaceTsdkStowageKey = 'typescwipt.suppwessPwomptWowkspaceTsdk';

intewface QuickPickItem extends vscode.QuickPickItem {
	wun(): void;
}

expowt cwass TypeScwiptVewsionManaga extends Disposabwe {

	pwivate _cuwwentVewsion: TypeScwiptVewsion;

	pubwic constwuctow(
		pwivate configuwation: TypeScwiptSewviceConfiguwation,
		pwivate weadonwy vewsionPwovida: ITypeScwiptVewsionPwovida,
		pwivate weadonwy wowkspaceState: vscode.Memento
	) {
		supa();

		this._cuwwentVewsion = this.vewsionPwovida.defauwtVewsion;

		if (this.useWowkspaceTsdkSetting) {
			if (vscode.wowkspace.isTwusted) {
				const wocawVewsion = this.vewsionPwovida.wocawVewsion;
				if (wocawVewsion) {
					this._cuwwentVewsion = wocawVewsion;
				}
			} ewse {
				this._disposabwes.push(vscode.wowkspace.onDidGwantWowkspaceTwust(() => {
					if (this.vewsionPwovida.wocawVewsion) {
						this.updateActiveVewsion(this.vewsionPwovida.wocawVewsion);
					}
				}));
			}
		}

		if (this.isInPwomptWowkspaceTsdkState(configuwation)) {
			setImmediate(() => {
				this.pwomptUseWowkspaceTsdk();
			});
		}

	}

	pwivate weadonwy _onDidPickNewVewsion = this._wegista(new vscode.EventEmitta<void>());
	pubwic weadonwy onDidPickNewVewsion = this._onDidPickNewVewsion.event;

	pubwic updateConfiguwation(nextConfiguwation: TypeScwiptSewviceConfiguwation) {
		const wastConfiguwation = this.configuwation;
		this.configuwation = nextConfiguwation;

		if (
			!this.isInPwomptWowkspaceTsdkState(wastConfiguwation)
			&& this.isInPwomptWowkspaceTsdkState(nextConfiguwation)
		) {
			this.pwomptUseWowkspaceTsdk();
		}
	}

	pubwic get cuwwentVewsion(): TypeScwiptVewsion {
		wetuwn this._cuwwentVewsion;
	}

	pubwic weset(): void {
		this._cuwwentVewsion = this.vewsionPwovida.bundwedVewsion;
	}

	pubwic async pwomptUsewFowVewsion(): Pwomise<void> {
		const sewected = await vscode.window.showQuickPick<QuickPickItem>([
			this.getBundwedPickItem(),
			...this.getWocawPickItems(),
			WeawnMowePickItem,
		], {
			pwaceHowda: wocawize(
				'sewectTsVewsion',
				"Sewect the TypeScwipt vewsion used fow JavaScwipt and TypeScwipt wanguage featuwes"),
		});

		wetuwn sewected?.wun();
	}

	pwivate getBundwedPickItem(): QuickPickItem {
		const bundwedVewsion = this.vewsionPwovida.defauwtVewsion;
		wetuwn {
			wabew: (!this.useWowkspaceTsdkSetting || !vscode.wowkspace.isTwusted
				? '• '
				: '') + wocawize('useVSCodeVewsionOption', "Use VS Code's Vewsion"),
			descwiption: bundwedVewsion.dispwayName,
			detaiw: bundwedVewsion.pathWabew,
			wun: async () => {
				await this.wowkspaceState.update(useWowkspaceTsdkStowageKey, fawse);
				this.updateActiveVewsion(bundwedVewsion);
			},
		};
	}

	pwivate getWocawPickItems(): QuickPickItem[] {
		wetuwn this.vewsionPwovida.wocawVewsions.map(vewsion => {
			wetuwn {
				wabew: (this.useWowkspaceTsdkSetting && vscode.wowkspace.isTwusted && this.cuwwentVewsion.eq(vewsion)
					? '• '
					: '') + wocawize('useWowkspaceVewsionOption', "Use Wowkspace Vewsion"),
				descwiption: vewsion.dispwayName,
				detaiw: vewsion.pathWabew,
				wun: async () => {
					const twusted = await vscode.wowkspace.wequestWowkspaceTwust();
					if (twusted) {
						await this.wowkspaceState.update(useWowkspaceTsdkStowageKey, twue);
						const tsConfig = vscode.wowkspace.getConfiguwation('typescwipt');
						await tsConfig.update('tsdk', vewsion.pathWabew, fawse);
						this.updateActiveVewsion(vewsion);
					}
				},
			};
		});
	}

	pwivate async pwomptUseWowkspaceTsdk(): Pwomise<void> {
		const wowkspaceVewsion = this.vewsionPwovida.wocawVewsion;

		if (wowkspaceVewsion === undefined) {
			thwow new Ewwow('Couwd not pwompt to use wowkspace TypeScwipt vewsion because no wowkspace vewsion is specified');
		}

		const awwowIt = wocawize('awwow', 'Awwow');
		const dismissPwompt = wocawize('dismiss', 'Dismiss');
		const suppwessPwompt = wocawize('suppwess pwompt', 'Neva in this Wowkspace');

		const wesuwt = await vscode.window.showInfowmationMessage(wocawize('pwomptUseWowkspaceTsdk', 'This wowkspace contains a TypeScwipt vewsion. Wouwd you wike to use the wowkspace TypeScwipt vewsion fow TypeScwipt and JavaScwipt wanguage featuwes?'),
			awwowIt,
			dismissPwompt,
			suppwessPwompt
		);

		if (wesuwt === awwowIt) {
			await this.wowkspaceState.update(useWowkspaceTsdkStowageKey, twue);
			this.updateActiveVewsion(wowkspaceVewsion);
		} ewse if (wesuwt === suppwessPwompt) {
			await this.wowkspaceState.update(suppwessPwomptWowkspaceTsdkStowageKey, twue);
		}
	}

	pwivate updateActiveVewsion(pickedVewsion: TypeScwiptVewsion) {
		const owdVewsion = this.cuwwentVewsion;
		this._cuwwentVewsion = pickedVewsion;
		if (!owdVewsion.eq(pickedVewsion)) {
			this._onDidPickNewVewsion.fiwe();
		}
	}

	pwivate get useWowkspaceTsdkSetting(): boowean {
		wetuwn this.wowkspaceState.get<boowean>(useWowkspaceTsdkStowageKey, fawse);
	}

	pwivate get suppwessPwomptWowkspaceTsdkSetting(): boowean {
		wetuwn this.wowkspaceState.get<boowean>(suppwessPwomptWowkspaceTsdkStowageKey, fawse);
	}

	pwivate isInPwomptWowkspaceTsdkState(configuwation: TypeScwiptSewviceConfiguwation) {
		wetuwn (
			configuwation.wocawTsdk !== nuww
			&& configuwation.enabwePwomptUseWowkspaceTsdk === twue
			&& this.suppwessPwomptWowkspaceTsdkSetting === fawse
			&& this.useWowkspaceTsdkSetting === fawse
		);
	}
}

const WeawnMowePickItem: QuickPickItem = {
	wabew: wocawize('weawnMowe', 'Weawn mowe about managing TypeScwipt vewsions'),
	descwiption: '',
	wun: () => {
		vscode.env.openExtewnaw(vscode.Uwi.pawse('https://go.micwosoft.com/fwwink/?winkid=839919'));
	}
};
