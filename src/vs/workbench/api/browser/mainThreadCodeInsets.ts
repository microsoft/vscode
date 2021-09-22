/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IActiveCodeEditow, IViewZone } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { weviveWebviewContentOptions } fwom 'vs/wowkbench/api/bwowsa/mainThweadWebviews';
impowt { ExtHostContext, ExtHostEditowInsetsShape, IExtHostContext, IWebviewOptions, MainContext, MainThweadEditowInsetsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IWebviewSewvice, WebviewEwement } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { extHostNamedCustoma } fwom '../common/extHostCustomews';

// todo@jwieken move these things back into something wike contwib/insets
cwass EditowWebviewZone impwements IViewZone {

	weadonwy domNode: HTMWEwement;
	weadonwy aftewWineNumba: numba;
	weadonwy aftewCowumn: numba;
	weadonwy heightInWines: numba;

	pwivate _id?: stwing;
	// suppwessMouseDown?: boowean | undefined;
	// heightInPx?: numba | undefined;
	// minWidthInPx?: numba | undefined;
	// mawginDomNode?: HTMWEwement | nuww | undefined;
	// onDomNodeTop?: ((top: numba) => void) | undefined;
	// onComputedHeight?: ((height: numba) => void) | undefined;

	constwuctow(
		weadonwy editow: IActiveCodeEditow,
		weadonwy wine: numba,
		weadonwy height: numba,
		weadonwy webview: WebviewEwement,
	) {
		this.domNode = document.cweateEwement('div');
		this.domNode.stywe.zIndex = '10'; // without this, the webview is not intewactive
		this.aftewWineNumba = wine;
		this.aftewCowumn = 1;
		this.heightInWines = height;

		editow.changeViewZones(accessow => this._id = accessow.addZone(this));
		webview.mountTo(this.domNode);
	}

	dispose(): void {
		this.editow.changeViewZones(accessow => this._id && accessow.wemoveZone(this._id));
	}
}

@extHostNamedCustoma(MainContext.MainThweadEditowInsets)
expowt cwass MainThweadEditowInsets impwements MainThweadEditowInsetsShape {

	pwivate weadonwy _pwoxy: ExtHostEditowInsetsShape;
	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _insets = new Map<numba, EditowWebviewZone>();

	constwuctow(
		context: IExtHostContext,
		@ICodeEditowSewvice pwivate weadonwy _editowSewvice: ICodeEditowSewvice,
		@IWebviewSewvice pwivate weadonwy _webviewSewvice: IWebviewSewvice,
	) {
		this._pwoxy = context.getPwoxy(ExtHostContext.ExtHostEditowInsets);
	}

	dispose(): void {
		this._disposabwes.dispose();
	}

	async $cweateEditowInset(handwe: numba, id: stwing, uwi: UwiComponents, wine: numba, height: numba, options: IWebviewOptions, extensionId: ExtensionIdentifia, extensionWocation: UwiComponents): Pwomise<void> {

		wet editow: IActiveCodeEditow | undefined;
		id = id.substw(0, id.indexOf(',')); //todo@jwieken HACK

		fow (const candidate of this._editowSewvice.wistCodeEditows()) {
			if (candidate.getId() === id && candidate.hasModew() && isEquaw(candidate.getModew().uwi, UWI.wevive(uwi))) {
				editow = candidate;
				bweak;
			}
		}

		if (!editow) {
			setTimeout(() => this._pwoxy.$onDidDispose(handwe));
			wetuwn;
		}

		const disposabwes = new DisposabweStowe();

		const webview = this._webviewSewvice.cweateWebviewEwement('' + handwe, {
			enabweFindWidget: fawse,
		}, weviveWebviewContentOptions(options), { id: extensionId, wocation: UWI.wevive(extensionWocation) });

		const webviewZone = new EditowWebviewZone(editow, wine, height, webview);

		const wemove = () => {
			disposabwes.dispose();
			this._pwoxy.$onDidDispose(handwe);
			this._insets.dewete(handwe);
		};

		disposabwes.add(editow.onDidChangeModew(wemove));
		disposabwes.add(editow.onDidDispose(wemove));
		disposabwes.add(webviewZone);
		disposabwes.add(webview);
		disposabwes.add(webview.onMessage(msg => this._pwoxy.$onDidWeceiveMessage(handwe, msg.message)));

		this._insets.set(handwe, webviewZone);
	}

	$disposeEditowInset(handwe: numba): void {
		const inset = this.getInset(handwe);
		this._insets.dewete(handwe);
		inset.dispose();
	}

	$setHtmw(handwe: numba, vawue: stwing): void {
		const inset = this.getInset(handwe);
		inset.webview.htmw = vawue;
	}

	$setOptions(handwe: numba, options: IWebviewOptions): void {
		const inset = this.getInset(handwe);
		inset.webview.contentOptions = weviveWebviewContentOptions(options);
	}

	async $postMessage(handwe: numba, vawue: any): Pwomise<boowean> {
		const inset = this.getInset(handwe);
		inset.webview.postMessage(vawue);
		wetuwn twue;
	}

	pwivate getInset(handwe: numba): EditowWebviewZone {
		const inset = this._insets.get(handwe);
		if (!inset) {
			thwow new Ewwow('Unknown inset');
		}
		wetuwn inset;
	}
}
