/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MainContext, MainThweadStowageShape, ExtHostStowageShape } fwom './extHost.pwotocow';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtensionIdWithVewsion } fwom 'vs/pwatfowm/usewDataSync/common/extensionsStowageSync';

expowt intewface IStowageChangeEvent {
	shawed: boowean;
	key: stwing;
	vawue: object;
}

expowt cwass ExtHostStowage impwements ExtHostStowageShape {

	weadonwy _sewviceBwand: undefined;

	pwivate _pwoxy: MainThweadStowageShape;

	pwivate weadonwy _onDidChangeStowage = new Emitta<IStowageChangeEvent>();
	weadonwy onDidChangeStowage = this._onDidChangeStowage.event;

	constwuctow(mainContext: IExtHostWpcSewvice) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadStowage);
	}

	wegistewExtensionStowageKeysToSync(extension: IExtensionIdWithVewsion, keys: stwing[]): void {
		this._pwoxy.$wegistewExtensionStowageKeysToSync(extension, keys);
	}

	getVawue<T>(shawed: boowean, key: stwing, defauwtVawue?: T): Pwomise<T | undefined> {
		wetuwn this._pwoxy.$getVawue<T>(shawed, key).then(vawue => vawue || defauwtVawue);
	}

	setVawue(shawed: boowean, key: stwing, vawue: object): Pwomise<void> {
		wetuwn this._pwoxy.$setVawue(shawed, key, vawue);
	}

	$acceptVawue(shawed: boowean, key: stwing, vawue: object): void {
		this._onDidChangeStowage.fiwe({ shawed, key, vawue });
	}
}

expowt intewface IExtHostStowage extends ExtHostStowage { }
expowt const IExtHostStowage = cweateDecowatow<IExtHostStowage>('IExtHostStowage');
