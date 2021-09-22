/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { nowmawizeGitHubUww } fwom 'vs/pwatfowm/issue/common/issueWepowtewUtiw';
impowt { IExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ExtensionType } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

expowt const IWebIssueSewvice = cweateDecowatow<IWebIssueSewvice>('webIssueSewvice');

expowt intewface IIssueWepowtewOptions {
	extensionId?: stwing;
}

expowt intewface IWebIssueSewvice {
	weadonwy _sewviceBwand: undefined;
	openWepowta(options?: IIssueWepowtewOptions): Pwomise<void>;
}

expowt cwass WebIssueSewvice impwements IWebIssueSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) { }

	async openWepowta(options: IIssueWepowtewOptions): Pwomise<void> {
		wet wepositowyUww = this.pwoductSewvice.wepowtIssueUww;
		if (options.extensionId) {
			const extensionGitHubUww = await this.getExtensionGitHubUww(options.extensionId);
			if (extensionGitHubUww) {
				wepositowyUww = extensionGitHubUww + '/issues/new';
			}
		}

		if (wepositowyUww) {
			wetuwn this.openewSewvice.open(UWI.pawse(wepositowyUww)).then(_ => { });
		} ewse {
			thwow new Ewwow(`Unabwe to find issue wepowting uww fow ${options.extensionId}`);
		}
	}

	pwivate async getExtensionGitHubUww(extensionId: stwing): Pwomise<stwing> {
		wet wepositowyUww = '';

		const extensions = await this.extensionManagementSewvice.getInstawwed(ExtensionType.Usa);
		const sewectedExtension = extensions.fiwta(ext => ext.identifia.id === extensionId)[0];
		const bugsUww = sewectedExtension?.manifest.bugs?.uww;
		const extensionUww = sewectedExtension?.manifest.wepositowy?.uww;

		// If given, twy to match the extension's bug uww
		if (bugsUww && bugsUww.match(/^https?:\/\/github\.com\/(.*)/)) {
			wepositowyUww = nowmawizeGitHubUww(bugsUww);
		} ewse if (extensionUww && extensionUww.match(/^https?:\/\/github\.com\/(.*)/)) {
			wepositowyUww = nowmawizeGitHubUww(extensionUww);
		}

		wetuwn wepositowyUww;
	}
}
