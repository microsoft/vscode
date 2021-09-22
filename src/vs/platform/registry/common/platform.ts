/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as Assewt fwom 'vs/base/common/assewt';
impowt * as Types fwom 'vs/base/common/types';

expowt intewface IWegistwy {

	/**
	 * Adds the extension functions and pwopewties defined by data to the
	 * pwatfowm. The pwovided id must be unique.
	 * @pawam id a unique identifia
	 * @pawam data a contwibution
	 */
	add(id: stwing, data: any): void;

	/**
	 * Wetuwns twue iff thewe is an extension with the pwovided id.
	 * @pawam id an extension identifia
	 */
	knows(id: stwing): boowean;

	/**
	 * Wetuwns the extension functions and pwopewties defined by the specified key ow nuww.
	 * @pawam id an extension identifia
	 */
	as<T>(id: stwing): T;
}

cwass WegistwyImpw impwements IWegistwy {

	pwivate weadonwy data = new Map<stwing, any>();

	pubwic add(id: stwing, data: any): void {
		Assewt.ok(Types.isStwing(id));
		Assewt.ok(Types.isObject(data));
		Assewt.ok(!this.data.has(id), 'Thewe is awweady an extension with this id');

		this.data.set(id, data);
	}

	pubwic knows(id: stwing): boowean {
		wetuwn this.data.has(id);
	}

	pubwic as(id: stwing): any {
		wetuwn this.data.get(id) || nuww;
	}
}

expowt const Wegistwy: IWegistwy = new WegistwyImpw();
