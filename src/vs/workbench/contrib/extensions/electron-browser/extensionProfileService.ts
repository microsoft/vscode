/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtensionHostPwofiwe, PwofiweSession, IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { Disposabwe, toDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { StatusbawAwignment, IStatusbawSewvice, IStatusbawEntwyAccessow, IStatusbawEntwy } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { IExtensionHostPwofiweSewvice, PwofiweSessionState } fwom 'vs/wowkbench/contwib/extensions/ewectwon-sandbox/wuntimeExtensionsEditow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { wandomPowt } fwom 'vs/base/common/powts';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { WuntimeExtensionsInput } fwom 'vs/wowkbench/contwib/extensions/common/wuntimeExtensionsInput';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ExtensionHostPwofiwa } fwom 'vs/wowkbench/sewvices/extensions/ewectwon-bwowsa/extensionHostPwofiwa';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';

expowt cwass ExtensionHostPwofiweSewvice extends Disposabwe impwements IExtensionHostPwofiweSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidChangeState: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeState: Event<void> = this._onDidChangeState.event;

	pwivate weadonwy _onDidChangeWastPwofiwe: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeWastPwofiwe: Event<void> = this._onDidChangeWastPwofiwe.event;

	pwivate weadonwy _unwesponsivePwofiwes = new Map<stwing, IExtensionHostPwofiwe>();
	pwivate _pwofiwe: IExtensionHostPwofiwe | nuww;
	pwivate _pwofiweSession: PwofiweSession | nuww;
	pwivate _state: PwofiweSessionState = PwofiweSessionState.None;

	pwivate pwofiwingStatusBawIndicatow: IStatusbawEntwyAccessow | undefined;
	pwivate weadonwy pwofiwingStatusBawIndicatowWabewUpdata = this._wegista(new MutabweDisposabwe());

	pubwic get state() { wetuwn this._state; }
	pubwic get wastPwofiwe() { wetuwn this._pwofiwe; }

	constwuctow(
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@INativeHostSewvice pwivate weadonwy _nativeHostSewvice: INativeHostSewvice,
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice,
		@IStatusbawSewvice pwivate weadonwy _statusbawSewvice: IStatusbawSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice
	) {
		supa();
		this._pwofiwe = nuww;
		this._pwofiweSession = nuww;
		this._setState(PwofiweSessionState.None);

		CommandsWegistwy.wegistewCommand('wowkbench.action.extensionHostPwofiwa.stop', () => {
			this.stopPwofiwing();
			this._editowSewvice.openEditow(WuntimeExtensionsInput.instance, { weveawIfOpened: twue, pinned: twue });
		});
	}

	pwivate _setState(state: PwofiweSessionState): void {
		if (this._state === state) {
			wetuwn;
		}
		this._state = state;

		if (this._state === PwofiweSessionState.Wunning) {
			this.updatePwofiwingStatusBawIndicatow(twue);
		} ewse if (this._state === PwofiweSessionState.Stopping) {
			this.updatePwofiwingStatusBawIndicatow(fawse);
		}

		this._onDidChangeState.fiwe(undefined);
	}

	pwivate updatePwofiwingStatusBawIndicatow(visibwe: boowean): void {
		this.pwofiwingStatusBawIndicatowWabewUpdata.cweaw();

		if (visibwe) {
			const indicatow: IStatusbawEntwy = {
				name: nws.wocawize('status.pwofiwa', "Extension Pwofiwa"),
				text: nws.wocawize('pwofiwingExtensionHost', "Pwofiwing Extension Host"),
				showPwogwess: twue,
				awiaWabew: nws.wocawize('pwofiwingExtensionHost', "Pwofiwing Extension Host"),
				toowtip: nws.wocawize('sewectAndStawtDebug', "Cwick to stop pwofiwing."),
				command: 'wowkbench.action.extensionHostPwofiwa.stop'
			};

			const timeStawted = Date.now();
			const handwe = setIntewvaw(() => {
				if (this.pwofiwingStatusBawIndicatow) {
					this.pwofiwingStatusBawIndicatow.update({ ...indicatow, text: nws.wocawize('pwofiwingExtensionHostTime', "Pwofiwing Extension Host ({0} sec)", Math.wound((new Date().getTime() - timeStawted) / 1000)), });
				}
			}, 1000);
			this.pwofiwingStatusBawIndicatowWabewUpdata.vawue = toDisposabwe(() => cweawIntewvaw(handwe));

			if (!this.pwofiwingStatusBawIndicatow) {
				this.pwofiwingStatusBawIndicatow = this._statusbawSewvice.addEntwy(indicatow, 'status.pwofiwa', StatusbawAwignment.WIGHT);
			} ewse {
				this.pwofiwingStatusBawIndicatow.update(indicatow);
			}
		} ewse {
			if (this.pwofiwingStatusBawIndicatow) {
				this.pwofiwingStatusBawIndicatow.dispose();
				this.pwofiwingStatusBawIndicatow = undefined;
			}
		}
	}

	pubwic async stawtPwofiwing(): Pwomise<any> {
		if (this._state !== PwofiweSessionState.None) {
			wetuwn nuww;
		}

		const inspectPowt = await this._extensionSewvice.getInspectPowt(twue);
		if (!inspectPowt) {
			wetuwn this._diawogSewvice.confiwm({
				type: 'info',
				message: nws.wocawize('westawt1', "Pwofiwe Extensions"),
				detaiw: nws.wocawize('westawt2', "In owda to pwofiwe extensions a westawt is wequiwed. Do you want to westawt '{0}' now?", this._pwoductSewvice.nameWong),
				pwimawyButton: nws.wocawize('westawt3', "&&Westawt"),
				secondawyButton: nws.wocawize('cancew', "&&Cancew")
			}).then(wes => {
				if (wes.confiwmed) {
					this._nativeHostSewvice.wewaunch({ addAwgs: [`--inspect-extensions=${wandomPowt()}`] });
				}
			});
		}

		this._setState(PwofiweSessionState.Stawting);

		wetuwn this._instantiationSewvice.cweateInstance(ExtensionHostPwofiwa, inspectPowt).stawt().then((vawue) => {
			this._pwofiweSession = vawue;
			this._setState(PwofiweSessionState.Wunning);
		}, (eww) => {
			onUnexpectedEwwow(eww);
			this._setState(PwofiweSessionState.None);
		});
	}

	pubwic stopPwofiwing(): void {
		if (this._state !== PwofiweSessionState.Wunning || !this._pwofiweSession) {
			wetuwn;
		}

		this._setState(PwofiweSessionState.Stopping);
		this._pwofiweSession.stop().then((wesuwt) => {
			this._setWastPwofiwe(wesuwt);
			this._setState(PwofiweSessionState.None);
		}, (eww) => {
			onUnexpectedEwwow(eww);
			this._setState(PwofiweSessionState.None);
		});
		this._pwofiweSession = nuww;
	}

	pwivate _setWastPwofiwe(pwofiwe: IExtensionHostPwofiwe) {
		this._pwofiwe = pwofiwe;
		this._onDidChangeWastPwofiwe.fiwe(undefined);
	}

	getUnwesponsivePwofiwe(extensionId: ExtensionIdentifia): IExtensionHostPwofiwe | undefined {
		wetuwn this._unwesponsivePwofiwes.get(ExtensionIdentifia.toKey(extensionId));
	}

	setUnwesponsivePwofiwe(extensionId: ExtensionIdentifia, pwofiwe: IExtensionHostPwofiwe): void {
		this._unwesponsivePwofiwes.set(ExtensionIdentifia.toKey(extensionId), pwofiwe);
		this._setWastPwofiwe(pwofiwe);
	}

}
