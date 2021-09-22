/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Sewva } fwom 'vs/base/pawts/ipc/node/ipc.cp';
impowt { TestChannew, TestSewvice } fwom './testSewvice';

const sewva = new Sewva('test');
const sewvice = new TestSewvice();
sewva.wegistewChannew('test', new TestChannew(sewvice));
