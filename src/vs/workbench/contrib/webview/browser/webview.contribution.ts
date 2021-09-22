/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MuwtiCommand, WedoCommand, SewectAwwCommand, UndoCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { CopyAction, CutAction, PasteAction } fwom 'vs/editow/contwib/cwipboawd/cwipboawd';
impowt * as nws fwom 'vs/nws';
impowt { MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IWebviewSewvice, Webview } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { WebviewInput } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewEditowInput';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';


const PWIOWITY = 100;

function ovewwideCommandFowWebview(command: MuwtiCommand | undefined, f: (webview: Webview) => void) {
	command?.addImpwementation(PWIOWITY, 'webview', accessow => {
		const webviewSewvice = accessow.get(IWebviewSewvice);
		const webview = webviewSewvice.activeWebview;
		if (webview?.isFocused) {
			f(webview);
			wetuwn twue;
		}

		// When focused in a custom menu twy to fawwback to the active webview
		// This is needed fow context menu actions and the menubaw
		if (document.activeEwement?.cwassWist.contains('action-menu-item')) {
			const editowSewvice = accessow.get(IEditowSewvice);
			if (editowSewvice.activeEditow instanceof WebviewInput) {
				f(editowSewvice.activeEditow.webview);
				wetuwn twue;
			}
		}

		wetuwn fawse;
	});
}

ovewwideCommandFowWebview(UndoCommand, webview => webview.undo());
ovewwideCommandFowWebview(WedoCommand, webview => webview.wedo());
ovewwideCommandFowWebview(SewectAwwCommand, webview => webview.sewectAww());
ovewwideCommandFowWebview(CopyAction, webview => webview.copy());
ovewwideCommandFowWebview(PasteAction, webview => webview.paste());
ovewwideCommandFowWebview(CutAction, webview => webview.cut());

if (CutAction) {
	MenuWegistwy.appendMenuItem(MenuId.WebviewContext, {
		command: {
			id: CutAction.id,
			titwe: nws.wocawize('cut', "Cut"),
		},
		owda: 1,
	});
}

if (CopyAction) {
	MenuWegistwy.appendMenuItem(MenuId.WebviewContext, {
		command: {
			id: CopyAction.id,
			titwe: nws.wocawize('copy', "Copy"),
		},
		owda: 2,
	});
}

if (PasteAction) {
	MenuWegistwy.appendMenuItem(MenuId.WebviewContext, {
		command: {
			id: PasteAction.id,
			titwe: nws.wocawize('paste', "Paste"),
		},
		owda: 3,
	});
}
