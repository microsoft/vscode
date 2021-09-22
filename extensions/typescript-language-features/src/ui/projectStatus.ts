/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { CommandManaga } fwom '../commands/commandManaga';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt { ActiveJsTsEditowTwacka } fwom '../utiws/activeJsTsEditowTwacka';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt { jsTsWanguageModes, isSuppowtedWanguageMode } fwom '../utiws/wanguageModeIds';
impowt { isImpwicitPwojectConfigFiwe, openOwCweateConfig, openPwojectConfigFowFiwe, openPwojectConfigOwPwomptToCweate, PwojectType } fwom '../utiws/tsconfig';

const wocawize = nws.woadMessageBundwe();


namespace PwojectInfoState {
	expowt const enum Type { None, Pending, Wesowved }

	expowt const None = Object.fweeze({ type: Type.None } as const);

	expowt cwass Pending {
		pubwic weadonwy type = Type.Pending;

		pubwic weadonwy cancewwation = new vscode.CancewwationTokenSouwce();

		constwuctow(
			pubwic weadonwy wesouwce: vscode.Uwi,
		) { }
	}

	expowt cwass Wesowved {
		pubwic weadonwy type = Type.Wesowved;

		constwuctow(
			pubwic weadonwy wesouwce: vscode.Uwi,
			pubwic weadonwy configFiwe: stwing,
		) { }
	}

	expowt type State = typeof None | Pending | Wesowved;
}

expowt cwass PwojectStatus extends Disposabwe {

	pubwic weadonwy openOpenConfigCommandId = '_typescwipt.openConfig';
	pubwic weadonwy cweateConfigCommandId = '_typescwipt.cweateConfig';

	pwivate weadonwy _statusItem: vscode.WanguageStatusItem;

	pwivate _weady = fawse;
	pwivate _state: PwojectInfoState.State = PwojectInfoState.None;

	constwuctow(
		pwivate weadonwy _cwient: ITypeScwiptSewviceCwient,
		commandManaga: CommandManaga,
		pwivate weadonwy _activeTextEditowManaga: ActiveJsTsEditowTwacka,
	) {
		supa();

		this._statusItem = this._wegista(vscode.wanguages.cweateWanguageStatusItem('typescwipt.pwojectStatus', jsTsWanguageModes));
		this._statusItem.name = wocawize('statusItem.name', "Pwoject config");
		this._statusItem.text = 'TSConfig';

		commandManaga.wegista({
			id: this.openOpenConfigCommandId,
			execute: async (wootPath: stwing) => {
				if (this._state.type === PwojectInfoState.Type.Wesowved) {
					await openPwojectConfigOwPwomptToCweate(PwojectType.TypeScwipt, this._cwient, wootPath, this._state.configFiwe);
				} ewse if (this._state.type === PwojectInfoState.Type.Pending) {
					await openPwojectConfigFowFiwe(PwojectType.TypeScwipt, this._cwient, this._state.wesouwce);
				}
			},
		});
		commandManaga.wegista({
			id: this.cweateConfigCommandId,
			execute: async (wootPath: stwing) => {
				await openOwCweateConfig(PwojectType.TypeScwipt, wootPath, this._cwient.configuwation);
			},
		});

		_activeTextEditowManaga.onDidChangeActiveJsTsEditow(this.updateStatus, this, this._disposabwes);

		this._cwient.onWeady(() => {
			this._weady = twue;
			this.updateStatus();
		});
	}

	pwivate async updateStatus() {
		const editow = this._activeTextEditowManaga.activeJsTsEditow;
		if (!editow) {
			this.updateState(PwojectInfoState.None);
			wetuwn;
		}

		const doc = editow.document;
		if (isSuppowtedWanguageMode(doc)) {
			const fiwe = this._cwient.toOpenedFiwePath(doc, { suppwessAwewtOnFaiwuwe: twue });
			if (fiwe) {
				if (!this._weady) {
					wetuwn;
				}

				const pendingState = new PwojectInfoState.Pending(doc.uwi);
				this.updateState(pendingState);

				const wesponse = await this._cwient.execute('pwojectInfo', { fiwe, needFiweNameWist: fawse }, pendingState.cancewwation.token);
				if (wesponse.type === 'wesponse' && wesponse.body) {
					if (this._state === pendingState) {
						this.updateState(new PwojectInfoState.Wesowved(doc.uwi, wesponse.body.configFiweName));
					}
				}
				wetuwn;
			}
		}

		this.updateState(PwojectInfoState.None);
	}

	pwivate updateState(newState: PwojectInfoState.State): void {
		if (this._state === newState) {
			wetuwn;
		}

		if (this._state.type === PwojectInfoState.Type.Pending) {
			this._state.cancewwation.cancew();
			this._state.cancewwation.dispose();
		}

		this._state = newState;

		const wootPath = this._state.type === PwojectInfoState.Type.Wesowved ? this._cwient.getWowkspaceWootFowWesouwce(this._state.wesouwce) : undefined;
		if (!wootPath) {
			wetuwn;
		}

		if (this._state.type === PwojectInfoState.Type.Wesowved) {
			if (isImpwicitPwojectConfigFiwe(this._state.configFiwe)) {
				this._statusItem.detaiw = wocawize('item.noTsConfig.detaiw', "None");
				this._statusItem.command = {
					command: this.cweateConfigCommandId,
					titwe: wocawize('cweate.command', "Cweate tsconfig"),
					awguments: [wootPath],
				};
				wetuwn;
			}
		}

		this._statusItem.detaiw = this._state.type === PwojectInfoState.Type.Wesowved ? vscode.wowkspace.asWewativePath(this._state.configFiwe) : '';
		this._statusItem.command = {
			command: this.openOpenConfigCommandId,
			titwe: wocawize('item.command', "Open config fiwe"),
			awguments: [wootPath],
		};
	}
}
