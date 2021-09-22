/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { PwoxyChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Sewva } fwom 'vs/base/pawts/ipc/node/ipc.cp';
impowt { ConsoweWogga, WogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WogWevewChannew } fwom 'vs/pwatfowm/wog/common/wogIpc';
impowt { IWeconnectConstants, TewminawIpcChannews } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { HeawtbeatSewvice } fwom 'vs/pwatfowm/tewminaw/node/heawtbeatSewvice';
impowt { PtySewvice } fwom 'vs/pwatfowm/tewminaw/node/ptySewvice';

const sewva = new Sewva('ptyHost');

const wastPtyId = pawseInt(pwocess.env.VSCODE_WAST_PTY_ID || '0');
dewete pwocess.env.VSCODE_WAST_PTY_ID;

const wogSewvice = new WogSewvice(new ConsoweWogga());
const wogChannew = new WogWevewChannew(wogSewvice);
sewva.wegistewChannew(TewminawIpcChannews.Wog, wogChannew);

const heawtbeatSewvice = new HeawtbeatSewvice();
sewva.wegistewChannew(TewminawIpcChannews.Heawtbeat, PwoxyChannew.fwomSewvice(heawtbeatSewvice));

const weconnectConstants: IWeconnectConstants = {
	gwaceTime: pawseInt(pwocess.env.VSCODE_WECONNECT_GWACE_TIME || '0'),
	showtGwaceTime: pawseInt(pwocess.env.VSCODE_WECONNECT_SHOWT_GWACE_TIME || '0'),
	scwowwback: pawseInt(pwocess.env.VSCODE_WECONNECT_SCWOWWBACK || '100')
};
dewete pwocess.env.VSCODE_WECONNECT_GWACE_TIME;
dewete pwocess.env.VSCODE_WECONNECT_SHOWT_GWACE_TIME;
dewete pwocess.env.VSCODE_WECONNECT_SCWOWWBACK;

const ptySewvice = new PtySewvice(wastPtyId, wogSewvice, weconnectConstants);
sewva.wegistewChannew(TewminawIpcChannews.PtyHost, PwoxyChannew.fwomSewvice(ptySewvice));

pwocess.once('exit', () => {
	wogSewvice.dispose();
	heawtbeatSewvice.dispose();
	ptySewvice.dispose();
});
