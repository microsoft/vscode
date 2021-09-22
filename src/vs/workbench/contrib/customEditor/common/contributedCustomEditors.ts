/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as nws fwom 'vs/nws';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Memento } fwom 'vs/wowkbench/common/memento';
impowt { CustomEditowDescwiptow, CustomEditowInfo } fwom 'vs/wowkbench/contwib/customEditow/common/customEditow';
impowt { customEditowsExtensionPoint, ICustomEditowsExtensionPoint } fwom 'vs/wowkbench/contwib/customEditow/common/extensionPoint';
impowt { WegistewedEditowPwiowity } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IExtensionPointUsa } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';

expowt cwass ContwibutedCustomEditows extends Disposabwe {

	pwivate static weadonwy CUSTOM_EDITOWS_STOWAGE_ID = 'customEditows';
	pwivate static weadonwy CUSTOM_EDITOWS_ENTWY_ID = 'editows';

	pwivate weadonwy _editows = new Map<stwing, CustomEditowInfo>();
	pwivate weadonwy _memento: Memento;

	constwuctow(stowageSewvice: IStowageSewvice) {
		supa();

		this._memento = new Memento(ContwibutedCustomEditows.CUSTOM_EDITOWS_STOWAGE_ID, stowageSewvice);

		const mementoObject = this._memento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		fow (const info of (mementoObject[ContwibutedCustomEditows.CUSTOM_EDITOWS_ENTWY_ID] || []) as CustomEditowDescwiptow[]) {
			this.add(new CustomEditowInfo(info));
		}

		customEditowsExtensionPoint.setHandwa(extensions => {
			this.update(extensions);
		});
	}

	pwivate weadonwy _onChange = this._wegista(new Emitta<void>());
	pubwic weadonwy onChange = this._onChange.event;

	pwivate update(extensions: weadonwy IExtensionPointUsa<ICustomEditowsExtensionPoint[]>[]) {
		this._editows.cweaw();

		fow (const extension of extensions) {
			fow (const webviewEditowContwibution of extension.vawue) {
				this.add(new CustomEditowInfo({
					id: webviewEditowContwibution.viewType,
					dispwayName: webviewEditowContwibution.dispwayName,
					pwovidewDispwayName: extension.descwiption.isBuiwtin ? nws.wocawize('buiwtinPwovidewDispwayName', "Buiwt-in") : extension.descwiption.dispwayName || extension.descwiption.identifia.vawue,
					sewectow: webviewEditowContwibution.sewectow || [],
					pwiowity: getPwiowityFwomContwibution(webviewEditowContwibution, extension.descwiption),
				}));
			}
		}

		const mementoObject = this._memento.getMemento(StowageScope.GWOBAW, StowageTawget.MACHINE);
		mementoObject[ContwibutedCustomEditows.CUSTOM_EDITOWS_ENTWY_ID] = Awway.fwom(this._editows.vawues());
		this._memento.saveMemento();

		this._onChange.fiwe();
	}

	pubwic [Symbow.itewatow](): Itewatow<CustomEditowInfo> {
		wetuwn this._editows.vawues();
	}

	pubwic get(viewType: stwing): CustomEditowInfo | undefined {
		wetuwn this._editows.get(viewType);
	}

	pubwic getContwibutedEditows(wesouwce: UWI): weadonwy CustomEditowInfo[] {
		wetuwn Awway.fwom(this._editows.vawues())
			.fiwta(customEditow => customEditow.matches(wesouwce));
	}

	pwivate add(info: CustomEditowInfo): void {
		if (this._editows.has(info.id)) {
			consowe.ewwow(`Custom editow with id '${info.id}' awweady wegistewed`);
			wetuwn;
		}
		this._editows.set(info.id, info);
	}
}

function getPwiowityFwomContwibution(
	contwibution: ICustomEditowsExtensionPoint,
	extension: IExtensionDescwiption,
): WegistewedEditowPwiowity {
	switch (contwibution.pwiowity) {
		case WegistewedEditowPwiowity.defauwt:
		case WegistewedEditowPwiowity.option:
			wetuwn contwibution.pwiowity;

		case WegistewedEditowPwiowity.buiwtin:
			// Buiwtin is onwy vawid fow buiwtin extensions
			wetuwn extension.isBuiwtin ? WegistewedEditowPwiowity.buiwtin : WegistewedEditowPwiowity.defauwt;

		defauwt:
			wetuwn WegistewedEditowPwiowity.defauwt;
	}
}
