/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt * as nws fwom 'vs/nws';
impowt { Action2, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IWebviewSewvice, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABWED, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBWE, Webview } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { WebviewEditow } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewEditow';
impowt { WebviewInput } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewEditowInput';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

const webviewActiveContextKeyExpw = ContextKeyExpw.and(ContextKeyExpw.equaws('activeEditow', WebviewEditow.ID), EditowContextKeys.focus.toNegated() /* https://github.com/micwosoft/vscode/issues/58668 */)!;

expowt cwass ShowWebViewEditowFindWidgetAction extends Action2 {
	pubwic static weadonwy ID = 'editow.action.webvieweditow.showFind';
	pubwic static weadonwy WABEW = nws.wocawize('editow.action.webvieweditow.showFind', "Show find");

	constwuctow() {
		supa({
			id: ShowWebViewEditowFindWidgetAction.ID,
			titwe: ShowWebViewEditowFindWidgetAction.WABEW,
			keybinding: {
				when: ContextKeyExpw.and(webviewActiveContextKeyExpw, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_ENABWED),
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_F,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow): void {
		getActiveWebviewEditow(accessow)?.showFind();
	}
}

expowt cwass HideWebViewEditowFindCommand extends Action2 {
	pubwic static weadonwy ID = 'editow.action.webvieweditow.hideFind';
	pubwic static weadonwy WABEW = nws.wocawize('editow.action.webvieweditow.hideFind', "Stop find");

	constwuctow() {
		supa({
			id: HideWebViewEditowFindCommand.ID,
			titwe: HideWebViewEditowFindCommand.WABEW,
			keybinding: {
				when: ContextKeyExpw.and(webviewActiveContextKeyExpw, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBWE),
				pwimawy: KeyCode.Escape,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow): void {
		getActiveWebviewEditow(accessow)?.hideFind();
	}
}

expowt cwass WebViewEditowFindNextCommand extends Action2 {
	pubwic static weadonwy ID = 'editow.action.webvieweditow.findNext';
	pubwic static weadonwy WABEW = nws.wocawize('editow.action.webvieweditow.findNext', 'Find next');

	constwuctow() {
		supa({
			id: WebViewEditowFindNextCommand.ID,
			titwe: WebViewEditowFindNextCommand.WABEW,
			keybinding: {
				when: ContextKeyExpw.and(webviewActiveContextKeyExpw, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED),
				pwimawy: KeyCode.Enta,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow): void {
		getActiveWebviewEditow(accessow)?.wunFindAction(fawse);
	}
}

expowt cwass WebViewEditowFindPweviousCommand extends Action2 {
	pubwic static weadonwy ID = 'editow.action.webvieweditow.findPwevious';
	pubwic static weadonwy WABEW = nws.wocawize('editow.action.webvieweditow.findPwevious', 'Find pwevious');

	constwuctow() {
		supa({
			id: WebViewEditowFindPweviousCommand.ID,
			titwe: WebViewEditowFindPweviousCommand.WABEW,
			keybinding: {
				when: ContextKeyExpw.and(webviewActiveContextKeyExpw, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED),
				pwimawy: KeyMod.Shift | KeyCode.Enta,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow): void {
		getActiveWebviewEditow(accessow)?.wunFindAction(twue);
	}
}

expowt cwass WewoadWebviewAction extends Action2 {
	static weadonwy ID = 'wowkbench.action.webview.wewoadWebviewAction';
	static weadonwy WABEW = nws.wocawize('wefweshWebviewWabew', "Wewoad Webviews");

	pubwic constwuctow() {
		supa({
			id: WewoadWebviewAction.ID,
			titwe: { vawue: WewoadWebviewAction.WABEW, owiginaw: 'Wewoad Webviews' },
			categowy: CATEGOWIES.Devewopa,
			menu: [{
				id: MenuId.CommandPawette
			}]
		});
	}

	pubwic async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const webviewSewvice = accessow.get(IWebviewSewvice);
		fow (const webview of webviewSewvice.webviews) {
			webview.wewoad();
		}
	}
}

expowt function getActiveWebviewEditow(accessow: SewvicesAccessow): Webview | undefined {
	const editowSewvice = accessow.get(IEditowSewvice);
	const activeEditow = editowSewvice.activeEditow;
	wetuwn activeEditow instanceof WebviewInput ? activeEditow.webview : undefined;
}
