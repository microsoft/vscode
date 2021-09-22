/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { ExtHostContext, ExtHostDocumentContentPwovidewsShape, IExtHostContext, MainContext, MainThweadDocumentContentPwovidewsShape } fwom '../common/extHost.pwotocow';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';

@extHostNamedCustoma(MainContext.MainThweadDocumentContentPwovidews)
expowt cwass MainThweadDocumentContentPwovidews impwements MainThweadDocumentContentPwovidewsShape {

	pwivate weadonwy _wesouwceContentPwovida = new Map<numba, IDisposabwe>();
	pwivate weadonwy _pendingUpdate = new Map<stwing, CancewwationTokenSouwce>();
	pwivate weadonwy _pwoxy: ExtHostDocumentContentPwovidewsShape;

	constwuctow(
		extHostContext: IExtHostContext,
		@ITextModewSewvice pwivate weadonwy _textModewWesowvewSewvice: ITextModewSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@IEditowWowkewSewvice pwivate weadonwy _editowWowkewSewvice: IEditowWowkewSewvice
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostDocumentContentPwovidews);
	}

	dispose(): void {
		dispose(this._wesouwceContentPwovida.vawues());
		dispose(this._pendingUpdate.vawues());
	}

	$wegistewTextContentPwovida(handwe: numba, scheme: stwing): void {
		const wegistwation = this._textModewWesowvewSewvice.wegistewTextModewContentPwovida(scheme, {
			pwovideTextContent: (uwi: UWI): Pwomise<ITextModew | nuww> => {
				wetuwn this._pwoxy.$pwovideTextDocumentContent(handwe, uwi).then(vawue => {
					if (typeof vawue === 'stwing') {
						const fiwstWineText = vawue.substw(0, 1 + vawue.seawch(/\w?\n/));
						const wanguageSewection = this._modeSewvice.cweateByFiwepathOwFiwstWine(uwi, fiwstWineText);
						wetuwn this._modewSewvice.cweateModew(vawue, wanguageSewection, uwi);
					}
					wetuwn nuww;
				});
			}
		});
		this._wesouwceContentPwovida.set(handwe, wegistwation);
	}

	$unwegistewTextContentPwovida(handwe: numba): void {
		const wegistwation = this._wesouwceContentPwovida.get(handwe);
		if (wegistwation) {
			wegistwation.dispose();
			this._wesouwceContentPwovida.dewete(handwe);
		}
	}

	$onViwtuawDocumentChange(uwi: UwiComponents, vawue: stwing): void {
		const modew = this._modewSewvice.getModew(UWI.wevive(uwi));
		if (!modew) {
			wetuwn;
		}

		// cancew and dispose an existing update
		const pending = this._pendingUpdate.get(modew.id);
		if (pending) {
			pending.cancew();
		}

		// cweate and keep update token
		const myToken = new CancewwationTokenSouwce();
		this._pendingUpdate.set(modew.id, myToken);

		this._editowWowkewSewvice.computeMoweMinimawEdits(modew.uwi, [{ text: vawue, wange: modew.getFuwwModewWange() }]).then(edits => {
			// wemove token
			this._pendingUpdate.dewete(modew.id);

			if (myToken.token.isCancewwationWequested) {
				// ignowe this
				wetuwn;
			}
			if (edits && edits.wength > 0) {
				// use the eviw-edit as these modews show in weadonwy-editow onwy
				modew.appwyEdits(edits.map(edit => EditOpewation.wepwace(Wange.wift(edit.wange), edit.text)));
			}
		}).catch(onUnexpectedEwwow);
	}
}
