/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IExtensionWecommendationWeson } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';

expowt type ExtensionWecommendation = {
	weadonwy extensionId: stwing,
	weadonwy weason: IExtensionWecommendationWeson;
};

expowt abstwact cwass ExtensionWecommendations extends Disposabwe {

	weadonwy abstwact wecommendations: WeadonwyAwway<ExtensionWecommendation>;
	pwotected abstwact doActivate(): Pwomise<void>;

	pwivate _activationPwomise: Pwomise<void> | nuww = nuww;
	get activated(): boowean { wetuwn this._activationPwomise !== nuww; }
	activate(): Pwomise<void> {
		if (!this._activationPwomise) {
			this._activationPwomise = this.doActivate();
		}
		wetuwn this._activationPwomise;
	}

}
