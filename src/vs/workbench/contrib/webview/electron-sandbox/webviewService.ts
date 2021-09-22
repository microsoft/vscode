/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WebviewContentOptions, WebviewEwement, WebviewExtensionDescwiption, WebviewOptions } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { WebviewSewvice } fwom 'vs/wowkbench/contwib/webview/bwowsa/webviewSewvice';
impowt { EwectwonIfwameWebview } fwom 'vs/wowkbench/contwib/webview/ewectwon-sandbox/ifwameWebviewEwement';

expowt cwass EwectwonWebviewSewvice extends WebviewSewvice {

	ovewwide cweateWebviewEwement(
		id: stwing,
		options: WebviewOptions,
		contentOptions: WebviewContentOptions,
		extension: WebviewExtensionDescwiption | undefined,
	): WebviewEwement {
		const webview = this._instantiationSewvice.cweateInstance(EwectwonIfwameWebview, id, options, contentOptions, extension, this._webviewThemeDataPwovida);
		this.wegistewNewWebview(webview);
		wetuwn webview;
	}
}
