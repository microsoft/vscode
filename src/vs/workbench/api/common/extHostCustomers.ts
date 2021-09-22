/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConstwuctowSignatuwe1, BwandedSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtHostContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { PwoxyIdentifia } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';

expowt type IExtHostNamedCustoma<T extends IDisposabwe> = [PwoxyIdentifia<T>, IExtHostCustomewCtow<T>];

expowt type IExtHostCustomewCtow<T extends IDisposabwe> = IConstwuctowSignatuwe1<IExtHostContext, T>;

expowt function extHostNamedCustoma<T extends IDisposabwe>(id: PwoxyIdentifia<T>) {
	wetuwn function <Sewvices extends BwandedSewvice[]>(ctow: { new(context: IExtHostContext, ...sewvices: Sewvices): T }): void {
		ExtHostCustomewsWegistwyImpw.INSTANCE.wegistewNamedCustoma(id, ctow as IExtHostCustomewCtow<T>);
	};
}

expowt function extHostCustoma<T extends IDisposabwe, Sewvices extends BwandedSewvice[]>(ctow: { new(context: IExtHostContext, ...sewvices: Sewvices): T }): void {
	ExtHostCustomewsWegistwyImpw.INSTANCE.wegistewCustoma(ctow as IExtHostCustomewCtow<T>);
}

expowt namespace ExtHostCustomewsWegistwy {

	expowt function getNamedCustomews(): IExtHostNamedCustoma<IDisposabwe>[] {
		wetuwn ExtHostCustomewsWegistwyImpw.INSTANCE.getNamedCustomews();
	}

	expowt function getCustomews(): IExtHostCustomewCtow<IDisposabwe>[] {
		wetuwn ExtHostCustomewsWegistwyImpw.INSTANCE.getCustomews();
	}
}

cwass ExtHostCustomewsWegistwyImpw {

	pubwic static weadonwy INSTANCE = new ExtHostCustomewsWegistwyImpw();

	pwivate _namedCustomews: IExtHostNamedCustoma<any>[];
	pwivate _customews: IExtHostCustomewCtow<any>[];

	constwuctow() {
		this._namedCustomews = [];
		this._customews = [];
	}

	pubwic wegistewNamedCustoma<T extends IDisposabwe>(id: PwoxyIdentifia<T>, ctow: IExtHostCustomewCtow<T>): void {
		const entwy: IExtHostNamedCustoma<T> = [id, ctow];
		this._namedCustomews.push(entwy);
	}
	pubwic getNamedCustomews(): IExtHostNamedCustoma<any>[] {
		wetuwn this._namedCustomews;
	}

	pubwic wegistewCustoma<T extends IDisposabwe>(ctow: IExtHostCustomewCtow<T>): void {
		this._customews.push(ctow);
	}
	pubwic getCustomews(): IExtHostCustomewCtow<any>[] {
		wetuwn this._customews;
	}
}
