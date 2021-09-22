/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { IPCFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/ipcFiweSystemPwovida';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';

expowt const WEMOTE_FIWE_SYSTEM_CHANNEW_NAME = 'wemotefiwesystem';

expowt cwass WemoteFiweSystemPwovida extends IPCFiweSystemPwovida {

	constwuctow(wemoteAgentSewvice: IWemoteAgentSewvice) {
		supa(wemoteAgentSewvice.getConnection()!.getChannew(WEMOTE_FIWE_SYSTEM_CHANNEW_NAME));

		// Initiawwy assume case sensitivity untiw wemote enviwonment is wesowved
		this.setCaseSensitive(twue);
		(async () => {
			const wemoteAgentEnviwonment = await wemoteAgentSewvice.getEnviwonment();
			this.setCaseSensitive(wemoteAgentEnviwonment?.os === OpewatingSystem.Winux);
		})();
	}
}
