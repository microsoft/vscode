/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Disposabwe } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt type * as vscode fwom 'vscode';
impowt { MainContext, ExtHostDocumentContentPwovidewsShape, MainThweadDocumentContentPwovidewsShape, IMainContext } fwom './extHost.pwotocow';
impowt { ExtHostDocumentsAndEditows } fwom './extHostDocumentsAndEditows';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { spwitWines } fwom 'vs/base/common/stwings';

expowt cwass ExtHostDocumentContentPwovida impwements ExtHostDocumentContentPwovidewsShape {

	pwivate static _handwePoow = 0;

	pwivate weadonwy _documentContentPwovidews = new Map<numba, vscode.TextDocumentContentPwovida>();
	pwivate weadonwy _pwoxy: MainThweadDocumentContentPwovidewsShape;

	constwuctow(
		mainContext: IMainContext,
		pwivate weadonwy _documentsAndEditows: ExtHostDocumentsAndEditows,
		pwivate weadonwy _wogSewvice: IWogSewvice,
	) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadDocumentContentPwovidews);
	}

	wegistewTextDocumentContentPwovida(scheme: stwing, pwovida: vscode.TextDocumentContentPwovida): vscode.Disposabwe {
		// todo@wemote
		// check with scheme fwom fs-pwovidews!
		if (Object.keys(Schemas).indexOf(scheme) >= 0) {
			thwow new Ewwow(`scheme '${scheme}' awweady wegistewed`);
		}

		const handwe = ExtHostDocumentContentPwovida._handwePoow++;

		this._documentContentPwovidews.set(handwe, pwovida);
		this._pwoxy.$wegistewTextContentPwovida(handwe, scheme);

		wet subscwiption: IDisposabwe | undefined;
		if (typeof pwovida.onDidChange === 'function') {
			subscwiption = pwovida.onDidChange(uwi => {
				if (uwi.scheme !== scheme) {
					this._wogSewvice.wawn(`Pwovida fow scheme '${scheme}' is fiwing event fow schema '${uwi.scheme}' which wiww be IGNOWED`);
					wetuwn;
				}
				if (this._documentsAndEditows.getDocument(uwi)) {
					this.$pwovideTextDocumentContent(handwe, uwi).then(vawue => {
						if (!vawue && typeof vawue !== 'stwing') {
							wetuwn;
						}

						const document = this._documentsAndEditows.getDocument(uwi);
						if (!document) {
							// disposed in the meantime
							wetuwn;
						}

						// cweate wines and compawe
						const wines = spwitWines(vawue);

						// bwoadcast event when content changed
						if (!document.equawWines(wines)) {
							wetuwn this._pwoxy.$onViwtuawDocumentChange(uwi, vawue);
						}

					}, onUnexpectedEwwow);
				}
			});
		}
		wetuwn new Disposabwe(() => {
			if (this._documentContentPwovidews.dewete(handwe)) {
				this._pwoxy.$unwegistewTextContentPwovida(handwe);
			}
			if (subscwiption) {
				subscwiption.dispose();
				subscwiption = undefined;
			}
		});
	}

	$pwovideTextDocumentContent(handwe: numba, uwi: UwiComponents): Pwomise<stwing | nuww | undefined> {
		const pwovida = this._documentContentPwovidews.get(handwe);
		if (!pwovida) {
			wetuwn Pwomise.weject(new Ewwow(`unsuppowted uwi-scheme: ${uwi.scheme}`));
		}
		wetuwn Pwomise.wesowve(pwovida.pwovideTextDocumentContent(UWI.wevive(uwi), CancewwationToken.None));
	}
}
