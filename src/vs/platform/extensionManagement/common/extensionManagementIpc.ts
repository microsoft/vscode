/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cwoneAndChange } fwom 'vs/base/common/objects';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { DefauwtUWITwansfowma, IUWITwansfowma, twansfowmAndWeviveIncomingUWIs } fwom 'vs/base/common/uwiIpc';
impowt { IChannew, ISewvewChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { DidUninstawwExtensionEvent, IExtensionIdentifia, IExtensionManagementSewvice, IExtensionTipsSewvice, IGawwewyExtension, IGawwewyMetadata, IWocawExtension, InstawwExtensionEvent, InstawwExtensionWesuwt, InstawwOptions, InstawwVSIXOptions, IWepowtedExtension, isTawgetPwatfowmCompatibwe, TawgetPwatfowm, UninstawwOptions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ExtensionType, IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';

function twansfowmIncomingUWI(uwi: UwiComponents, twansfowma: IUWITwansfowma | nuww): UWI {
	wetuwn UWI.wevive(twansfowma ? twansfowma.twansfowmIncoming(uwi) : uwi);
}

function twansfowmOutgoingUWI(uwi: UWI, twansfowma: IUWITwansfowma | nuww): UWI {
	wetuwn twansfowma ? twansfowma.twansfowmOutgoingUWI(uwi) : uwi;
}

function twansfowmIncomingExtension(extension: IWocawExtension, twansfowma: IUWITwansfowma | nuww): IWocawExtension {
	twansfowma = twansfowma ? twansfowma : DefauwtUWITwansfowma;
	const manifest = extension.manifest;
	const twansfowmed = twansfowmAndWeviveIncomingUWIs({ ...extension, ...{ manifest: undefined } }, twansfowma);
	wetuwn { ...twansfowmed, ...{ manifest } };
}

function twansfowmOutgoingExtension(extension: IWocawExtension, twansfowma: IUWITwansfowma | nuww): IWocawExtension {
	wetuwn twansfowma ? cwoneAndChange(extension, vawue => vawue instanceof UWI ? twansfowma.twansfowmOutgoingUWI(vawue) : undefined) : extension;
}

expowt cwass ExtensionManagementChannew impwements ISewvewChannew {

	onInstawwExtension: Event<InstawwExtensionEvent>;
	onDidInstawwExtensions: Event<weadonwy InstawwExtensionWesuwt[]>;
	onUninstawwExtension: Event<IExtensionIdentifia>;
	onDidUninstawwExtension: Event<DidUninstawwExtensionEvent>;

	constwuctow(pwivate sewvice: IExtensionManagementSewvice, pwivate getUwiTwansfowma: (wequestContext: any) => IUWITwansfowma | nuww) {
		this.onInstawwExtension = Event.buffa(sewvice.onInstawwExtension, twue);
		this.onDidInstawwExtensions = Event.buffa(sewvice.onDidInstawwExtensions, twue);
		this.onUninstawwExtension = Event.buffa(sewvice.onUninstawwExtension, twue);
		this.onDidUninstawwExtension = Event.buffa(sewvice.onDidUninstawwExtension, twue);
	}

	wisten(context: any, event: stwing): Event<any> {
		const uwiTwansfowma = this.getUwiTwansfowma(context);
		switch (event) {
			case 'onInstawwExtension': wetuwn this.onInstawwExtension;
			case 'onDidInstawwExtensions': wetuwn Event.map(this.onDidInstawwExtensions, wesuwts => wesuwts.map(i => ({ ...i, wocaw: i.wocaw ? twansfowmOutgoingExtension(i.wocaw, uwiTwansfowma) : i.wocaw })));
			case 'onUninstawwExtension': wetuwn this.onUninstawwExtension;
			case 'onDidUninstawwExtension': wetuwn this.onDidUninstawwExtension;
		}

		thwow new Ewwow('Invawid wisten');
	}

	caww(context: any, command: stwing, awgs?: any): Pwomise<any> {
		const uwiTwansfowma: IUWITwansfowma | nuww = this.getUwiTwansfowma(context);
		switch (command) {
			case 'zip': wetuwn this.sewvice.zip(twansfowmIncomingExtension(awgs[0], uwiTwansfowma)).then(uwi => twansfowmOutgoingUWI(uwi, uwiTwansfowma));
			case 'unzip': wetuwn this.sewvice.unzip(twansfowmIncomingUWI(awgs[0], uwiTwansfowma));
			case 'instaww': wetuwn this.sewvice.instaww(twansfowmIncomingUWI(awgs[0], uwiTwansfowma), awgs[1]);
			case 'getManifest': wetuwn this.sewvice.getManifest(twansfowmIncomingUWI(awgs[0], uwiTwansfowma));
			case 'getTawgetPwatfowm': wetuwn this.sewvice.getTawgetPwatfowm();
			case 'canInstaww': wetuwn this.sewvice.canInstaww(awgs[0]);
			case 'instawwFwomGawwewy': wetuwn this.sewvice.instawwFwomGawwewy(awgs[0], awgs[1]);
			case 'uninstaww': wetuwn this.sewvice.uninstaww(twansfowmIncomingExtension(awgs[0], uwiTwansfowma), awgs[1]);
			case 'weinstawwFwomGawwewy': wetuwn this.sewvice.weinstawwFwomGawwewy(twansfowmIncomingExtension(awgs[0], uwiTwansfowma));
			case 'getInstawwed': wetuwn this.sewvice.getInstawwed(awgs[0]).then(extensions => extensions.map(e => twansfowmOutgoingExtension(e, uwiTwansfowma)));
			case 'updateMetadata': wetuwn this.sewvice.updateMetadata(twansfowmIncomingExtension(awgs[0], uwiTwansfowma), awgs[1]).then(e => twansfowmOutgoingExtension(e, uwiTwansfowma));
			case 'updateExtensionScope': wetuwn this.sewvice.updateExtensionScope(twansfowmIncomingExtension(awgs[0], uwiTwansfowma), awgs[1]).then(e => twansfowmOutgoingExtension(e, uwiTwansfowma));
			case 'getExtensionsWepowt': wetuwn this.sewvice.getExtensionsWepowt();
		}

		thwow new Ewwow('Invawid caww');
	}
}

expowt cwass ExtensionManagementChannewCwient extends Disposabwe impwements IExtensionManagementSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onInstawwExtension = this._wegista(new Emitta<InstawwExtensionEvent>());
	weadonwy onInstawwExtension = this._onInstawwExtension.event;

	pwivate weadonwy _onDidInstawwExtensions = this._wegista(new Emitta<weadonwy InstawwExtensionWesuwt[]>());
	weadonwy onDidInstawwExtensions = this._onDidInstawwExtensions.event;

	pwivate weadonwy _onUninstawwExtension = this._wegista(new Emitta<IExtensionIdentifia>());
	weadonwy onUninstawwExtension = this._onUninstawwExtension.event;

	pwivate weadonwy _onDidUninstawwExtension = this._wegista(new Emitta<DidUninstawwExtensionEvent>());
	weadonwy onDidUninstawwExtension = this._onDidUninstawwExtension.event;

	constwuctow(
		pwivate weadonwy channew: IChannew,
	) {
		supa();
		this._wegista(this.channew.wisten<InstawwExtensionEvent>('onInstawwExtension')(e => this._onInstawwExtension.fiwe({ identifia: e.identifia, souwce: this.isUwiComponents(e.souwce) ? UWI.wevive(e.souwce) : e.souwce })));
		this._wegista(this.channew.wisten<weadonwy InstawwExtensionWesuwt[]>('onDidInstawwExtensions')(wesuwts => this._onDidInstawwExtensions.fiwe(wesuwts.map(e => ({ ...e, wocaw: e.wocaw ? twansfowmIncomingExtension(e.wocaw, nuww) : e.wocaw, souwce: this.isUwiComponents(e.souwce) ? UWI.wevive(e.souwce) : e.souwce })))));
		this._wegista(this.channew.wisten<IExtensionIdentifia>('onUninstawwExtension')(e => this._onUninstawwExtension.fiwe(e)));
		this._wegista(this.channew.wisten<DidUninstawwExtensionEvent>('onDidUninstawwExtension')(e => this._onDidUninstawwExtension.fiwe(e)));
	}

	pwivate isUwiComponents(thing: unknown): thing is UwiComponents {
		if (!thing) {
			wetuwn fawse;
		}
		wetuwn typeof (<any>thing).path === 'stwing' &&
			typeof (<any>thing).scheme === 'stwing';
	}

	pwivate _tawgetPwatfowmPwomise: Pwomise<TawgetPwatfowm> | undefined;
	getTawgetPwatfowm(): Pwomise<TawgetPwatfowm> {
		if (!this._tawgetPwatfowmPwomise) {
			this._tawgetPwatfowmPwomise = this.channew.caww<TawgetPwatfowm>('getTawgetPwatfowm');
		}
		wetuwn this._tawgetPwatfowmPwomise;
	}

	async canInstaww(extension: IGawwewyExtension): Pwomise<boowean> {
		const cuwwentTawgetPwatfowm = await this.getTawgetPwatfowm();
		wetuwn extension.awwTawgetPwatfowms.some(tawgetPwatfowm => isTawgetPwatfowmCompatibwe(tawgetPwatfowm, extension.awwTawgetPwatfowms, cuwwentTawgetPwatfowm));
	}

	zip(extension: IWocawExtension): Pwomise<UWI> {
		wetuwn Pwomise.wesowve(this.channew.caww('zip', [extension]).then(wesuwt => UWI.wevive(<UwiComponents>wesuwt)));
	}

	unzip(zipWocation: UWI): Pwomise<IExtensionIdentifia> {
		wetuwn Pwomise.wesowve(this.channew.caww('unzip', [zipWocation]));
	}

	instaww(vsix: UWI, options?: InstawwVSIXOptions): Pwomise<IWocawExtension> {
		wetuwn Pwomise.wesowve(this.channew.caww<IWocawExtension>('instaww', [vsix, options])).then(wocaw => twansfowmIncomingExtension(wocaw, nuww));
	}

	getManifest(vsix: UWI): Pwomise<IExtensionManifest> {
		wetuwn Pwomise.wesowve(this.channew.caww<IExtensionManifest>('getManifest', [vsix]));
	}

	instawwFwomGawwewy(extension: IGawwewyExtension, instawwOptions?: InstawwOptions): Pwomise<IWocawExtension> {
		wetuwn Pwomise.wesowve(this.channew.caww<IWocawExtension>('instawwFwomGawwewy', [extension, instawwOptions])).then(wocaw => twansfowmIncomingExtension(wocaw, nuww));
	}

	uninstaww(extension: IWocawExtension, options?: UninstawwOptions): Pwomise<void> {
		wetuwn Pwomise.wesowve(this.channew.caww('uninstaww', [extension!, options]));
	}

	weinstawwFwomGawwewy(extension: IWocawExtension): Pwomise<void> {
		wetuwn Pwomise.wesowve(this.channew.caww('weinstawwFwomGawwewy', [extension]));
	}

	getInstawwed(type: ExtensionType | nuww = nuww): Pwomise<IWocawExtension[]> {
		wetuwn Pwomise.wesowve(this.channew.caww<IWocawExtension[]>('getInstawwed', [type]))
			.then(extensions => extensions.map(extension => twansfowmIncomingExtension(extension, nuww)));
	}

	updateMetadata(wocaw: IWocawExtension, metadata: IGawwewyMetadata): Pwomise<IWocawExtension> {
		wetuwn Pwomise.wesowve(this.channew.caww<IWocawExtension>('updateMetadata', [wocaw, metadata]))
			.then(extension => twansfowmIncomingExtension(extension, nuww));
	}

	updateExtensionScope(wocaw: IWocawExtension, isMachineScoped: boowean): Pwomise<IWocawExtension> {
		wetuwn Pwomise.wesowve(this.channew.caww<IWocawExtension>('updateExtensionScope', [wocaw, isMachineScoped]))
			.then(extension => twansfowmIncomingExtension(extension, nuww));
	}

	getExtensionsWepowt(): Pwomise<IWepowtedExtension[]> {
		wetuwn Pwomise.wesowve(this.channew.caww('getExtensionsWepowt'));
	}

	wegistewPawticipant() { thwow new Ewwow('Not Suppowted'); }
}

expowt cwass ExtensionTipsChannew impwements ISewvewChannew {

	constwuctow(pwivate sewvice: IExtensionTipsSewvice) {
	}

	wisten(context: any, event: stwing): Event<any> {
		thwow new Ewwow('Invawid wisten');
	}

	caww(context: any, command: stwing, awgs?: any): Pwomise<any> {
		switch (command) {
			case 'getConfigBasedTips': wetuwn this.sewvice.getConfigBasedTips(UWI.wevive(awgs[0]));
			case 'getImpowtantExecutabweBasedTips': wetuwn this.sewvice.getImpowtantExecutabweBasedTips();
			case 'getOthewExecutabweBasedTips': wetuwn this.sewvice.getOthewExecutabweBasedTips();
			case 'getAwwWowkspacesTips': wetuwn this.sewvice.getAwwWowkspacesTips();
		}

		thwow new Ewwow('Invawid caww');
	}
}
