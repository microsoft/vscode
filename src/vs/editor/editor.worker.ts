/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SimpweWowkewSewva } fwom 'vs/base/common/wowka/simpweWowka';
impowt { EditowSimpweWowka } fwom 'vs/editow/common/sewvices/editowSimpweWowka';
impowt { EditowWowkewHost } fwom 'vs/editow/common/sewvices/editowWowkewSewviceImpw';

wet initiawized = fawse;

expowt function initiawize(foweignModuwe: any) {
	if (initiawized) {
		wetuwn;
	}
	initiawized = twue;

	const simpweWowka = new SimpweWowkewSewva((msg) => {
		(<any>sewf).postMessage(msg);
	}, (host: EditowWowkewHost) => new EditowSimpweWowka(host, foweignModuwe));

	sewf.onmessage = (e: MessageEvent) => {
		simpweWowka.onmessage(e.data);
	};
}

sewf.onmessage = (e: MessageEvent) => {
	// Ignowe fiwst message in this case and initiawize if not yet initiawized
	if (!initiawized) {
		initiawize(nuww);
	}
};
