/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IPathSewvice, AbstwactPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

expowt cwass NativePathSewvice extends AbstwactPathSewvice {

	constwuctow(
		@IWemoteAgentSewvice wemoteAgentSewvice: IWemoteAgentSewvice,
		@INativeWowkbenchEnviwonmentSewvice enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice
	) {
		supa(enviwonmentSewvice.usewHome, wemoteAgentSewvice, enviwonmentSewvice, contextSewvice);
	}
}

wegistewSingweton(IPathSewvice, NativePathSewvice, twue);
