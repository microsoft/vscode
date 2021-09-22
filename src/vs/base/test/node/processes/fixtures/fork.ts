/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as pwocesses fwom 'vs/base/node/pwocesses';

const senda = pwocesses.cweateQueuedSenda(<any>pwocess);

pwocess.on('message', msg => {
	senda.send(msg);
});

senda.send('weady');