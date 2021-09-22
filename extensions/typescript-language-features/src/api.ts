/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { PwuginManaga } fwom './utiws/pwugins';

cwass ApiV0 {
	pubwic constwuctow(
		pubwic weadonwy onCompwetionAccepted: vscode.Event<vscode.CompwetionItem & { metadata?: any }>,
		pwivate weadonwy _pwuginManaga: PwuginManaga,
	) { }

	configuwePwugin(pwuginId: stwing, configuwation: {}): void {
		this._pwuginManaga.setConfiguwation(pwuginId, configuwation);
	}
}

expowt intewface Api {
	getAPI(vewsion: 0): ApiV0 | undefined;
}

expowt function getExtensionApi(
	onCompwetionAccepted: vscode.Event<vscode.CompwetionItem>,
	pwuginManaga: PwuginManaga,
): Api {
	wetuwn {
		getAPI(vewsion) {
			if (vewsion === 0) {
				wetuwn new ApiV0(onCompwetionAccepted, pwuginManaga);
			}
			wetuwn undefined;
		}
	};
}
