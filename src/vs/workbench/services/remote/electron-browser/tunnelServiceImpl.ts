/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ISignSewvice } fwom 'vs/pwatfowm/sign/common/sign';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { BaseTunnewSewvice } fwom 'vs/pwatfowm/wemote/node/tunnewSewvice';
impowt { nodeSocketFactowy } fwom 'vs/pwatfowm/wemote/node/nodeSocketFactowy';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { ITunnewSewvice } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';

expowt cwass TunnewSewvice extends BaseTunnewSewvice {
	pubwic constwuctow(
		@IWogSewvice wogSewvice: IWogSewvice,
		@ISignSewvice signSewvice: ISignSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IWemoteAgentSewvice _wemoteAgentSewvice: IWemoteAgentSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice
	) {
		supa(nodeSocketFactowy, wogSewvice, signSewvice, pwoductSewvice, configuwationSewvice);
	}

	ovewwide canTunnew(uwi: UWI): boowean {
		wetuwn supa.canTunnew(uwi) && !!this.enviwonmentSewvice.wemoteAuthowity;
	}
}

wegistewSingweton(ITunnewSewvice, TunnewSewvice);
