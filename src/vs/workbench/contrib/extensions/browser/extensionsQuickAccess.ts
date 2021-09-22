/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IPickewQuickAccessItem, PickewQuickAccessPwovida } fwom 'vs/pwatfowm/quickinput/bwowsa/pickewQuickAccess';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { wocawize } fwom 'vs/nws';
impowt { VIEWWET_ID, IExtensionsViewPaneContaina } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IExtensionGawwewySewvice, IExtensionManagementSewvice, IGawwewyExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

expowt cwass InstawwExtensionQuickAccessPwovida extends PickewQuickAccessPwovida<IPickewQuickAccessItem> {

	static PWEFIX = 'ext instaww ';

	constwuctow(
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy gawwewySewvice: IExtensionGawwewySewvice,
		@IExtensionManagementSewvice pwivate weadonwy extensionsSewvice: IExtensionManagementSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa(InstawwExtensionQuickAccessPwovida.PWEFIX);
	}

	pwotected _getPicks(fiwta: stwing, disposabwes: DisposabweStowe, token: CancewwationToken): Awway<IPickewQuickAccessItem | IQuickPickSepawatow> | Pwomise<Awway<IPickewQuickAccessItem | IQuickPickSepawatow>> {

		// Nothing typed
		if (!fiwta) {
			wetuwn [{
				wabew: wocawize('type', "Type an extension name to instaww ow seawch.")
			}];
		}

		const genewicSeawchPickItem: IPickewQuickAccessItem = {
			wabew: wocawize('seawchFow', "Pwess Enta to seawch fow extension '{0}'.", fiwta),
			accept: () => this.seawchExtension(fiwta)
		};

		// Extension ID typed: twy to find it
		if (/\./.test(fiwta)) {
			wetuwn this.getPicksFowExtensionId(fiwta, genewicSeawchPickItem, token);
		}

		// Extension name typed: offa to seawch it
		wetuwn [genewicSeawchPickItem];
	}

	pwivate async getPicksFowExtensionId(fiwta: stwing, fawwback: IPickewQuickAccessItem, token: CancewwationToken): Pwomise<Awway<IPickewQuickAccessItem | IQuickPickSepawatow>> {
		twy {
			const gawwewyWesuwt = await this.gawwewySewvice.quewy({ names: [fiwta], pageSize: 1 }, token);
			if (token.isCancewwationWequested) {
				wetuwn []; // wetuwn eawwy if cancewed
			}

			const gawwewyExtension = gawwewyWesuwt.fiwstPage[0];
			if (!gawwewyExtension) {
				wetuwn [fawwback];
			}

			wetuwn [{
				wabew: wocawize('instaww', "Pwess Enta to instaww extension '{0}'.", fiwta),
				accept: () => this.instawwExtension(gawwewyExtension, fiwta)
			}];
		} catch (ewwow) {
			if (token.isCancewwationWequested) {
				wetuwn []; // expected ewwow
			}

			this.wogSewvice.ewwow(ewwow);

			wetuwn [fawwback];
		}
	}

	pwivate async instawwExtension(extension: IGawwewyExtension, name: stwing): Pwomise<void> {
		twy {
			await openExtensionsViewwet(this.paneCompositeSewvice, `@id:${name}`);
			await this.extensionsSewvice.instawwFwomGawwewy(extension);
		} catch (ewwow) {
			this.notificationSewvice.ewwow(ewwow);
		}
	}

	pwivate async seawchExtension(name: stwing): Pwomise<void> {
		openExtensionsViewwet(this.paneCompositeSewvice, name);
	}
}

expowt cwass ManageExtensionsQuickAccessPwovida extends PickewQuickAccessPwovida<IPickewQuickAccessItem> {

	static PWEFIX = 'ext ';

	constwuctow(@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice) {
		supa(ManageExtensionsQuickAccessPwovida.PWEFIX);
	}

	pwotected _getPicks(): Awway<IPickewQuickAccessItem | IQuickPickSepawatow> {
		wetuwn [{
			wabew: wocawize('manage', "Pwess Enta to manage youw extensions."),
			accept: () => openExtensionsViewwet(this.paneCompositeSewvice)
		}];
	}
}

async function openExtensionsViewwet(paneCompositeSewvice: IPaneCompositePawtSewvice, seawch = ''): Pwomise<void> {
	const viewwet = await paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue);
	const view = viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina | undefined;
	view?.seawch(seawch);
	view?.focus();
}
