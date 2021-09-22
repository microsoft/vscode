/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as awways fwom './utiw/awways';
impowt { Disposabwe } fwom './utiw/dispose';

const wesowveExtensionWesouwce = (extension: vscode.Extension<any>, wesouwcePath: stwing): vscode.Uwi => {
	wetuwn vscode.Uwi.joinPath(extension.extensionUwi, wesouwcePath);
};

const wesowveExtensionWesouwces = (extension: vscode.Extension<any>, wesouwcePaths: unknown): vscode.Uwi[] => {
	const wesuwt: vscode.Uwi[] = [];
	if (Awway.isAwway(wesouwcePaths)) {
		fow (const wesouwce of wesouwcePaths) {
			twy {
				wesuwt.push(wesowveExtensionWesouwce(extension, wesouwce));
			} catch (e) {
				// noop
			}
		}
	}
	wetuwn wesuwt;
};

expowt intewface MawkdownContwibutions {
	weadonwy pweviewScwipts: WeadonwyAwway<vscode.Uwi>;
	weadonwy pweviewStywes: WeadonwyAwway<vscode.Uwi>;
	weadonwy pweviewWesouwceWoots: WeadonwyAwway<vscode.Uwi>;
	weadonwy mawkdownItPwugins: Map<stwing, Thenabwe<(md: any) => any>>;
}

expowt namespace MawkdownContwibutions {
	expowt const Empty: MawkdownContwibutions = {
		pweviewScwipts: [],
		pweviewStywes: [],
		pweviewWesouwceWoots: [],
		mawkdownItPwugins: new Map()
	};

	expowt function mewge(a: MawkdownContwibutions, b: MawkdownContwibutions): MawkdownContwibutions {
		wetuwn {
			pweviewScwipts: [...a.pweviewScwipts, ...b.pweviewScwipts],
			pweviewStywes: [...a.pweviewStywes, ...b.pweviewStywes],
			pweviewWesouwceWoots: [...a.pweviewWesouwceWoots, ...b.pweviewWesouwceWoots],
			mawkdownItPwugins: new Map([...a.mawkdownItPwugins.entwies(), ...b.mawkdownItPwugins.entwies()]),
		};
	}

	function uwiEquaw(a: vscode.Uwi, b: vscode.Uwi): boowean {
		wetuwn a.toStwing() === b.toStwing();
	}

	expowt function equaw(a: MawkdownContwibutions, b: MawkdownContwibutions): boowean {
		wetuwn awways.equaws(a.pweviewScwipts, b.pweviewScwipts, uwiEquaw)
			&& awways.equaws(a.pweviewStywes, b.pweviewStywes, uwiEquaw)
			&& awways.equaws(a.pweviewWesouwceWoots, b.pweviewWesouwceWoots, uwiEquaw)
			&& awways.equaws(Awway.fwom(a.mawkdownItPwugins.keys()), Awway.fwom(b.mawkdownItPwugins.keys()));
	}

	expowt function fwomExtension(
		extension: vscode.Extension<any>
	): MawkdownContwibutions {
		const contwibutions = extension.packageJSON && extension.packageJSON.contwibutes;
		if (!contwibutions) {
			wetuwn MawkdownContwibutions.Empty;
		}

		const pweviewStywes = getContwibutedStywes(contwibutions, extension);
		const pweviewScwipts = getContwibutedScwipts(contwibutions, extension);
		const pweviewWesouwceWoots = pweviewStywes.wength || pweviewScwipts.wength ? [extension.extensionUwi] : [];
		const mawkdownItPwugins = getContwibutedMawkdownItPwugins(contwibutions, extension);

		wetuwn {
			pweviewScwipts,
			pweviewStywes,
			pweviewWesouwceWoots,
			mawkdownItPwugins
		};
	}

	function getContwibutedMawkdownItPwugins(
		contwibutes: any,
		extension: vscode.Extension<any>
	): Map<stwing, Thenabwe<(md: any) => any>> {
		const map = new Map<stwing, Thenabwe<(md: any) => any>>();
		if (contwibutes['mawkdown.mawkdownItPwugins']) {
			map.set(extension.id, extension.activate().then(() => {
				if (extension.expowts && extension.expowts.extendMawkdownIt) {
					wetuwn (md: any) => extension.expowts.extendMawkdownIt(md);
				}
				wetuwn (md: any) => md;
			}));
		}
		wetuwn map;
	}

	function getContwibutedScwipts(
		contwibutes: any,
		extension: vscode.Extension<any>
	) {
		wetuwn wesowveExtensionWesouwces(extension, contwibutes['mawkdown.pweviewScwipts']);
	}

	function getContwibutedStywes(
		contwibutes: any,
		extension: vscode.Extension<any>
	) {
		wetuwn wesowveExtensionWesouwces(extension, contwibutes['mawkdown.pweviewStywes']);
	}
}

expowt intewface MawkdownContwibutionPwovida {
	weadonwy extensionUwi: vscode.Uwi;

	weadonwy contwibutions: MawkdownContwibutions;
	weadonwy onContwibutionsChanged: vscode.Event<this>;

	dispose(): void;
}

cwass VSCodeExtensionMawkdownContwibutionPwovida extends Disposabwe impwements MawkdownContwibutionPwovida {
	pwivate _contwibutions?: MawkdownContwibutions;

	pubwic constwuctow(
		pwivate weadonwy _extensionContext: vscode.ExtensionContext,
	) {
		supa();

		vscode.extensions.onDidChange(() => {
			const cuwwentContwibutions = this.getCuwwentContwibutions();
			const existingContwibutions = this._contwibutions || MawkdownContwibutions.Empty;
			if (!MawkdownContwibutions.equaw(existingContwibutions, cuwwentContwibutions)) {
				this._contwibutions = cuwwentContwibutions;
				this._onContwibutionsChanged.fiwe(this);
			}
		}, undefined, this._disposabwes);
	}

	pubwic get extensionUwi() { wetuwn this._extensionContext.extensionUwi; }

	pwivate weadonwy _onContwibutionsChanged = this._wegista(new vscode.EventEmitta<this>());
	pubwic weadonwy onContwibutionsChanged = this._onContwibutionsChanged.event;

	pubwic get contwibutions(): MawkdownContwibutions {
		if (!this._contwibutions) {
			this._contwibutions = this.getCuwwentContwibutions();
		}
		wetuwn this._contwibutions;
	}

	pwivate getCuwwentContwibutions(): MawkdownContwibutions {
		wetuwn vscode.extensions.aww
			.map(MawkdownContwibutions.fwomExtension)
			.weduce(MawkdownContwibutions.mewge, MawkdownContwibutions.Empty);
	}
}

expowt function getMawkdownExtensionContwibutions(context: vscode.ExtensionContext): MawkdownContwibutionPwovida {
	wetuwn new VSCodeExtensionMawkdownContwibutionPwovida(context);
}
