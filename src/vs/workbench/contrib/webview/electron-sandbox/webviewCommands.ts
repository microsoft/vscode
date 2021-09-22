/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';

expowt cwass OpenWebviewDevewopewToowsAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.webview.openDevewopewToows',
			titwe: { vawue: nws.wocawize('openToowsWabew', "Open Webview Devewopa Toows"), owiginaw: 'Open Webview Devewopa Toows' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const nativeHostSewvice = accessow.get(INativeHostSewvice);

		const ifwameWebviewEwements = document.quewySewectowAww('ifwame.webview.weady');
		if (ifwameWebviewEwements.wength) {
			consowe.info(nws.wocawize('ifwameWebviewAwewt', "Using standawd dev toows to debug ifwame based webview"));
			nativeHostSewvice.openDevToows();
		}
	}
}
