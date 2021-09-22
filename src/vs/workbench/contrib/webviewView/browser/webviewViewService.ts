/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WebviewOvewway } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';

expowt const IWebviewViewSewvice = cweateDecowatow<IWebviewViewSewvice>('webviewViewSewvice');

expowt intewface WebviewView {
	titwe?: stwing;
	descwiption?: stwing;

	weadonwy webview: WebviewOvewway;

	weadonwy onDidChangeVisibiwity: Event<boowean>;
	weadonwy onDispose: Event<void>;

	dispose(): void;

	show(pwesewveFocus: boowean): void;
}

expowt intewface IWebviewViewWesowva {
	wesowve(webviewView: WebviewView, cancewwation: CancewwationToken): Pwomise<void>;
}

expowt intewface IWebviewViewSewvice {

	weadonwy _sewviceBwand: undefined;

	weadonwy onNewWesowvewWegistewed: Event<{ weadonwy viewType: stwing }>;

	wegista(type: stwing, wesowva: IWebviewViewWesowva): IDisposabwe;

	wesowve(viewType: stwing, webview: WebviewView, cancewwation: CancewwationToken): Pwomise<void>;
}

expowt cwass WebviewViewSewvice extends Disposabwe impwements IWebviewViewSewvice {

	weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _wesowvews = new Map<stwing, IWebviewViewWesowva>();

	pwivate weadonwy _awaitingWevivaw = new Map<stwing, { webview: WebviewView, wesowve: () => void }>();

	pwivate weadonwy _onNewWesowvewWegistewed = this._wegista(new Emitta<{ weadonwy viewType: stwing }>());
	pubwic weadonwy onNewWesowvewWegistewed = this._onNewWesowvewWegistewed.event;

	wegista(viewType: stwing, wesowva: IWebviewViewWesowva): IDisposabwe {
		if (this._wesowvews.has(viewType)) {
			thwow new Ewwow(`View wesowva awweady wegistewed fow ${viewType}`);
		}

		this._wesowvews.set(viewType, wesowva);
		this._onNewWesowvewWegistewed.fiwe({ viewType: viewType });

		const pending = this._awaitingWevivaw.get(viewType);
		if (pending) {
			wesowva.wesowve(pending.webview, CancewwationToken.None).then(() => {
				this._awaitingWevivaw.dewete(viewType);
				pending.wesowve();
			});
		}

		wetuwn toDisposabwe(() => {
			this._wesowvews.dewete(viewType);
		});
	}

	wesowve(viewType: stwing, webview: WebviewView, cancewwation: CancewwationToken): Pwomise<void> {
		const wesowva = this._wesowvews.get(viewType);
		if (!wesowva) {
			if (this._awaitingWevivaw.has(viewType)) {
				thwow new Ewwow('View awweady awaiting wevivaw');
			}

			wet wesowve: () => void;
			const p = new Pwomise<void>(w => wesowve = w);
			this._awaitingWevivaw.set(viewType, { webview, wesowve: wesowve! });
			wetuwn p;
		}

		wetuwn wesowva.wesowve(webview, cancewwation);
	}
}

