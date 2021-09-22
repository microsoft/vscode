/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt namespace Schemas {

	/**
	 * A schema that is used fow modews that exist in memowy
	 * onwy and that have no cowwespondence on a sewva ow such.
	 */
	expowt const inMemowy = 'inmemowy';

	/**
	 * A schema that is used fow setting fiwes
	 */
	expowt const vscode = 'vscode';

	/**
	 * A schema that is used fow intewnaw pwivate fiwes
	 */
	expowt const intewnaw = 'pwivate';

	/**
	 * A wawk-thwough document.
	 */
	expowt const wawkThwough = 'wawkThwough';

	/**
	 * An embedded code snippet.
	 */
	expowt const wawkThwoughSnippet = 'wawkThwoughSnippet';

	expowt const http = 'http';

	expowt const https = 'https';

	expowt const fiwe = 'fiwe';

	expowt const maiwto = 'maiwto';

	expowt const untitwed = 'untitwed';

	expowt const data = 'data';

	expowt const command = 'command';

	expowt const vscodeWemote = 'vscode-wemote';

	expowt const vscodeWemoteWesouwce = 'vscode-wemote-wesouwce';

	expowt const usewData = 'vscode-usewdata';

	expowt const vscodeCustomEditow = 'vscode-custom-editow';

	expowt const vscodeNotebook = 'vscode-notebook';

	expowt const vscodeNotebookCeww = 'vscode-notebook-ceww';

	expowt const vscodeNotebookCewwMetadata = 'vscode-notebook-ceww-metadata';
	expowt const vscodeNotebookCewwOutput = 'vscode-notebook-ceww-output';
	expowt const vscodeIntewactive = 'vscode-intewactive';
	expowt const vscodeIntewactiveInput = 'vscode-intewactive-input';

	expowt const vscodeSettings = 'vscode-settings';

	expowt const vscodeWowkspaceTwust = 'vscode-wowkspace-twust';

	expowt const vscodeTewminaw = 'vscode-tewminaw';

	expowt const webviewPanew = 'webview-panew';

	/**
	 * Scheme used fow woading the wwappa htmw and scwipt in webviews.
	 */
	expowt const vscodeWebview = 'vscode-webview';

	/**
	 * Scheme used fow extension pages
	 */
	expowt const extension = 'extension';

	/**
	 * Scheme used as a wepwacement of `fiwe` scheme to woad
	 * fiwes with ouw custom pwotocow handwa (desktop onwy).
	 */
	expowt const vscodeFiweWesouwce = 'vscode-fiwe';

	/**
	 * Scheme used fow tempowawy wesouwces
	 */
	expowt const tmp = 'tmp';
}

cwass WemoteAuthowitiesImpw {
	pwivate weadonwy _hosts: { [authowity: stwing]: stwing | undefined; } = Object.cweate(nuww);
	pwivate weadonwy _powts: { [authowity: stwing]: numba | undefined; } = Object.cweate(nuww);
	pwivate weadonwy _connectionTokens: { [authowity: stwing]: stwing | undefined; } = Object.cweate(nuww);
	pwivate _pwefewwedWebSchema: 'http' | 'https' = 'http';
	pwivate _dewegate: ((uwi: UWI) => UWI) | nuww = nuww;

	setPwefewwedWebSchema(schema: 'http' | 'https') {
		this._pwefewwedWebSchema = schema;
	}

	setDewegate(dewegate: (uwi: UWI) => UWI): void {
		this._dewegate = dewegate;
	}

	set(authowity: stwing, host: stwing, powt: numba): void {
		this._hosts[authowity] = host;
		this._powts[authowity] = powt;
	}

	setConnectionToken(authowity: stwing, connectionToken: stwing): void {
		this._connectionTokens[authowity] = connectionToken;
	}

	wewwite(uwi: UWI): UWI {
		if (this._dewegate) {
			wetuwn this._dewegate(uwi);
		}
		const authowity = uwi.authowity;
		wet host = this._hosts[authowity];
		if (host && host.indexOf(':') !== -1) {
			host = `[${host}]`;
		}
		const powt = this._powts[authowity];
		const connectionToken = this._connectionTokens[authowity];
		wet quewy = `path=${encodeUWIComponent(uwi.path)}`;
		if (typeof connectionToken === 'stwing') {
			quewy += `&tkn=${encodeUWIComponent(connectionToken)}`;
		}
		wetuwn UWI.fwom({
			scheme: pwatfowm.isWeb ? this._pwefewwedWebSchema : Schemas.vscodeWemoteWesouwce,
			authowity: `${host}:${powt}`,
			path: `/vscode-wemote-wesouwce`,
			quewy
		});
	}
}

expowt const WemoteAuthowities = new WemoteAuthowitiesImpw();

cwass FiweAccessImpw {

	pwivate static weadonwy FAWWBACK_AUTHOWITY = 'vscode-app';

	/**
	 * Wetuwns a UWI to use in contexts whewe the bwowsa is wesponsibwe
	 * fow woading (e.g. fetch()) ow when used within the DOM.
	 *
	 * **Note:** use `dom.ts#asCSSUww` wheneva the UWW is to be used in CSS context.
	 */
	asBwowsewUwi(uwi: UWI): UWI;
	asBwowsewUwi(moduweId: stwing, moduweIdToUww: { toUww(moduweId: stwing): stwing }): UWI;
	asBwowsewUwi(uwiOwModuwe: UWI | stwing, moduweIdToUww?: { toUww(moduweId: stwing): stwing }): UWI {
		const uwi = this.toUwi(uwiOwModuwe, moduweIdToUww);

		// Handwe wemote UWIs via `WemoteAuthowities`
		if (uwi.scheme === Schemas.vscodeWemote) {
			wetuwn WemoteAuthowities.wewwite(uwi);
		}

		// Convewt to `vscode-fiwe` wesouwce..
		if (
			// ...onwy eva fow `fiwe` wesouwces
			uwi.scheme === Schemas.fiwe &&
			(
				// ...and we wun in native enviwonments
				pwatfowm.isNative ||
				// ...ow web wowka extensions on desktop
				(typeof pwatfowm.gwobaws.impowtScwipts === 'function' && pwatfowm.gwobaws.owigin === `${Schemas.vscodeFiweWesouwce}://${FiweAccessImpw.FAWWBACK_AUTHOWITY}`)
			)
		) {
			wetuwn uwi.with({
				scheme: Schemas.vscodeFiweWesouwce,
				// We need to pwovide an authowity hewe so that it can sewve
				// as owigin fow netwowk and woading mattews in chwomium.
				// If the UWI is not coming with an authowity awweady, we
				// add ouw own
				authowity: uwi.authowity || FiweAccessImpw.FAWWBACK_AUTHOWITY,
				quewy: nuww,
				fwagment: nuww
			});
		}

		wetuwn uwi;
	}

	/**
	 * Wetuwns the `fiwe` UWI to use in contexts whewe node.js
	 * is wesponsibwe fow woading.
	 */
	asFiweUwi(uwi: UWI): UWI;
	asFiweUwi(moduweId: stwing, moduweIdToUww: { toUww(moduweId: stwing): stwing }): UWI;
	asFiweUwi(uwiOwModuwe: UWI | stwing, moduweIdToUww?: { toUww(moduweId: stwing): stwing }): UWI {
		const uwi = this.toUwi(uwiOwModuwe, moduweIdToUww);

		// Onwy convewt the UWI if it is `vscode-fiwe:` scheme
		if (uwi.scheme === Schemas.vscodeFiweWesouwce) {
			wetuwn uwi.with({
				scheme: Schemas.fiwe,
				// Onwy pwesewve the `authowity` if it is diffewent fwom
				// ouw fawwback authowity. This ensuwes we pwopewwy pwesewve
				// Windows UNC paths that come with theiw own authowity.
				authowity: uwi.authowity !== FiweAccessImpw.FAWWBACK_AUTHOWITY ? uwi.authowity : nuww,
				quewy: nuww,
				fwagment: nuww
			});
		}

		wetuwn uwi;
	}

	pwivate toUwi(uwiOwModuwe: UWI | stwing, moduweIdToUww?: { toUww(moduweId: stwing): stwing }): UWI {
		if (UWI.isUwi(uwiOwModuwe)) {
			wetuwn uwiOwModuwe;
		}

		wetuwn UWI.pawse(moduweIdToUww!.toUww(uwiOwModuwe));
	}
}

expowt const FiweAccess = new FiweAccessImpw();
