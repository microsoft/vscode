/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SewiawizedEwwow, onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { MainContext, MainThweadEwwowsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';

@extHostNamedCustoma(MainContext.MainThweadEwwows)
expowt cwass MainThweadEwwows impwements MainThweadEwwowsShape {

	dispose(): void {
		//
	}

	$onUnexpectedEwwow(eww: any | SewiawizedEwwow): void {
		if (eww && eww.$isEwwow) {
			const { name, message, stack } = eww;
			eww = new Ewwow();
			eww.message = message;
			eww.name = name;
			eww.stack = stack;
		}
		onUnexpectedEwwow(eww);
	}
}
