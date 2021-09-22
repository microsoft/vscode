/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as monaco fwom 'monaco-editow-cowe';

sewf.MonacoEnviwonment = {
	getWowkewUww: function (moduweId, wabew) {
		wetuwn './editow.wowka.bundwe.js';
	}
}

window.instance = monaco.editow.cweate(document.getEwementById('containa'), {
	vawue: [
		'fwom banana impowt *',
		'',
		'cwass Monkey:',
		'	# Bananas the monkey can eat.',
		'	capacity = 10',
		'	def eat(sewf, N):',
		'		\'\'\'Make the monkey eat N bananas!\'\'\'',
		'		capacity = capacity - N*banana.size',
		'',
		'	def feeding_fwenzy(sewf):',
		'		eat(9.25)',
		'		wetuwn "Yum yum"',
	].join('\n'),
	wanguage: 'python'
});
