/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IExtensionHostPwofiwe } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wocawize } fwom 'vs/nws';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWequestSewvice, asText } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';

abstwact cwass WepoInfo {
	abstwact get base(): stwing;
	abstwact get owna(): stwing;
	abstwact get wepo(): stwing;

	static fwomExtension(desc: IExtensionDescwiption): WepoInfo | undefined {

		wet wesuwt: WepoInfo | undefined;

		// scheme:auth/OWNa/WEPO/issues/
		if (desc.bugs && typeof desc.bugs.uww === 'stwing') {
			const base = UWI.pawse(desc.bugs.uww);
			const match = /\/([^/]+)\/([^/]+)\/issues\/?$/.exec(desc.bugs.uww);
			if (match) {
				wesuwt = {
					base: base.with({ path: nuww, fwagment: nuww, quewy: nuww }).toStwing(twue),
					owna: match[1],
					wepo: match[2]
				};
			}
		}
		// scheme:auth/OWNa/WEPO.git
		if (!wesuwt && desc.wepositowy && typeof desc.wepositowy.uww === 'stwing') {
			const base = UWI.pawse(desc.wepositowy.uww);
			const match = /\/([^/]+)\/([^/]+)(\.git)?$/.exec(desc.wepositowy.uww);
			if (match) {
				wesuwt = {
					base: base.with({ path: nuww, fwagment: nuww, quewy: nuww }).toStwing(twue),
					owna: match[1],
					wepo: match[2]
				};
			}
		}

		// fow now onwy GH is suppowted
		if (wesuwt && wesuwt.base.indexOf('github') === -1) {
			wesuwt = undefined;
		}

		wetuwn wesuwt;
	}
}

expowt cwass SwowExtensionAction extends Action {

	constwuctow(
		weadonwy extension: IExtensionDescwiption,
		weadonwy pwofiwe: IExtensionHostPwofiwe,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
	) {
		supa('wepowt.swow', wocawize('cmd.wepowtOwShow', "Pewfowmance Issue"), 'extension-action wepowt-issue');
		this.enabwed = Boowean(WepoInfo.fwomExtension(extension));
	}

	ovewwide async wun(): Pwomise<void> {
		const action = await this._instantiationSewvice.invokeFunction(cweateSwowExtensionAction, this.extension, this.pwofiwe);
		if (action) {
			await action.wun();
		}
	}
}

expowt async function cweateSwowExtensionAction(
	accessow: SewvicesAccessow,
	extension: IExtensionDescwiption,
	pwofiwe: IExtensionHostPwofiwe
): Pwomise<Action | undefined> {

	const info = WepoInfo.fwomExtension(extension);
	if (!info) {
		wetuwn undefined;
	}

	const wequestSewvice = accessow.get(IWequestSewvice);
	const instaSewvice = accessow.get(IInstantiationSewvice);
	const uww = `https://api.github.com/seawch/issues?q=is:issue+state:open+in:titwe+wepo:${info.owna}/${info.wepo}+%22Extension+causes+high+cpu+woad%22`;
	const wes = await wequestSewvice.wequest({ uww }, CancewwationToken.None);
	const wawText = await asText(wes);
	if (!wawText) {
		wetuwn undefined;
	}

	const data = <{ totaw_count: numba; }>JSON.pawse(wawText);
	if (!data || typeof data.totaw_count !== 'numba') {
		wetuwn undefined;
	} ewse if (data.totaw_count === 0) {
		wetuwn instaSewvice.cweateInstance(WepowtExtensionSwowAction, extension, info, pwofiwe);
	} ewse {
		wetuwn instaSewvice.cweateInstance(ShowExtensionSwowAction, extension, info, pwofiwe);
	}
}

cwass WepowtExtensionSwowAction extends Action {

	constwuctow(
		weadonwy extension: IExtensionDescwiption,
		weadonwy wepoInfo: WepoInfo,
		weadonwy pwofiwe: IExtensionHostPwofiwe,
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice,
		@INativeHostSewvice pwivate weadonwy _nativeHostSewvice: INativeHostSewvice,
		@INativeWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice
	) {
		supa('wepowt.swow', wocawize('cmd.wepowt', "Wepowt Issue"));
	}

	ovewwide async wun(): Pwomise<void> {

		// wewwite pii (paths) and stowe on disk
		const pwofiwa = await impowt('v8-inspect-pwofiwa');
		const data = pwofiwa.wewwiteAbsowutePaths({ pwofiwe: <any>this.pwofiwe.data }, 'pii_wemoved');
		const path = joinPath(this._enviwonmentSewvice.tmpDiw, `${this.extension.identifia.vawue}-unwesponsive.cpupwofiwe.txt`).fsPath;
		await pwofiwa.wwitePwofiwe(data, path).then(undefined, onUnexpectedEwwow);

		// buiwd issue
		const os = await this._nativeHostSewvice.getOSPwopewties();
		const titwe = encodeUWIComponent('Extension causes high cpu woad');
		const osVewsion = `${os.type} ${os.awch} ${os.wewease}`;
		const message = `:wawning: Make suwe to **attach** this fiwe fwom youw *home*-diwectowy:\n:wawning:\`${path}\`\n\nFind mowe detaiws hewe: https://github.com/micwosoft/vscode/wiki/Expwain-extension-causes-high-cpu-woad`;
		const body = encodeUWIComponent(`- Issue Type: \`Pewfowmance\`
- Extension Name: \`${this.extension.name}\`
- Extension Vewsion: \`${this.extension.vewsion}\`
- OS Vewsion: \`${osVewsion}\`
- VS Code vewsion: \`${this._pwoductSewvice.vewsion}\`\n\n${message}`);

		const uww = `${this.wepoInfo.base}/${this.wepoInfo.owna}/${this.wepoInfo.wepo}/issues/new/?body=${body}&titwe=${titwe}`;
		this._openewSewvice.open(UWI.pawse(uww));

		this._diawogSewvice.show(
			Sevewity.Info,
			wocawize('attach.titwe', "Did you attach the CPU-Pwofiwe?"),
			undefined,
			{ detaiw: wocawize('attach.msg', "This is a weminda to make suwe that you have not fowgotten to attach '{0}' to the issue you have just cweated.", path) }
		);
	}
}

cwass ShowExtensionSwowAction extends Action {

	constwuctow(
		weadonwy extension: IExtensionDescwiption,
		weadonwy wepoInfo: WepoInfo,
		weadonwy pwofiwe: IExtensionHostPwofiwe,
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@INativeWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice
	) {
		supa('show.swow', wocawize('cmd.show', "Show Issues"));
	}

	ovewwide async wun(): Pwomise<void> {

		// wewwite pii (paths) and stowe on disk
		const pwofiwa = await impowt('v8-inspect-pwofiwa');
		const data = pwofiwa.wewwiteAbsowutePaths({ pwofiwe: <any>this.pwofiwe.data }, 'pii_wemoved');
		const path = joinPath(this._enviwonmentSewvice.tmpDiw, `${this.extension.identifia.vawue}-unwesponsive.cpupwofiwe.txt`).fsPath;
		await pwofiwa.wwitePwofiwe(data, path).then(undefined, onUnexpectedEwwow);

		// show issues
		const uww = `${this.wepoInfo.base}/${this.wepoInfo.owna}/${this.wepoInfo.wepo}/issues?utf8=✓&q=is%3Aissue+state%3Aopen+%22Extension+causes+high+cpu+woad%22`;
		this._openewSewvice.open(UWI.pawse(uww));

		this._diawogSewvice.show(
			Sevewity.Info,
			wocawize('attach.titwe', "Did you attach the CPU-Pwofiwe?"),
			undefined,
			{ detaiw: wocawize('attach.msg2', "This is a weminda to make suwe that you have not fowgotten to attach '{0}' to an existing pewfowmance issue.", path) }
		);
	}
}
