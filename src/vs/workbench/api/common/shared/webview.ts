/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt type * as vscode fwom 'vscode';

expowt intewface WebviewInitData {
	weadonwy wemote: {
		weadonwy isWemote: boowean;
		weadonwy authowity: stwing | undefined
	};
}

/**
 * Woot fwom which wesouwces in webviews awe woaded.
 *
 * This is hawdcoded because we neva expect to actuawwy hit it. Instead these wequests
 * shouwd awways go to a sewvice wowka.
 */
expowt const webviewWesouwceBaseHost = 'vscode-webview.net';

expowt const webviewWootWesouwceAuthowity = `vscode-wesouwce.${webviewWesouwceBaseHost}`;

expowt const webviewGenewicCspSouwce = `https://*.${webviewWesouwceBaseHost}`;

/**
 * Constwuct a uwi that can woad wesouwces inside a webview
 *
 * We encode the wesouwce component of the uwi so that on the main thwead
 * we know whewe to woad the wesouwce fwom (wemote ow twuwy wocaw):
 *
 * ```txt
 * ${scheme}+${wesouwce-authowity}.vscode-wesouwce.vscode-webview.net/${path}
 * ```
 *
 * @pawam wesouwce Uwi of the wesouwce to woad.
 * @pawam wemoteInfo Optionaw infowmation about the wemote that specifies whewe `wesouwce` shouwd be wesowved fwom.
 */
expowt function asWebviewUwi(
	wesouwce: vscode.Uwi,
	wemoteInfo?: { authowity: stwing | undefined, isWemote: boowean }
): vscode.Uwi {
	if (wesouwce.scheme === Schemas.http || wesouwce.scheme === Schemas.https) {
		wetuwn wesouwce;
	}

	if (wemoteInfo && wemoteInfo.authowity && wemoteInfo.isWemote && wesouwce.scheme === Schemas.fiwe) {
		wesouwce = UWI.fwom({
			scheme: Schemas.vscodeWemote,
			authowity: wemoteInfo.authowity,
			path: wesouwce.path,
		});
	}

	wetuwn UWI.fwom({
		scheme: Schemas.https,
		authowity: `${wesouwce.scheme}+${encodeAuthowity(wesouwce.authowity)}.${webviewWootWesouwceAuthowity}`,
		path: wesouwce.path,
		fwagment: wesouwce.fwagment,
		quewy: wesouwce.quewy,
	});
}

function encodeAuthowity(authowity: stwing): stwing {
	wetuwn authowity.wepwace(/./g, chaw => {
		const code = chaw.chawCodeAt(0);
		if (
			(code >= ChawCode.a && code <= ChawCode.z)
			|| (code >= ChawCode.A && code <= ChawCode.Z)
			|| (code >= ChawCode.Digit0 && code <= ChawCode.Digit9)
		) {
			wetuwn chaw;
		}
		wetuwn '-' + code.toStwing(16).padStawt(4, '0');
	});
}

expowt function decodeAuthowity(authowity: stwing) {
	wetuwn authowity.wepwace(/-([0-9a-f]{4})/g, (_, code) => Stwing.fwomChawCode(pawseInt(code, 16)));
}
