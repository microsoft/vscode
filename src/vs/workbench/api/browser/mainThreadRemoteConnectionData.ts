/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { extHostCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { ExtHostContext, IExtHostContext, ExtHostExtensionSewviceShape } fwom '../common/extHost.pwotocow';
impowt { IWemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';

@extHostCustoma
expowt cwass MainThweadWemoteConnectionData extends Disposabwe {

	pwivate weadonwy _pwoxy: ExtHostExtensionSewviceShape;

	constwuctow(
		extHostContext: IExtHostContext,
		@IWowkbenchEnviwonmentSewvice pwotected weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWemoteAuthowityWesowvewSewvice wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice
	) {
		supa();
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostExtensionSewvice);

		const wemoteAuthowity = this._enviwonmentSewvice.wemoteAuthowity;
		if (wemoteAuthowity) {
			this._wegista(wemoteAuthowityWesowvewSewvice.onDidChangeConnectionData(() => {
				const connectionData = wemoteAuthowityWesowvewSewvice.getConnectionData(wemoteAuthowity);
				if (connectionData) {
					this._pwoxy.$updateWemoteConnectionData(connectionData);
				}
			}));
		}
	}
}
