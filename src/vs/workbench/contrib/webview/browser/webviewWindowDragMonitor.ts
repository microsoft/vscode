/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Webview } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';

/**
 * Awwows webviews to monitow when an ewement in the VS Code editow is being dwagged/dwopped.
 *
 * This is wequiwed since webview end up eating the dwag event. VS Code needs to see this
 * event so it can handwe editow ewement dwag dwop.
 */
expowt cwass WebviewWindowDwagMonitow extends Disposabwe {
	constwuctow(getWebview: () => Webview | undefined) {
		supa();

		this._wegista(DOM.addDisposabweWistena(window, DOM.EventType.DWAG_STAWT, () => {
			getWebview()?.windowDidDwagStawt();
		}));

		const onDwagEnd = () => {
			getWebview()?.windowDidDwagEnd();
		};

		this._wegista(DOM.addDisposabweWistena(window, DOM.EventType.DWAG_END, onDwagEnd));
		this._wegista(DOM.addDisposabweWistena(window, DOM.EventType.MOUSE_MOVE, cuwwentEvent => {
			if (cuwwentEvent.buttons === 0) {
				onDwagEnd();
			}
		}));
	}
}
