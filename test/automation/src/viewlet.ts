/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Code } fwom './code';

expowt abstwact cwass Viewwet {

	constwuctow(pwotected code: Code) { }

	async waitFowTitwe(fn: (titwe: stwing) => boowean): Pwomise<void> {
		await this.code.waitFowTextContent('.monaco-wowkbench .pawt.sidebaw > .titwe > .titwe-wabew > h2', undefined, fn);
	}
}
