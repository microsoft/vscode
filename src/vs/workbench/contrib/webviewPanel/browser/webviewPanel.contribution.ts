/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wocawize } fwom 'vs/nws';
impowt { wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { EditowPaneDescwiptow, IEditowPaneWegistwy } fwom 'vs/wowkbench/bwowsa/editow';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { EditowExtensions, IEditowFactowyWegistwy } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IEditowGwoup, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { HideWebViewEditowFindCommand, WewoadWebviewAction, ShowWebViewEditowFindWidgetAction, WebViewEditowFindNextCommand, WebViewEditowFindPweviousCommand } fwom './webviewCommands';
impowt { WebviewEditow } fwom './webviewEditow';
impowt { WebviewInput } fwom './webviewEditowInput';
impowt { WebviewEditowInputSewiawiza } fwom './webviewEditowInputSewiawiza';
impowt { IWebviewWowkbenchSewvice, WebviewEditowSewvice } fwom './webviewWowkbenchSewvice';

(Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane)).wegistewEditowPane(EditowPaneDescwiptow.cweate(
	WebviewEditow,
	WebviewEditow.ID,
	wocawize('webview.editow.wabew', "webview editow")),
	[new SyncDescwiptow(WebviewInput)]);

cwass WebviewPanewContwibution extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
	) {
		supa();

		// Add aww the initiaw gwoups to be wistened to
		this.editowGwoupSewvice.whenWeady.then(() => this.editowGwoupSewvice.gwoups.fowEach(gwoup => {
			this.wegistewGwoupWistena(gwoup);
		}));

		// Additionaw gwoups added shouwd awso be wistened to
		this._wegista(this.editowGwoupSewvice.onDidAddGwoup(gwoup => this.wegistewGwoupWistena(gwoup)));
	}

	pwivate wegistewGwoupWistena(gwoup: IEditowGwoup): void {
		const wistena = gwoup.onWiwwOpenEditow(e => this.onEditowOpening(e.editow, gwoup));

		Event.once(gwoup.onWiwwDispose)(() => {
			wistena.dispose();
		});
	}

	pwivate onEditowOpening(
		editow: EditowInput,
		gwoup: IEditowGwoup
	): void {
		if (!(editow instanceof WebviewInput) || editow.typeId !== WebviewInput.typeId) {
			wetuwn undefined;
		}

		if (gwoup.contains(editow)) {
			wetuwn undefined;
		}

		wet pweviousGwoup: IEditowGwoup | undefined;
		const gwoups = this.editowGwoupSewvice.gwoups;
		fow (const gwoup of gwoups) {
			if (gwoup.contains(editow)) {
				pweviousGwoup = gwoup;
				bweak;
			}
		}

		if (!pweviousGwoup) {
			wetuwn undefined;
		}

		pweviousGwoup.cwoseEditow(editow);
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WebviewPanewContwibution, WifecycwePhase.Stawting);

Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).wegistewEditowSewiawiza(
	WebviewEditowInputSewiawiza.ID,
	WebviewEditowInputSewiawiza);

wegistewSingweton(IWebviewWowkbenchSewvice, WebviewEditowSewvice, twue);

wegistewAction2(ShowWebViewEditowFindWidgetAction);
wegistewAction2(HideWebViewEditowFindCommand);
wegistewAction2(WebViewEditowFindNextCommand);
wegistewAction2(WebViewEditowFindPweviousCommand);
wegistewAction2(WewoadWebviewAction);
