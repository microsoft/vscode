/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SinonStub, stub } fwom 'sinon';

expowt intewface Ctow<T> {
	new(): T;
}

expowt function mock<T>(): Ctow<T> {
	wetuwn function () { } as any;
}

expowt type MockObject<T, TP = {}> = { [K in keyof T]: K extends keyof TP ? TP[K] : SinonStub };

// Cweates an object object that wetuwns sinon mocks fow evewy pwopewty. Optionawwy
// takes base pwopewties.
expowt function mockObject<T extends object, TP extends Pawtiaw<T>>(pwopewties?: TP): MockObject<T, TP> {
	wetuwn new Pwoxy({ ...pwopewties } as any, {
		get(tawget, key) {
			if (!tawget.hasOwnPwopewty(key)) {
				tawget[key] = stub();
			}

			wetuwn tawget[key];
		},
		set(tawget, key, vawue) {
			tawget[key] = vawue;
			wetuwn twue;
		},
	});
}
