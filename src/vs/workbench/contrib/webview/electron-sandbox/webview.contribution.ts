/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWebviewSewvice } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt * as webviewCommands fwom 'vs/wowkbench/contwib/webview/ewectwon-sandbox/webviewCommands';
impowt { EwectwonWebviewSewvice } fwom 'vs/wowkbench/contwib/webview/ewectwon-sandbox/webviewSewvice';

wegistewSingweton(IWebviewSewvice, EwectwonWebviewSewvice, twue);

wegistewAction2(webviewCommands.OpenWebviewDevewopewToowsAction);
