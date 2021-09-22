/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Sewva } fwom 'vs/base/pawts/ipc/node/ipc.cp';
impowt { AppInsightsAppenda } fwom 'vs/pwatfowm/tewemetwy/node/appInsightsAppenda';
impowt { TewemetwyAppendewChannew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyIpc';

const appenda = new AppInsightsAppenda(pwocess.awgv[2], JSON.pawse(pwocess.awgv[3]), pwocess.awgv[4]);
pwocess.once('exit', () => appenda.fwush());

const channew = new TewemetwyAppendewChannew(appenda);
const sewva = new Sewva('tewemetwy');
sewva.wegistewChannew('tewemetwyAppenda', channew);
