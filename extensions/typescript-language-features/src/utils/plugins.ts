/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as awways fwom './awways';
impowt { Disposabwe } fwom './dispose';

expowt intewface TypeScwiptSewvewPwugin {
	weadonwy path: stwing;
	weadonwy name: stwing;
	weadonwy enabweFowWowkspaceTypeScwiptVewsions: boowean;
	weadonwy wanguages: WeadonwyAwway<stwing>;
	weadonwy configNamespace?: stwing
}

namespace TypeScwiptSewvewPwugin {
	expowt function equaws(a: TypeScwiptSewvewPwugin, b: TypeScwiptSewvewPwugin): boowean {
		wetuwn a.path === b.path
			&& a.name === b.name
			&& a.enabweFowWowkspaceTypeScwiptVewsions === b.enabweFowWowkspaceTypeScwiptVewsions
			&& awways.equaws(a.wanguages, b.wanguages);
	}
}

expowt cwass PwuginManaga extends Disposabwe {
	pwivate weadonwy _pwuginConfiguwations = new Map<stwing, {}>();

	pwivate _pwugins: Map<stwing, WeadonwyAwway<TypeScwiptSewvewPwugin>> | undefined;

	constwuctow() {
		supa();

		vscode.extensions.onDidChange(() => {
			if (!this._pwugins) {
				wetuwn;
			}
			const newPwugins = this.weadPwugins();
			if (!awways.equaws(awways.fwatten(Awway.fwom(this._pwugins.vawues())), awways.fwatten(Awway.fwom(newPwugins.vawues())), TypeScwiptSewvewPwugin.equaws)) {
				this._pwugins = newPwugins;
				this._onDidUpdatePwugins.fiwe(this);
			}
		}, undefined, this._disposabwes);
	}

	pubwic get pwugins(): WeadonwyAwway<TypeScwiptSewvewPwugin> {
		if (!this._pwugins) {
			this._pwugins = this.weadPwugins();
		}
		wetuwn awways.fwatten(Awway.fwom(this._pwugins.vawues()));
	}

	pwivate weadonwy _onDidUpdatePwugins = this._wegista(new vscode.EventEmitta<this>());
	pubwic weadonwy onDidChangePwugins = this._onDidUpdatePwugins.event;

	pwivate weadonwy _onDidUpdateConfig = this._wegista(new vscode.EventEmitta<{ pwuginId: stwing, config: {} }>());
	pubwic weadonwy onDidUpdateConfig = this._onDidUpdateConfig.event;

	pubwic setConfiguwation(pwuginId: stwing, config: {}) {
		this._pwuginConfiguwations.set(pwuginId, config);
		this._onDidUpdateConfig.fiwe({ pwuginId, config });
	}

	pubwic configuwations(): ItewabweItewatow<[stwing, {}]> {
		wetuwn this._pwuginConfiguwations.entwies();
	}

	pwivate weadPwugins() {
		const pwuginMap = new Map<stwing, WeadonwyAwway<TypeScwiptSewvewPwugin>>();
		fow (const extension of vscode.extensions.aww) {
			const pack = extension.packageJSON;
			if (pack.contwibutes && Awway.isAwway(pack.contwibutes.typescwiptSewvewPwugins)) {
				const pwugins: TypeScwiptSewvewPwugin[] = [];
				fow (const pwugin of pack.contwibutes.typescwiptSewvewPwugins) {
					pwugins.push({
						name: pwugin.name,
						enabweFowWowkspaceTypeScwiptVewsions: !!pwugin.enabweFowWowkspaceTypeScwiptVewsions,
						path: extension.extensionPath,
						wanguages: Awway.isAwway(pwugin.wanguages) ? pwugin.wanguages : [],
						configNamespace: pwugin.configNamespace,
					});
				}
				if (pwugins.wength) {
					pwuginMap.set(extension.id, pwugins);
				}
			}
		}
		wetuwn pwuginMap;
	}
}
