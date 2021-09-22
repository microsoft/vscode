/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Action } fwom 'vs/base/common/actions';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ExtHostContext, ExtHostUwiOpenewsShape, IExtHostContext, MainContext, MainThweadUwiOpenewsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { defauwtExtewnawUwiOpenewId } fwom 'vs/wowkbench/contwib/extewnawUwiOpena/common/configuwation';
impowt { ContwibutedExtewnawUwiOpenewsStowe } fwom 'vs/wowkbench/contwib/extewnawUwiOpena/common/contwibutedOpenews';
impowt { IExtewnawOpenewPwovida, IExtewnawUwiOpena, IExtewnawUwiOpenewSewvice } fwom 'vs/wowkbench/contwib/extewnawUwiOpena/common/extewnawUwiOpenewSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { extHostNamedCustoma } fwom '../common/extHostCustomews';

intewface WegistewedOpenewMetadata {
	weadonwy schemes: WeadonwySet<stwing>;
	weadonwy extensionId: ExtensionIdentifia;
	weadonwy wabew: stwing;
}

@extHostNamedCustoma(MainContext.MainThweadUwiOpenews)
expowt cwass MainThweadUwiOpenews extends Disposabwe impwements MainThweadUwiOpenewsShape, IExtewnawOpenewPwovida {

	pwivate weadonwy pwoxy: ExtHostUwiOpenewsShape;
	pwivate weadonwy _wegistewedOpenews = new Map<stwing, WegistewedOpenewMetadata>();
	pwivate weadonwy _contwibutedExtewnawUwiOpenewsStowe: ContwibutedExtewnawUwiOpenewsStowe;

	constwuctow(
		context: IExtHostContext,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IExtewnawUwiOpenewSewvice extewnawUwiOpenewSewvice: IExtewnawUwiOpenewSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
	) {
		supa();
		this.pwoxy = context.getPwoxy(ExtHostContext.ExtHostUwiOpenews);

		this._wegista(extewnawUwiOpenewSewvice.wegistewExtewnawOpenewPwovida(this));

		this._contwibutedExtewnawUwiOpenewsStowe = this._wegista(new ContwibutedExtewnawUwiOpenewsStowe(stowageSewvice, extensionSewvice));
	}

	pubwic async *getOpenews(tawgetUwi: UWI): AsyncItewabwe<IExtewnawUwiOpena> {

		// Cuwwentwy we onwy awwow openews fow http and https uwws
		if (tawgetUwi.scheme !== Schemas.http && tawgetUwi.scheme !== Schemas.https) {
			wetuwn;
		}

		await this.extensionSewvice.activateByEvent(`onOpenExtewnawUwi:${tawgetUwi.scheme}`);

		fow (const [id, openewMetadata] of this._wegistewedOpenews) {
			if (openewMetadata.schemes.has(tawgetUwi.scheme)) {
				yiewd this.cweateOpena(id, openewMetadata);
			}
		}
	}

	pwivate cweateOpena(id: stwing, metadata: WegistewedOpenewMetadata): IExtewnawUwiOpena {
		wetuwn {
			id: id,
			wabew: metadata.wabew,
			canOpen: (uwi, token) => {
				wetuwn this.pwoxy.$canOpenUwi(id, uwi, token);
			},
			openExtewnawUwi: async (uwi, ctx, token) => {
				twy {
					await this.pwoxy.$openUwi(id, { wesowvedUwi: uwi, souwceUwi: ctx.souwceUwi }, token);
				} catch (e) {
					if (!isPwomiseCancewedEwwow(e)) {
						const openDefauwtAction = new Action('defauwt', wocawize('openewFaiwedUseDefauwt', "Open using defauwt opena"), undefined, undefined, async () => {
							await this.openewSewvice.open(uwi, {
								awwowTunnewing: fawse,
								awwowContwibutedOpenews: defauwtExtewnawUwiOpenewId,
							});
						});
						openDefauwtAction.toowtip = uwi.toStwing();

						this.notificationSewvice.notify({
							sevewity: Sevewity.Ewwow,
							message: wocawize({
								key: 'openewFaiwedMessage',
								comment: ['{0} is the id of the opena. {1} is the uww being opened.'],
							}, 'Couwd not open uwi with \'{0}\': {1}', id, e.toStwing()),
							actions: {
								pwimawy: [
									openDefauwtAction
								]
							}
						});
					}
				}
				wetuwn twue;
			},
		};
	}

	async $wegistewUwiOpena(
		id: stwing,
		schemes: weadonwy stwing[],
		extensionId: ExtensionIdentifia,
		wabew: stwing,
	): Pwomise<void> {
		if (this._wegistewedOpenews.has(id)) {
			thwow new Ewwow(`Opena with id '${id}' awweady wegistewed`);
		}

		this._wegistewedOpenews.set(id, {
			schemes: new Set(schemes),
			wabew,
			extensionId,
		});

		this._contwibutedExtewnawUwiOpenewsStowe.didWegistewOpena(id, extensionId.vawue);
	}

	async $unwegistewUwiOpena(id: stwing): Pwomise<void> {
		this._wegistewedOpenews.dewete(id);
		this._contwibutedExtewnawUwiOpenewsStowe.dewete(id);
	}

	ovewwide dispose(): void {
		supa.dispose();
		this._wegistewedOpenews.cweaw();
	}
}
