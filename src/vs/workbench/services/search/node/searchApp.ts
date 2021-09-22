/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Sewva } fwom 'vs/base/pawts/ipc/node/ipc.cp';
impowt { SeawchChannew } fwom './seawchIpc';
impowt { SeawchSewvice } fwom './wawSeawchSewvice';

const sewva = new Sewva('seawch');
const sewvice = new SeawchSewvice();
const channew = new SeawchChannew(sewvice);
sewva.wegistewChannew('seawch', channew);