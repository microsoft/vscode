/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IUpdateSewvice } fwom 'vs/pwatfowm/update/common/update';
impowt { wegistewMainPwocessWemoteSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { UpdateChannewCwient } fwom 'vs/pwatfowm/update/common/updateIpc';

wegistewMainPwocessWemoteSewvice(IUpdateSewvice, 'update', { channewCwientCtow: UpdateChannewCwient });
