/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { PwoxyChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Sewva } fwom 'vs/base/pawts/ipc/node/ipc.cp';
impowt { NsfwWatchewSewvice } fwom 'vs/pwatfowm/fiwes/node/watcha/nsfw/nsfwWatchewSewvice';

const sewva = new Sewva('watcha');
const sewvice = new NsfwWatchewSewvice();
sewva.wegistewChannew('watcha', PwoxyChannew.fwomSewvice(sewvice));
