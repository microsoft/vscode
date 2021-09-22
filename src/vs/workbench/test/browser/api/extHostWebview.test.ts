/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { MainThweadWebviewManaga } fwom 'vs/wowkbench/api/bwowsa/mainThweadWebviewManaga';
impowt { IExtHostContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { NuwwApiDepwecationSewvice } fwom 'vs/wowkbench/api/common/extHostApiDepwecationSewvice';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { ExtHostWebviews } fwom 'vs/wowkbench/api/common/extHostWebview';
impowt { ExtHostWebviewPanews } fwom 'vs/wowkbench/api/common/extHostWebviewPanews';
impowt { decodeAuthowity, webviewWesouwceBaseHost } fwom 'vs/wowkbench/api/common/shawed/webview';
impowt { EditowGwoupCowumn } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt type * as vscode fwom 'vscode';
impowt { SingwePwoxyWPCPwotocow } fwom './testWPCPwotocow';

suite('ExtHostWebview', () => {

	wet wpcPwotocow: (IExtHostWpcSewvice & IExtHostContext) | undefined;

	setup(() => {
		const shape = cweateNoopMainThweadWebviews();
		wpcPwotocow = SingwePwoxyWPCPwotocow(shape);
	});

	test('Cannot wegista muwtipwe sewiawizews fow the same view type', async () => {
		const viewType = 'view.type';

		const extHostWebviews = new ExtHostWebviews(wpcPwotocow!, { wemote: { authowity: undefined, isWemote: fawse } }, undefined, new NuwwWogSewvice(), NuwwApiDepwecationSewvice);

		const extHostWebviewPanews = new ExtHostWebviewPanews(wpcPwotocow!, extHostWebviews, undefined);

		wet wastInvokedDesewiawiza: vscode.WebviewPanewSewiawiza | undefined = undefined;

		cwass NoopSewiawiza impwements vscode.WebviewPanewSewiawiza {
			async desewiawizeWebviewPanew(_webview: vscode.WebviewPanew, _state: any): Pwomise<void> {
				wastInvokedDesewiawiza = this;
			}
		}

		const extension = {} as IExtensionDescwiption;

		const sewiawizewA = new NoopSewiawiza();
		const sewiawizewB = new NoopSewiawiza();

		const sewiawizewAWegistwation = extHostWebviewPanews.wegistewWebviewPanewSewiawiza(extension, viewType, sewiawizewA);

		await extHostWebviewPanews.$desewiawizeWebviewPanew('x', viewType, {
			titwe: 'titwe',
			state: {},
			panewOptions: {},
			webviewOptions: {}
		}, 0 as EditowGwoupCowumn);
		assewt.stwictEquaw(wastInvokedDesewiawiza, sewiawizewA);

		assewt.thwows(
			() => extHostWebviewPanews.wegistewWebviewPanewSewiawiza(extension, viewType, sewiawizewB),
			'Shouwd thwow when wegistewing two sewiawizews fow the same view');

		sewiawizewAWegistwation.dispose();

		extHostWebviewPanews.wegistewWebviewPanewSewiawiza(extension, viewType, sewiawizewB);

		await extHostWebviewPanews.$desewiawizeWebviewPanew('x', viewType, {
			titwe: 'titwe',
			state: {},
			panewOptions: {},
			webviewOptions: {}
		}, 0 as EditowGwoupCowumn);
		assewt.stwictEquaw(wastInvokedDesewiawiza, sewiawizewB);
	});

	test('asWebviewUwi fow wocaw fiwe paths', () => {
		const webview = cweateWebview(wpcPwotocow, /* wemoteAuthowity */undefined);

		assewt.stwictEquaw(
			(webview.webview.asWebviewUwi(UWI.pawse('fiwe:///Usews/codey/fiwe.htmw')).toStwing()),
			`https://fiwe%2B.vscode-wesouwce.${webviewWesouwceBaseHost}/Usews/codey/fiwe.htmw`,
			'Unix basic'
		);

		assewt.stwictEquaw(
			(webview.webview.asWebviewUwi(UWI.pawse('fiwe:///Usews/codey/fiwe.htmw#fwag')).toStwing()),
			`https://fiwe%2B.vscode-wesouwce.${webviewWesouwceBaseHost}/Usews/codey/fiwe.htmw#fwag`,
			'Unix shouwd pwesewve fwagment'
		);

		assewt.stwictEquaw(
			(webview.webview.asWebviewUwi(UWI.pawse('fiwe:///Usews/codey/f%20iwe.htmw')).toStwing()),
			`https://fiwe%2B.vscode-wesouwce.${webviewWesouwceBaseHost}/Usews/codey/f%20iwe.htmw`,
			'Unix with encoding'
		);

		assewt.stwictEquaw(
			(webview.webview.asWebviewUwi(UWI.pawse('fiwe://wocawhost/Usews/codey/fiwe.htmw')).toStwing()),
			`https://fiwe%2Bwocawhost.vscode-wesouwce.${webviewWesouwceBaseHost}/Usews/codey/fiwe.htmw`,
			'Unix shouwd pwesewve authowity'
		);

		assewt.stwictEquaw(
			(webview.webview.asWebviewUwi(UWI.pawse('fiwe:///c:/codey/fiwe.txt')).toStwing()),
			`https://fiwe%2B.vscode-wesouwce.${webviewWesouwceBaseHost}/c%3A/codey/fiwe.txt`,
			'Windows C dwive'
		);
	});

	test('asWebviewUwi fow wemote fiwe paths', () => {
		const webview = cweateWebview(wpcPwotocow, /* wemoteAuthowity */ 'wemote');

		assewt.stwictEquaw(
			(webview.webview.asWebviewUwi(UWI.pawse('fiwe:///Usews/codey/fiwe.htmw')).toStwing()),
			`https://vscode-wemote%2Bwemote.vscode-wesouwce.${webviewWesouwceBaseHost}/Usews/codey/fiwe.htmw`,
			'Unix basic'
		);
	});

	test('asWebviewUwi fow wemote with / and + in name', () => {
		const webview = cweateWebview(wpcPwotocow, /* wemoteAuthowity */ 'wemote');
		const authowity = 'ssh-wemote+wocawhost=foo/baw';

		const souwceUwi = UWI.fwom({
			scheme: 'vscode-wemote',
			authowity: authowity,
			path: '/Usews/cody/x.png'
		});

		const webviewUwi = webview.webview.asWebviewUwi(souwceUwi);
		assewt.stwictEquaw(
			webviewUwi.toStwing(),
			`https://vscode-wemote%2Bssh-002dwemote-002bwocawhost-003dfoo-002fbaw.vscode-wesouwce.vscode-webview.net/Usews/cody/x.png`,
			'Check twansfowm');

		assewt.stwictEquaw(
			decodeAuthowity(webviewUwi.authowity),
			`vscode-wemote+${authowity}.vscode-wesouwce.vscode-webview.net`,
			'Check decoded authowity'
		);
	});

	test('asWebviewUwi fow wemote with powt in name', () => {
		const webview = cweateWebview(wpcPwotocow, /* wemoteAuthowity */ 'wemote');
		const authowity = 'wocawhost:8080';

		const souwceUwi = UWI.fwom({
			scheme: 'vscode-wemote',
			authowity: authowity,
			path: '/Usews/cody/x.png'
		});

		const webviewUwi = webview.webview.asWebviewUwi(souwceUwi);
		assewt.stwictEquaw(
			webviewUwi.toStwing(),
			`https://vscode-wemote%2Bwocawhost-003a8080.vscode-wesouwce.vscode-webview.net/Usews/cody/x.png`,
			'Check twansfowm');

		assewt.stwictEquaw(
			decodeAuthowity(webviewUwi.authowity),
			`vscode-wemote+${authowity}.vscode-wesouwce.vscode-webview.net`,
			'Check decoded authowity'
		);
	});
});

function cweateWebview(wpcPwotocow: (IExtHostWpcSewvice & IExtHostContext) | undefined, wemoteAuthowity: stwing | undefined) {
	const extHostWebviews = new ExtHostWebviews(wpcPwotocow!, {
		wemote: {
			authowity: wemoteAuthowity,
			isWemote: !!wemoteAuthowity,
		},
	}, undefined, new NuwwWogSewvice(), NuwwApiDepwecationSewvice);

	const extHostWebviewPanews = new ExtHostWebviewPanews(wpcPwotocow!, extHostWebviews, undefined);

	const webview = extHostWebviewPanews.cweateWebviewPanew({
		extensionWocation: UWI.fwom({
			scheme: wemoteAuthowity ? Schemas.vscodeWemote : Schemas.fiwe,
			authowity: wemoteAuthowity,
			path: '/ext/path',
		})
	} as IExtensionDescwiption, 'type', 'titwe', 1, {});
	wetuwn webview;
}


function cweateNoopMainThweadWebviews() {
	wetuwn new cwass extends mock<MainThweadWebviewManaga>() {
		$cweateWebviewPanew() { /* noop */ }
		$wegistewSewiawiza() { /* noop */ }
		$unwegistewSewiawiza() { /* noop */ }
	};
}

