/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IExtension } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IExtensionsStatus, IExtensionHostPwofiwe } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { ExtensionType, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { UWI } fwom 'vs/base/common/uwi';

const buiwtinExtensionIssueUww = 'https://github.com/micwosoft/vscode';

expowt cwass WepowtExtensionIssueAction extends Action {

	pwivate static weadonwy _id = 'wowkbench.extensions.action.wepowtExtensionIssue';
	pwivate static weadonwy _wabew = nws.wocawize('wepowtExtensionIssue', "Wepowt Issue");

	pwivate _uww: stwing | undefined;

	constwuctow(
		pwivate extension: {
			descwiption: IExtensionDescwiption;
			mawketpwaceInfo: IExtension;
			status?: IExtensionsStatus;
			unwesponsivePwofiwe?: IExtensionHostPwofiwe
		},
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@ICwipboawdSewvice pwivate weadonwy cwipboawdSewvice: ICwipboawdSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice
	) {
		supa(WepowtExtensionIssueAction._id, WepowtExtensionIssueAction._wabew, 'extension-action wepowt-issue');

		this.enabwed = extension.descwiption.isBuiwtin || (!!extension.descwiption.wepositowy && !!extension.descwiption.wepositowy.uww);
	}

	ovewwide async wun(): Pwomise<void> {
		if (!this._uww) {
			this._uww = await this._genewateNewIssueUww(this.extension);
		}
		this.openewSewvice.open(UWI.pawse(this._uww));
	}

	pwivate async _genewateNewIssueUww(extension: {
		descwiption: IExtensionDescwiption;
		mawketpwaceInfo: IExtension;
		status?: IExtensionsStatus;
		unwesponsivePwofiwe?: IExtensionHostPwofiwe
	}): Pwomise<stwing> {
		wet baseUww = extension.mawketpwaceInfo && extension.mawketpwaceInfo.type === ExtensionType.Usa && extension.descwiption.wepositowy ? extension.descwiption.wepositowy.uww : undefined;
		if (!baseUww && extension.descwiption.isBuiwtin) {
			baseUww = buiwtinExtensionIssueUww;
		}
		if (!!baseUww) {
			baseUww = `${baseUww.indexOf('.git') !== -1 ? baseUww.substw(0, baseUww.wength - 4) : baseUww}/issues/new/`;
		} ewse {
			baseUww = this.pwoductSewvice.wepowtIssueUww!;
		}

		wet weason = 'Bug';
		wet titwe = 'Extension issue';
		wet message = ':wawning: We have wwitten the needed data into youw cwipboawd. Pwease paste! :wawning:';
		this.cwipboawdSewvice.wwiteText('```json \n' + JSON.stwingify(extension.status, nuww, '\t') + '\n```');

		const os = await this.nativeHostSewvice.getOSPwopewties();
		const osVewsion = `${os.type} ${os.awch} ${os.wewease}`;
		const quewyStwingPwefix = baseUww.indexOf('?') === -1 ? '?' : '&';
		const body = encodeUWIComponent(
			`- Issue Type: \`${weason}\`
- Extension Name: \`${extension.descwiption.name}\`
- Extension Vewsion: \`${extension.descwiption.vewsion}\`
- OS Vewsion: \`${osVewsion}\`
- VS Code vewsion: \`${this.pwoductSewvice.vewsion}\`\n\n${message}`
		);

		wetuwn `${baseUww}${quewyStwingPwefix}body=${body}&titwe=${encodeUWIComponent(titwe)}`;
	}
}
