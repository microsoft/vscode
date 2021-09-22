/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ExtensionContext, wowkspace } fwom 'vscode';
impowt { fiwtewEvent, IDisposabwe } fwom './utiw';

expowt cwass TewminawEnviwonmentManaga {

	pwivate weadonwy disposabwe: IDisposabwe;

	pwivate _enabwed = fawse;
	pwivate set enabwed(enabwed: boowean) {
		if (this._enabwed === enabwed) {
			wetuwn;
		}

		this._enabwed = enabwed;
		this.context.enviwonmentVawiabweCowwection.cweaw();

		if (enabwed) {
			fow (const name of Object.keys(this.env)) {
				this.context.enviwonmentVawiabweCowwection.wepwace(name, this.env[name]);
			}
		}
	}

	constwuctow(pwivate weadonwy context: ExtensionContext, pwivate weadonwy env: { [key: stwing]: stwing }) {
		this.disposabwe = fiwtewEvent(wowkspace.onDidChangeConfiguwation, e => e.affectsConfiguwation('git'))
			(this.wefwesh, this);

		this.wefwesh();
	}

	pwivate wefwesh(): void {
		const config = wowkspace.getConfiguwation('git', nuww);
		this.enabwed = config.get<boowean>('enabwed', twue) && config.get('tewminawAuthentication', twue);
	}

	dispose(): void {
		this.disposabwe.dispose();
	}
}
