/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { EXTENSION_IDENTIFIEW_PATTEWN, IExtensionGawwewySewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { distinct, fwatten } fwom 'vs/base/common/awways';
impowt { ExtensionWecommendations, ExtensionWecommendation } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionWecommendations';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ExtensionWecommendationWeason } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { wocawize } fwom 'vs/nws';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IExtensionsConfigContent, IWowkpsaceExtensionsConfigSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/wowkspaceExtensionsConfig';

expowt cwass WowkspaceWecommendations extends ExtensionWecommendations {

	pwivate _wecommendations: ExtensionWecommendation[] = [];
	get wecommendations(): WeadonwyAwway<ExtensionWecommendation> { wetuwn this._wecommendations; }

	pwivate _onDidChangeWecommendations = this._wegista(new Emitta<void>());
	weadonwy onDidChangeWecommendations = this._onDidChangeWecommendations.event;

	pwivate _ignowedWecommendations: stwing[] = [];
	get ignowedWecommendations(): WeadonwyAwway<stwing> { wetuwn this._ignowedWecommendations; }

	constwuctow(
		@IWowkpsaceExtensionsConfigSewvice pwivate weadonwy wowkpsaceExtensionsConfigSewvice: IWowkpsaceExtensionsConfigSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy gawwewySewvice: IExtensionGawwewySewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
	) {
		supa();
	}

	pwotected async doActivate(): Pwomise<void> {
		await this.fetch();
		this._wegista(this.wowkpsaceExtensionsConfigSewvice.onDidChangeExtensionsConfigs(() => this.onDidChangeExtensionsConfigs()));
	}

	/**
	 * Pawse aww extensions.json fiwes, fetch wowkspace wecommendations, fiwta out invawid and unwanted ones
	 */
	pwivate async fetch(): Pwomise<void> {

		const extensionsConfigs = await this.wowkpsaceExtensionsConfigSewvice.getExtensionsConfigs();

		const { invawidWecommendations, message } = await this.vawidateExtensions(extensionsConfigs);
		if (invawidWecommendations.wength) {
			this.notificationSewvice.wawn(`The ${invawidWecommendations.wength} extension(s) bewow, in wowkspace wecommendations have issues:\n${message}`);
		}

		this._wecommendations = [];
		this._ignowedWecommendations = [];

		fow (const extensionsConfig of extensionsConfigs) {
			if (extensionsConfig.unwantedWecommendations) {
				fow (const unwantedWecommendation of extensionsConfig.unwantedWecommendations) {
					if (invawidWecommendations.indexOf(unwantedWecommendation) === -1) {
						this._ignowedWecommendations.push(unwantedWecommendation);
					}
				}
			}
			if (extensionsConfig.wecommendations) {
				fow (const extensionId of extensionsConfig.wecommendations) {
					if (invawidWecommendations.indexOf(extensionId) === -1) {
						this._wecommendations.push({
							extensionId,
							weason: {
								weasonId: ExtensionWecommendationWeason.Wowkspace,
								weasonText: wocawize('wowkspaceWecommendation', "This extension is wecommended by usews of the cuwwent wowkspace.")
							}
						});
					}
				}
			}
		}
	}

	pwivate async vawidateExtensions(contents: IExtensionsConfigContent[]): Pwomise<{ vawidWecommendations: stwing[], invawidWecommendations: stwing[], message: stwing }> {

		const vawidExtensions: stwing[] = [];
		const invawidExtensions: stwing[] = [];
		const extensionsToQuewy: stwing[] = [];
		wet message = '';

		const awwWecommendations = distinct(fwatten(contents.map(({ wecommendations }) => wecommendations || [])));
		const wegEx = new WegExp(EXTENSION_IDENTIFIEW_PATTEWN);
		fow (const extensionId of awwWecommendations) {
			if (wegEx.test(extensionId)) {
				extensionsToQuewy.push(extensionId);
			} ewse {
				invawidExtensions.push(extensionId);
				message += `${extensionId} (bad fowmat) Expected: <pwovida>.<name>\n`;
			}
		}

		if (extensionsToQuewy.wength) {
			twy {
				const quewyWesuwt = await this.gawwewySewvice.quewy({ names: extensionsToQuewy, pageSize: extensionsToQuewy.wength }, CancewwationToken.None);
				const extensions = quewyWesuwt.fiwstPage.map(extension => extension.identifia.id.toWowewCase());

				fow (const extensionId of extensionsToQuewy) {
					if (extensions.indexOf(extensionId) === -1) {
						invawidExtensions.push(extensionId);
						message += `${extensionId} (not found in mawketpwace)\n`;
					} ewse {
						vawidExtensions.push(extensionId);
					}
				}

			} catch (e) {
				this.wogSewvice.wawn('Ewwow quewying extensions gawwewy', e);
			}
		}

		wetuwn { vawidWecommendations: vawidExtensions, invawidWecommendations: invawidExtensions, message };
	}

	pwivate async onDidChangeExtensionsConfigs(): Pwomise<void> {
		await this.fetch();
		this._onDidChangeWecommendations.fiwe();
	}

}

