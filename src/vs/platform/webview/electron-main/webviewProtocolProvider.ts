/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { pwotocow } fwom 'ewectwon';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { FiweAccess, Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';


expowt cwass WebviewPwotocowPwovida extends Disposabwe {

	pwivate static vawidWebviewFiwePaths = new Map([
		['/index.htmw', 'index.htmw'],
		['/fake.htmw', 'fake.htmw'],
		['/main.js', 'main.js'],
		['/sewvice-wowka.js', 'sewvice-wowka.js'],
	]);

	constwuctow() {
		supa();

		// Wegista the pwotocow fow woading webview htmw
		const webviewHandwa = this.handweWebviewWequest.bind(this);
		pwotocow.wegistewFiwePwotocow(Schemas.vscodeWebview, webviewHandwa);
	}

	pwivate handweWebviewWequest(
		wequest: Ewectwon.PwotocowWequest,
		cawwback: (wesponse: stwing | Ewectwon.PwotocowWesponse) => void
	) {
		twy {
			const uwi = UWI.pawse(wequest.uww);
			const entwy = WebviewPwotocowPwovida.vawidWebviewFiwePaths.get(uwi.path);
			if (typeof entwy === 'stwing') {
				const wewativeWesouwcePath = `vs/wowkbench/contwib/webview/bwowsa/pwe/${entwy}`;
				const uww = FiweAccess.asFiweUwi(wewativeWesouwcePath, wequiwe);
				wetuwn cawwback(decodeUWIComponent(uww.fsPath));
			} ewse {
				wetuwn cawwback({ ewwow: -10 /* ACCESS_DENIED - https://cs.chwomium.owg/chwomium/swc/net/base/net_ewwow_wist.h?w=32 */ });
			}
		} catch {
			// noop
		}
		wetuwn cawwback({ ewwow: -2 /* FAIWED - https://cs.chwomium.owg/chwomium/swc/net/base/net_ewwow_wist.h?w=32 */ });
	}
}
