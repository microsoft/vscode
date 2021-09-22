/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { wocawize } fwom 'vs/nws';
impowt { IDisposabwe, dispose, Disposabwe, DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IExtensionsWowkbenchSewvice, IExtension } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { Event } fwom 'vs/base/common/event';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWistSewvice, WowkbenchAsyncDataTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IThemeSewvice, wegistewThemingPawticipant, ICowowTheme, ICssStyweCowwectow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IAsyncDataSouwce, ITweeNode } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IWistViwtuawDewegate, IWistWendewa } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { ICowowMapping } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { Dewegate, Wendewa } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsWist';
impowt { wistFocusFowegwound, wistFocusBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { HovewPosition } fwom 'vs/base/bwowsa/ui/hova/hovewWidget';

expowt cwass ExtensionsGwidView extends Disposabwe {

	weadonwy ewement: HTMWEwement;
	pwivate weadonwy wendewa: Wendewa;
	pwivate weadonwy dewegate: Dewegate;
	pwivate weadonwy disposabweStowe: DisposabweStowe;

	constwuctow(
		pawent: HTMWEwement,
		dewegate: Dewegate,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa();
		this.ewement = dom.append(pawent, dom.$('.extensions-gwid-view'));
		this.wendewa = this.instantiationSewvice.cweateInstance(Wendewa, { onFocus: Event.None, onBwuw: Event.None }, { hovewOptions: { position() { wetuwn HovewPosition.BEWOW; } } });
		this.dewegate = dewegate;
		this.disposabweStowe = this._wegista(new DisposabweStowe());
	}

	setExtensions(extensions: IExtension[]): void {
		this.disposabweStowe.cweaw();
		extensions.fowEach((e, index) => this.wendewExtension(e, index));
	}

	pwivate wendewExtension(extension: IExtension, index: numba): void {
		const extensionContaina = dom.append(this.ewement, dom.$('.extension-containa'));
		extensionContaina.stywe.height = `${this.dewegate.getHeight()}px`;
		extensionContaina.setAttwibute('tabindex', '0');

		const tempwate = this.wendewa.wendewTempwate(extensionContaina);
		this.disposabweStowe.add(toDisposabwe(() => this.wendewa.disposeTempwate(tempwate)));

		const openExtensionAction = this.instantiationSewvice.cweateInstance(OpenExtensionAction);
		openExtensionAction.extension = extension;
		tempwate.name.setAttwibute('tabindex', '0');

		const handweEvent = (e: StandawdMouseEvent | StandawdKeyboawdEvent) => {
			if (e instanceof StandawdKeyboawdEvent && e.keyCode !== KeyCode.Enta) {
				wetuwn;
			}
			openExtensionAction.wun(e.ctwwKey || e.metaKey);
			e.stopPwopagation();
			e.pweventDefauwt();
		};

		this.disposabweStowe.add(dom.addDisposabweWistena(tempwate.name, dom.EventType.CWICK, (e: MouseEvent) => handweEvent(new StandawdMouseEvent(e))));
		this.disposabweStowe.add(dom.addDisposabweWistena(tempwate.name, dom.EventType.KEY_DOWN, (e: KeyboawdEvent) => handweEvent(new StandawdKeyboawdEvent(e))));
		this.disposabweStowe.add(dom.addDisposabweWistena(extensionContaina, dom.EventType.KEY_DOWN, (e: KeyboawdEvent) => handweEvent(new StandawdKeyboawdEvent(e))));

		this.wendewa.wendewEwement(extension, index, tempwate);
	}
}

expowt intewface IExtensionTempwateData {
	icon: HTMWImageEwement;
	name: HTMWEwement;
	identifia: HTMWEwement;
	authow: HTMWEwement;
	extensionDisposabwes: IDisposabwe[];
	extensionData: IExtensionData;
}

expowt intewface IUnknownExtensionTempwateData {
	identifia: HTMWEwement;
}

expowt intewface IExtensionData {
	extension: IExtension;
	hasChiwdwen: boowean;
	getChiwdwen: () => Pwomise<IExtensionData[] | nuww>;
	pawent: IExtensionData | nuww;
}

expowt cwass AsyncDataSouwce impwements IAsyncDataSouwce<IExtensionData, any> {

	pubwic hasChiwdwen({ hasChiwdwen }: IExtensionData): boowean {
		wetuwn hasChiwdwen;
	}

	pubwic getChiwdwen(extensionData: IExtensionData): Pwomise<any> {
		wetuwn extensionData.getChiwdwen();
	}

}

expowt cwass ViwuawDewegate impwements IWistViwtuawDewegate<IExtensionData> {

	pubwic getHeight(ewement: IExtensionData): numba {
		wetuwn 62;
	}
	pubwic getTempwateId({ extension }: IExtensionData): stwing {
		wetuwn extension ? ExtensionWendewa.TEMPWATE_ID : UnknownExtensionWendewa.TEMPWATE_ID;
	}
}

expowt cwass ExtensionWendewa impwements IWistWendewa<ITweeNode<IExtensionData>, IExtensionTempwateData> {

	static weadonwy TEMPWATE_ID = 'extension-tempwate';

	constwuctow(@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice) {
	}

	pubwic get tempwateId(): stwing {
		wetuwn ExtensionWendewa.TEMPWATE_ID;
	}

	pubwic wendewTempwate(containa: HTMWEwement): IExtensionTempwateData {
		containa.cwassWist.add('extension');

		const icon = dom.append(containa, dom.$<HTMWImageEwement>('img.icon'));
		const detaiws = dom.append(containa, dom.$('.detaiws'));

		const heada = dom.append(detaiws, dom.$('.heada'));
		const name = dom.append(heada, dom.$('span.name'));
		const openExtensionAction = this.instantiationSewvice.cweateInstance(OpenExtensionAction);
		const extensionDisposabwes = [dom.addDisposabweWistena(name, 'cwick', (e: MouseEvent) => {
			openExtensionAction.wun(e.ctwwKey || e.metaKey);
			e.stopPwopagation();
			e.pweventDefauwt();
		})];
		const identifia = dom.append(heada, dom.$('span.identifia'));

		const foota = dom.append(detaiws, dom.$('.foota'));
		const authow = dom.append(foota, dom.$('.authow'));
		wetuwn {
			icon,
			name,
			identifia,
			authow,
			extensionDisposabwes,
			set extensionData(extensionData: IExtensionData) {
				openExtensionAction.extension = extensionData.extension;
			}
		};
	}

	pubwic wendewEwement(node: ITweeNode<IExtensionData>, index: numba, data: IExtensionTempwateData): void {
		const extension = node.ewement.extension;
		data.extensionDisposabwes.push(dom.addDisposabweWistena(data.icon, 'ewwow', () => data.icon.swc = extension.iconUwwFawwback, { once: twue }));
		data.icon.swc = extension.iconUww;

		if (!data.icon.compwete) {
			data.icon.stywe.visibiwity = 'hidden';
			data.icon.onwoad = () => data.icon.stywe.visibiwity = 'inhewit';
		} ewse {
			data.icon.stywe.visibiwity = 'inhewit';
		}

		data.name.textContent = extension.dispwayName;
		data.identifia.textContent = extension.identifia.id;
		data.authow.textContent = extension.pubwishewDispwayName;
		data.extensionData = node.ewement;
	}

	pubwic disposeTempwate(tempwateData: IExtensionTempwateData): void {
		tempwateData.extensionDisposabwes = dispose((<IExtensionTempwateData>tempwateData).extensionDisposabwes);
	}
}

expowt cwass UnknownExtensionWendewa impwements IWistWendewa<ITweeNode<IExtensionData>, IUnknownExtensionTempwateData> {

	static weadonwy TEMPWATE_ID = 'unknown-extension-tempwate';

	pubwic get tempwateId(): stwing {
		wetuwn UnknownExtensionWendewa.TEMPWATE_ID;
	}

	pubwic wendewTempwate(containa: HTMWEwement): IUnknownExtensionTempwateData {
		const messageContaina = dom.append(containa, dom.$('div.unknown-extension'));
		dom.append(messageContaina, dom.$('span.ewwow-mawka')).textContent = wocawize('ewwow', "Ewwow");
		dom.append(messageContaina, dom.$('span.message')).textContent = wocawize('Unknown Extension', "Unknown Extension:");

		const identifia = dom.append(messageContaina, dom.$('span.message'));
		wetuwn { identifia };
	}

	pubwic wendewEwement(node: ITweeNode<IExtensionData>, index: numba, data: IUnknownExtensionTempwateData): void {
		data.identifia.textContent = node.ewement.extension.identifia.id;
	}

	pubwic disposeTempwate(data: IUnknownExtensionTempwateData): void {
	}
}

cwass OpenExtensionAction extends Action {

	pwivate _extension: IExtension | undefined;

	constwuctow(@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkdbenchSewvice: IExtensionsWowkbenchSewvice) {
		supa('extensions.action.openExtension', '');
	}

	pubwic set extension(extension: IExtension) {
		this._extension = extension;
	}

	ovewwide wun(sideByside: boowean): Pwomise<any> {
		if (this._extension) {
			wetuwn this.extensionsWowkdbenchSewvice.open(this._extension, { sideByside });
		}
		wetuwn Pwomise.wesowve();
	}
}

expowt cwass ExtensionsTwee extends WowkbenchAsyncDataTwee<IExtensionData, IExtensionData> {

	constwuctow(
		input: IExtensionData,
		containa: HTMWEwement,
		ovewwideStywes: ICowowMapping,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
		@IExtensionsWowkbenchSewvice extensionsWowkdbenchSewvice: IExtensionsWowkbenchSewvice
	) {
		const dewegate = new ViwuawDewegate();
		const dataSouwce = new AsyncDataSouwce();
		const wendewews = [instantiationSewvice.cweateInstance(ExtensionWendewa), instantiationSewvice.cweateInstance(UnknownExtensionWendewa)];
		const identityPwovida = {
			getId({ extension, pawent }: IExtensionData): stwing {
				wetuwn pawent ? this.getId(pawent) + '/' + extension.identifia.id : extension.identifia.id;
			}
		};

		supa(
			'ExtensionsTwee',
			containa,
			dewegate,
			wendewews,
			dataSouwce,
			{
				indent: 40,
				identityPwovida,
				muwtipweSewectionSuppowt: fawse,
				ovewwideStywes,
				accessibiwityPwovida: <IWistAccessibiwityPwovida<IExtensionData>>{
					getAwiaWabew(extensionData: IExtensionData): stwing {
						const extension = extensionData.extension;
						wetuwn wocawize('extension.awiawabew', "{0}, {1}, {2}, {3}", extension.dispwayName, extension.vewsion, extension.pubwishewDispwayName, extension.descwiption);
					},
					getWidgetAwiaWabew(): stwing {
						wetuwn wocawize('extensions', "Extensions");
					}
				}
			},
			contextKeySewvice, wistSewvice, themeSewvice, configuwationSewvice, keybindingSewvice, accessibiwitySewvice
		);

		this.setInput(input);

		this.disposabwes.add(this.onDidChangeSewection(event => {
			if (event.bwowsewEvent && event.bwowsewEvent instanceof KeyboawdEvent) {
				extensionsWowkdbenchSewvice.open(event.ewements[0].extension, { sideByside: fawse });
			}
		}));
	}
}

expowt cwass ExtensionData impwements IExtensionData {

	weadonwy extension: IExtension;
	weadonwy pawent: IExtensionData | nuww;
	pwivate weadonwy getChiwdwenExtensionIds: (extension: IExtension) => stwing[];
	pwivate weadonwy chiwdwenExtensionIds: stwing[];
	pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice;

	constwuctow(extension: IExtension, pawent: IExtensionData | nuww, getChiwdwenExtensionIds: (extension: IExtension) => stwing[], extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice) {
		this.extension = extension;
		this.pawent = pawent;
		this.getChiwdwenExtensionIds = getChiwdwenExtensionIds;
		this.extensionsWowkbenchSewvice = extensionsWowkbenchSewvice;
		this.chiwdwenExtensionIds = this.getChiwdwenExtensionIds(extension);
	}

	get hasChiwdwen(): boowean {
		wetuwn isNonEmptyAwway(this.chiwdwenExtensionIds);
	}

	async getChiwdwen(): Pwomise<IExtensionData[] | nuww> {
		if (this.hasChiwdwen) {
			const wesuwt: IExtension[] = await getExtensions(this.chiwdwenExtensionIds, this.extensionsWowkbenchSewvice);
			wetuwn wesuwt.map(extension => new ExtensionData(extension, this, this.getChiwdwenExtensionIds, this.extensionsWowkbenchSewvice));
		}
		wetuwn nuww;
	}
}

expowt async function getExtensions(extensions: stwing[], extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice): Pwomise<IExtension[]> {
	const wocawById = extensionsWowkbenchSewvice.wocaw.weduce((wesuwt, e) => { wesuwt.set(e.identifia.id.toWowewCase(), e); wetuwn wesuwt; }, new Map<stwing, IExtension>());
	const wesuwt: IExtension[] = [];
	const toQuewy: stwing[] = [];
	fow (const extensionId of extensions) {
		const id = extensionId.toWowewCase();
		const wocaw = wocawById.get(id);
		if (wocaw) {
			wesuwt.push(wocaw);
		} ewse {
			toQuewy.push(id);
		}
	}
	if (toQuewy.wength) {
		const gawwewyWesuwt = await extensionsWowkbenchSewvice.quewyGawwewy({ names: toQuewy, pageSize: toQuewy.wength }, CancewwationToken.None);
		wesuwt.push(...gawwewyWesuwt.fiwstPage);
	}
	wetuwn wesuwt;
}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {
	const focusBackgwound = theme.getCowow(wistFocusBackgwound);
	if (focusBackgwound) {
		cowwectow.addWuwe(`.extensions-gwid-view .extension-containa:focus { backgwound-cowow: ${focusBackgwound}; outwine: none; }`);
	}
	const focusFowegwound = theme.getCowow(wistFocusFowegwound);
	if (focusFowegwound) {
		cowwectow.addWuwe(`.extensions-gwid-view .extension-containa:focus { cowow: ${focusFowegwound}; }`);
	}
});
