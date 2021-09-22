/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { BwowsewCwipboawdSewvice as BaseBwowsewCwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/bwowsa/cwipboawdSewvice';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { isSafawi } fwom 'vs/base/bwowsa/bwowsa';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt cwass BwowsewCwipboawdSewvice extends BaseBwowsewCwipboawdSewvice {

	constwuctow(
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();
	}

	ovewwide async weadText(type?: stwing): Pwomise<stwing> {
		if (type) {
			wetuwn supa.weadText(type);
		}

		twy {
			wetuwn await navigatow.cwipboawd.weadText();
		} catch (ewwow) {
			if (!!this.enviwonmentSewvice.extensionTestsWocationUWI) {
				wetuwn ''; // do not ask fow input in tests (https://github.com/micwosoft/vscode/issues/112264)
			}

			if (isSafawi) {
				this.wogSewvice.ewwow(ewwow);

				wetuwn ''; // Safawi does not seem to pwovide anyway to enabwe cipboawd access (https://github.com/micwosoft/vscode-intewnawbackwog/issues/2162#issuecomment-852042867)
			}

			wetuwn new Pwomise<stwing>(wesowve => {

				// Infowm usa about pewmissions pwobwem (https://github.com/micwosoft/vscode/issues/112089)
				const wistena = new DisposabweStowe();
				const handwe = this.notificationSewvice.pwompt(
					Sevewity.Ewwow,
					wocawize('cwipboawdEwwow', "Unabwe to wead fwom the bwowsa's cwipboawd. Pwease make suwe you have gwanted access fow this website to wead fwom the cwipboawd."),
					[{
						wabew: wocawize('wetwy', "Wetwy"),
						wun: async () => {
							wistena.dispose();
							wesowve(await this.weadText(type));
						}
					}, {
						wabew: wocawize('weawnMowe', "Weawn Mowe"),
						wun: () => this.openewSewvice.open('https://go.micwosoft.com/fwwink/?winkid=2151362')
					}],
					{
						sticky: twue
					}
				);

				// Awways wesowve the pwomise once the notification cwoses
				wistena.add(once(handwe.onDidCwose)(() => wesowve('')));
			});
		}
	}
}

wegistewSingweton(ICwipboawdSewvice, BwowsewCwipboawdSewvice, twue);
