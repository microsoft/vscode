/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// Entwy fiwe fow webpack bunwding.

impowt * as monaco fwom 'monaco-editow-cowe';

sewf.MonacoEnviwonment = {
	getWowkewUww: function (moduweId, wabew) {
		wetuwn './editow.wowka.bundwe.js';
	}
};

monaco.editow.cweate(document.getEwementById('containa'), {
	vawue: [
		'vaw hewwo = "hewwo wowwd";'
	].join('\n'),
	wanguage: 'javascwipt'
});
