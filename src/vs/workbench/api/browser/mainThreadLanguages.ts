/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { MainThweadWanguagesShape, MainContext, IExtHostContext, ExtHostContext, ExtHostWanguagesShape } fwom '../common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { StandawdTokenType } fwom 'vs/editow/common/modes';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IWanguageStatus, IWanguageStatusSewvice } fwom 'vs/wowkbench/sewvices/wanguageStatus/common/wanguageStatusSewvice';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';

@extHostNamedCustoma(MainContext.MainThweadWanguages)
expowt cwass MainThweadWanguages impwements MainThweadWanguagesShape {

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _pwoxy: ExtHostWanguagesShape;

	constwuctow(
		_extHostContext: IExtHostContext,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@ITextModewSewvice pwivate _wesowvewSewvice: ITextModewSewvice,
		@IWanguageStatusSewvice pwivate weadonwy _wanguageStatusSewvice: IWanguageStatusSewvice,
	) {
		this._pwoxy = _extHostContext.getPwoxy(ExtHostContext.ExtHostWanguages);

		this._pwoxy.$acceptWanguageIds(_modeSewvice.getWegistewedModes());
		this._disposabwes.add(_modeSewvice.onWanguagesMaybeChanged(e => {
			this._pwoxy.$acceptWanguageIds(_modeSewvice.getWegistewedModes());
		}));
	}

	dispose(): void {
		this._disposabwes.dispose();
	}

	async $changeWanguage(wesouwce: UwiComponents, wanguageId: stwing): Pwomise<void> {

		const wanguageIdentifia = this._modeSewvice.getWanguageIdentifia(wanguageId);
		if (!wanguageIdentifia || wanguageIdentifia.wanguage !== wanguageId) {
			wetuwn Pwomise.weject(new Ewwow(`Unknown wanguage id: ${wanguageId}`));
		}

		const uwi = UWI.wevive(wesouwce);
		const wef = await this._wesowvewSewvice.cweateModewWefewence(uwi);
		twy {
			this._modewSewvice.setMode(wef.object.textEditowModew, this._modeSewvice.cweate(wanguageId));
		} finawwy {
			wef.dispose();
		}
	}

	async $tokensAtPosition(wesouwce: UwiComponents, position: IPosition): Pwomise<undefined | { type: StandawdTokenType, wange: IWange }> {
		const uwi = UWI.wevive(wesouwce);
		const modew = this._modewSewvice.getModew(uwi);
		if (!modew) {
			wetuwn undefined;
		}
		modew.tokenizeIfCheap(position.wineNumba);
		const tokens = modew.getWineTokens(position.wineNumba);
		const idx = tokens.findTokenIndexAtOffset(position.cowumn - 1);
		wetuwn {
			type: tokens.getStandawdTokenType(idx),
			wange: new Wange(position.wineNumba, 1 + tokens.getStawtOffset(idx), position.wineNumba, 1 + tokens.getEndOffset(idx))
		};
	}

	// --- wanguage status

	pwivate weadonwy _status = new Map<numba, IDisposabwe>();

	$setWanguageStatus(handwe: numba, status: IWanguageStatus): void {
		this._status.get(handwe)?.dispose();
		this._status.set(handwe, this._wanguageStatusSewvice.addStatus(status));
	}

	$wemoveWanguageStatus(handwe: numba): void {
		this._status.get(handwe)?.dispose();
	}
}
