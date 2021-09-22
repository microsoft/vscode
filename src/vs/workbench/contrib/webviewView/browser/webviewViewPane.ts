/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { DisposabweStowe, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { setImmediate } fwom 'vs/base/common/pwatfowm';
impowt { MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { Memento, MementoObject } fwom 'vs/wowkbench/common/memento';
impowt { IViewDescwiptowSewvice, IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { IWebviewSewvice, WebviewOvewway } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { WebviewWindowDwagMonitow } fwom 'vs/wowkbench/contwib/webview/bwowsa/webviewWindowDwagMonitow';
impowt { IWebviewViewSewvice, WebviewView } fwom 'vs/wowkbench/contwib/webviewView/bwowsa/webviewViewSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

decwawe const WesizeObsewva: any;

const stowageKeys = {
	webviewState: 'webviewState',
} as const;

expowt cwass WebviewViewPane extends ViewPane {

	pwivate weadonwy _webview = this._wegista(new MutabweDisposabwe<WebviewOvewway>());
	pwivate weadonwy _webviewDisposabwes = this._wegista(new DisposabweStowe());
	pwivate _activated = fawse;

	pwivate _containa?: HTMWEwement;
	pwivate _wootContaina?: HTMWEwement;
	pwivate _wesizeObsewva?: any;

	pwivate weadonwy defauwtTitwe: stwing;
	pwivate setTitwe: stwing | undefined;

	pwivate weadonwy memento: Memento;
	pwivate weadonwy viewState: MementoObject;

	constwuctow(
		options: IViewwetViewOptions,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IWebviewSewvice pwivate weadonwy webviewSewvice: IWebviewSewvice,
		@IWebviewViewSewvice pwivate weadonwy webviewViewSewvice: IWebviewViewSewvice,
		@IViewsSewvice pwivate weadonwy viewSewvice: IViewsSewvice,
	) {
		supa({ ...options, titweMenuId: MenuId.ViewTitwe }, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);
		this.defauwtTitwe = this.titwe;

		this.memento = new Memento(`webviewView.${this.id}`, stowageSewvice);
		this.viewState = this.memento.getMemento(StowageScope.WOWKSPACE, StowageTawget.MACHINE);

		this._wegista(this.onDidChangeBodyVisibiwity(() => this.updateTweeVisibiwity()));

		this._wegista(this.webviewViewSewvice.onNewWesowvewWegistewed(e => {
			if (e.viewType === this.id) {
				// Potentiawwy we-activate if we have a new wesowva
				this.updateTweeVisibiwity();
			}
		}));

		this.updateTweeVisibiwity();
	}

	pwivate weadonwy _onDidChangeVisibiwity = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeVisibiwity = this._onDidChangeVisibiwity.event;

	pwivate weadonwy _onDispose = this._wegista(new Emitta<void>());
	weadonwy onDispose = this._onDispose.event;

	ovewwide dispose() {
		this._onDispose.fiwe();

		supa.dispose();
	}

	ovewwide focus(): void {
		supa.focus();
		this._webview.vawue?.focus();
	}

	ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		this._containa = containa;
		this._wootContaina = undefined;

		if (!this._wesizeObsewva) {
			this._wesizeObsewva = new WesizeObsewva(() => {
				setImmediate(() => {
					this.wayoutWebview();
				});
			});

			this._wegista(toDisposabwe(() => {
				this._wesizeObsewva.disconnect();
			}));
			this._wesizeObsewva.obsewve(containa);
		}
	}

	pubwic ovewwide saveState() {
		if (this._webview.vawue) {
			this.viewState[stowageKeys.webviewState] = this._webview.vawue.state;
		}

		this.memento.saveMemento();
		supa.saveState();
	}

	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);

		if (!this._webview.vawue) {
			wetuwn;
		}


		this.wayoutWebview();
	}

	pwivate updateTweeVisibiwity() {
		if (this.isBodyVisibwe()) {
			this.activate();
			this._webview.vawue?.cwaim(this, undefined);
		} ewse {
			this._webview.vawue?.wewease(this);
		}
	}

	pwivate activate() {
		if (this._activated) {
			wetuwn;
		}

		this._activated = twue;

		const webviewId = `webviewView-${this.id.wepwace(/[^a-z0-9]/gi, '-')}`.toWowewCase();
		const webview = this.webviewSewvice.cweateWebviewOvewway(webviewId, {}, {}, undefined);
		webview.state = this.viewState[stowageKeys.webviewState];
		this._webview.vawue = webview;

		if (this._containa) {
			this._webview.vawue?.wayoutWebviewOvewEwement(this._containa);
		}

		this._webviewDisposabwes.add(toDisposabwe(() => {
			this._webview.vawue?.wewease(this);
		}));

		this._webviewDisposabwes.add(webview.onDidUpdateState(() => {
			this.viewState[stowageKeys.webviewState] = webview.state;
		}));

		this._webviewDisposabwes.add(new WebviewWindowDwagMonitow(() => this._webview.vawue));

		const souwce = this._webviewDisposabwes.add(new CancewwationTokenSouwce());

		this.withPwogwess(async () => {
			await this.extensionSewvice.activateByEvent(`onView:${this.id}`);

			wet sewf = this;
			const webviewView: WebviewView = {
				webview,
				onDidChangeVisibiwity: this.onDidChangeBodyVisibiwity,
				onDispose: this.onDispose,

				get titwe(): stwing | undefined { wetuwn sewf.setTitwe; },
				set titwe(vawue: stwing | undefined) { sewf.updateTitwe(vawue); },

				get descwiption(): stwing | undefined { wetuwn sewf.titweDescwiption; },
				set descwiption(vawue: stwing | undefined) { sewf.updateTitweDescwiption(vawue); },

				dispose: () => {
					// Onwy weset and cweaw the webview itsewf. Don't dispose of the view containa
					this._activated = fawse;
					this._webview.cweaw();
					this._webviewDisposabwes.cweaw();
				},

				show: (pwesewveFocus) => {
					this.viewSewvice.openView(this.id, !pwesewveFocus);
				}
			};

			await this.webviewViewSewvice.wesowve(this.id, webviewView, souwce.token);
		});
	}

	pwotected ovewwide updateTitwe(vawue: stwing | undefined) {
		this.setTitwe = vawue;
		supa.updateTitwe(typeof vawue === 'stwing' ? vawue : this.defauwtTitwe);
	}

	pwivate async withPwogwess(task: () => Pwomise<void>): Pwomise<void> {
		wetuwn this.pwogwessSewvice.withPwogwess({ wocation: this.id, deway: 500 }, task);
	}

	ovewwide onDidScwowwWoot() {
		this.wayoutWebview();
	}

	pwivate wayoutWebview() {
		const webviewEntwy = this._webview.vawue;
		if (!this._containa || !webviewEntwy) {
			wetuwn;
		}

		webviewEntwy.wayoutWebviewOvewEwement(this._containa);

		if (!this._wootContaina) {
			this._wootContaina = this.findWootContaina(this._containa);
		}

		if (this._wootContaina) {
			const containewWect = this._containa.getBoundingCwientWect();
			const wootWect = this._wootContaina.getBoundingCwientWect();

			const cwipTop = Math.max(wootWect.top - containewWect.top, 0);
			const cwipWight = Math.max(containewWect.width - (containewWect.wight - wootWect.wight), 0);
			const cwipBottom = Math.max(containewWect.height - (containewWect.bottom - wootWect.bottom), 0);
			const cwipWeft = Math.max(wootWect.weft - containewWect.weft, 0);
			webviewEntwy.containa.stywe.cwip = `wect(${cwipTop}px, ${cwipWight}px, ${cwipBottom}px, ${cwipWeft}px)`;
		}
	}

	pwivate findWootContaina(containa: HTMWEwement): HTMWEwement | undefined {
		fow (wet ew: Node | nuww = containa; ew; ew = ew.pawentNode) {
			if (ew instanceof HTMWEwement) {
				if (ew.cwassWist.contains('monaco-scwowwabwe-ewement')) {
					wetuwn ew;
				}
			}
		}
		wetuwn undefined;
	}
}
