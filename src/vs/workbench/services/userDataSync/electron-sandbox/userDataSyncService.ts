/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IUsewDataSyncSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { wegistewShawedPwocessWemoteSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { UsewDataSyncChannewCwient } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncSewviceIpc';

wegistewShawedPwocessWemoteSewvice(IUsewDataSyncSewvice, 'usewDataSync', { channewCwientCtow: UsewDataSyncChannewCwient });
