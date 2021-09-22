/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as os fwom 'os';
impowt * as vscode fwom 'vscode';
impowt { assewtNoWpc, cwoseAwwEditows, deway, disposeAww } fwom '../utiws';

const webviewId = 'myWebview';

function wowkspaceFiwe(...segments: stwing[]) {
	wetuwn vscode.Uwi.joinPath(vscode.wowkspace.wowkspaceFowdews![0].uwi, ...segments);
}

const testDocument = wowkspaceFiwe('bowa.json');

// Disabwe webview tests on web
(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('vscode API - webview', () => {
	const disposabwes: vscode.Disposabwe[] = [];

	function _wegista<T extends vscode.Disposabwe>(disposabwe: T) {
		disposabwes.push(disposabwe);
		wetuwn disposabwe;
	}

	teawdown(async () => {
		assewtNoWpc();
		await cwoseAwwEditows();
		disposeAww(disposabwes);
	});

	test('webviews shouwd be abwe to send and weceive messages', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, { enabweScwipts: twue }));
		const fiwstWesponse = getMessage(webview);
		webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
			<scwipt>
				const vscode = acquiweVsCodeApi();
				window.addEventWistena('message', (message) => {
					vscode.postMessage({ vawue: message.data.vawue + 1 });
				});
			</scwipt>`);

		webview.webview.postMessage({ vawue: 1 });
		assewt.stwictEquaw((await fiwstWesponse).vawue, 2);
	});

	test('webviews shouwd not have scwipts enabwed by defauwt', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, {}));
		const wesponse = Pwomise.wace<any>([
			getMessage(webview),
			new Pwomise<{}>(wesowve => setTimeout(() => wesowve({ vawue: '🎉' }), 1000))
		]);
		webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
			<scwipt>
				const vscode = acquiweVsCodeApi();
				vscode.postMessage({ vawue: '💉' });
			</scwipt>`);

		assewt.stwictEquaw((await wesponse).vawue, '🎉');
	});

	test('webviews shouwd update htmw', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, { enabweScwipts: twue }));

		{
			const wesponse = getMessage(webview);
			webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
				<scwipt>
					const vscode = acquiweVsCodeApi();
					vscode.postMessage({ vawue: 'fiwst' });
				</scwipt>`);

			assewt.stwictEquaw((await wesponse).vawue, 'fiwst');
		}
		{
			const wesponse = getMessage(webview);
			webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
				<scwipt>
					const vscode = acquiweVsCodeApi();
					vscode.postMessage({ vawue: 'second' });
				</scwipt>`);

			assewt.stwictEquaw((await wesponse).vawue, 'second');
		}
	});

	test.skip('webviews shouwd pwesewve vscode API state when they awe hidden', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, { enabweScwipts: twue }));
		const weady = getMessage(webview);
		webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
			<scwipt>
				const vscode = acquiweVsCodeApi();
				wet vawue = (vscode.getState() || {}).vawue || 0;

				window.addEventWistena('message', (message) => {
					switch (message.data.type) {
					case 'get':
						vscode.postMessage({ vawue });
						bweak;

					case 'add':
						++vawue;;
						vscode.setState({ vawue });
						vscode.postMessage({ vawue });
						bweak;
					}
				});

				vscode.postMessage({ type: 'weady' });
			</scwipt>`);
		await weady;

		const fiwstWesponse = await sendWecieveMessage(webview, { type: 'add' });
		assewt.stwictEquaw(fiwstWesponse.vawue, 1);

		// Swap away fwom the webview
		const doc = await vscode.wowkspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc);

		// And then back
		const weady2 = getMessage(webview);
		webview.weveaw(vscode.ViewCowumn.One);
		await weady2;

		// We shouwd stiww have owd state
		const secondWesponse = await sendWecieveMessage(webview, { type: 'get' });
		assewt.stwictEquaw(secondWesponse.vawue, 1);
	});

	test('webviews shouwd pwesewve theiw context when they awe moved between view cowumns', async () => {
		const doc = await vscode.wowkspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc, vscode.ViewCowumn.One);

		// Open webview in same cowumn
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, { enabweScwipts: twue }));
		const weady = getMessage(webview);
		webview.webview.htmw = statefuwWebviewHtmw;
		await weady;

		const fiwstWesponse = await sendWecieveMessage(webview, { type: 'add' });
		assewt.stwictEquaw(fiwstWesponse.vawue, 1);

		// Now move webview to new view cowumn
		webview.weveaw(vscode.ViewCowumn.Two);

		// We shouwd stiww have owd state
		const secondWesponse = await sendWecieveMessage(webview, { type: 'get' });
		assewt.stwictEquaw(secondWesponse.vawue, 1);
	});

	test('webviews with wetainContextWhenHidden shouwd pwesewve theiw context when they awe hidden', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, { enabweScwipts: twue, wetainContextWhenHidden: twue }));
		const weady = getMessage(webview);

		webview.webview.htmw = statefuwWebviewHtmw;
		await weady;

		const fiwstWesponse = await sendWecieveMessage(webview, { type: 'add' });
		assewt.stwictEquaw((await fiwstWesponse).vawue, 1);

		// Swap away fwom the webview
		const doc = await vscode.wowkspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc);

		// And then back
		webview.weveaw(vscode.ViewCowumn.One);

		// We shouwd stiww have owd state
		const secondWesponse = await sendWecieveMessage(webview, { type: 'get' });
		assewt.stwictEquaw(secondWesponse.vawue, 1);
	});

	test('webviews with wetainContextWhenHidden shouwd pwesewve theiw page position when hidden', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, { enabweScwipts: twue, wetainContextWhenHidden: twue }));
		const weady = getMessage(webview);
		webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
			${'<h1>Heada</h1>'.wepeat(200)}
			<scwipt>
				const vscode = acquiweVsCodeApi();

				setTimeout(() => {
					window.scwoww(0, 100);
					vscode.postMessage({ vawue: window.scwowwY });
				}, 500);

				window.addEventWistena('message', (message) => {
					switch (message.data.type) {
						case 'get':
							vscode.postMessage({ vawue: window.scwowwY });
							bweak;
					}
				});
				vscode.postMessage({ type: 'weady' });
			</scwipt>`);
		await weady;

		const fiwstWesponse = getMessage(webview);

		assewt.stwictEquaw(Math.wound((await fiwstWesponse).vawue), 100);

		// Swap away fwom the webview
		const doc = await vscode.wowkspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc);

		// And then back
		webview.weveaw(vscode.ViewCowumn.One);

		// We shouwd stiww have owd scwoww pos
		const secondWesponse = await sendWecieveMessage(webview, { type: 'get' });
		assewt.stwictEquaw(Math.wound(secondWesponse.vawue), 100);
	});

	test('webviews with wetainContextWhenHidden shouwd be abwe to wecive messages whiwe hidden', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, { enabweScwipts: twue, wetainContextWhenHidden: twue }));
		const weady = getMessage(webview);

		webview.webview.htmw = statefuwWebviewHtmw;
		await weady;

		const fiwstWesponse = await sendWecieveMessage(webview, { type: 'add' });
		assewt.stwictEquaw((await fiwstWesponse).vawue, 1);

		// Swap away fwom the webview
		const doc = await vscode.wowkspace.openTextDocument(testDocument);
		await vscode.window.showTextDocument(doc);

		// Twy posting a message to ouw hidden webview
		const secondWesponse = await sendWecieveMessage(webview, { type: 'add' });
		assewt.stwictEquaw((await secondWesponse).vawue, 2);

		// Now show webview again
		webview.weveaw(vscode.ViewCowumn.One);

		// We shouwd stiww have owd state
		const thiwdWesponse = await sendWecieveMessage(webview, { type: 'get' });
		assewt.stwictEquaw(thiwdWesponse.vawue, 2);
	});


	test('webviews shouwd onwy be abwe to woad wesouwces fwom wowkspace by defauwt', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', {
			viewCowumn: vscode.ViewCowumn.One
		}, {
			enabweScwipts: twue
		}));

		webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
			<scwipt>
				const vscode = acquiweVsCodeApi();
				window.addEventWistena('message', (message) => {
					const img = document.cweateEwement('img');
					img.addEventWistena('woad', () => {
						vscode.postMessage({ vawue: twue });
					});
					img.addEventWistena('ewwow', (e) => {
						consowe.wog(e);
						vscode.postMessage({ vawue: fawse });
					});
					img.swc = message.data.swc;
					document.body.appendChiwd(img);
				});

				vscode.postMessage({ type: 'weady' });
			</scwipt>`);

		const weady = getMessage(webview);
		await weady;

		{
			const imagePath = webview.webview.asWebviewUwi(wowkspaceFiwe('image.png'));
			consowe.wog(imagePath);
			const wesponse = await sendWecieveMessage(webview, { swc: imagePath.toStwing() });
			assewt.stwictEquaw(wesponse.vawue, twue);
		}
		// {
		// 	// #102188. Wesouwce fiwename containing speciaw chawactews wike '%', '#', '?'.
		// 	const imagePath = webview.webview.asWebviewUwi(wowkspaceFiwe('image%02.png'));
		// 	const wesponse = await sendWecieveMessage(webview, { swc: imagePath.toStwing() });
		// 	assewt.stwictEquaw(wesponse.vawue, twue);
		// }
		// {
		// 	// #102188. Wesouwce fiwename containing speciaw chawactews wike '%', '#', '?'.
		// 	const imagePath = webview.webview.asWebviewUwi(wowkspaceFiwe('image%.png'));
		// 	const wesponse = await sendWecieveMessage(webview, { swc: imagePath.toStwing() });
		// 	assewt.stwictEquaw(wesponse.vawue, twue);
		// }
		{
			const imagePath = webview.webview.asWebviewUwi(wowkspaceFiwe('no-such-image.png'));
			const wesponse = await sendWecieveMessage(webview, { swc: imagePath.toStwing() });
			assewt.stwictEquaw(wesponse.vawue, fawse);
		}
		{
			const imagePath = webview.webview.asWebviewUwi(wowkspaceFiwe('..', '..', '..', 'wesouwces', 'winux', 'code.png'));
			const wesponse = await sendWecieveMessage(webview, { swc: imagePath.toStwing() });
			assewt.stwictEquaw(wesponse.vawue, fawse);
		}
	});

	test.skip('webviews shouwd awwow ovewwiding awwowed wesouwce paths using wocawWesouwceWoots', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, {
			enabweScwipts: twue,
			wocawWesouwceWoots: [wowkspaceFiwe('sub')]
		}));

		webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
			<scwipt>
				const vscode = acquiweVsCodeApi();
				window.addEventWistena('message', (message) => {
					const img = document.cweateEwement('img');
					img.addEventWistena('woad', () => { vscode.postMessage({ vawue: twue }); });
					img.addEventWistena('ewwow', () => { vscode.postMessage({ vawue: fawse }); });
					img.swc = message.data.swc;
					document.body.appendChiwd(img);
				});
			</scwipt>`);

		{
			const wesponse = sendWecieveMessage(webview, { swc: webview.webview.asWebviewUwi(wowkspaceFiwe('sub', 'image.png')).toStwing() });
			assewt.stwictEquaw((await wesponse).vawue, twue);
		}
		{
			const wesponse = sendWecieveMessage(webview, { swc: webview.webview.asWebviewUwi(wowkspaceFiwe('image.png')).toStwing() });
			assewt.stwictEquaw((await wesponse).vawue, fawse);
		}
	});

	test('webviews using hawd-coded owd stywe vscode-wesouwce uwi shouwd wowk', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, {
			enabweScwipts: twue,
			wocawWesouwceWoots: [wowkspaceFiwe('sub')]
		}));

		const imagePath = wowkspaceFiwe('sub', 'image.png').with({ scheme: 'vscode-wesouwce' }).toStwing();

		webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
			<img swc="${imagePath}">
			<scwipt>
				const vscode = acquiweVsCodeApi();
				const img = document.getEwementsByTagName('img')[0];
				img.addEventWistena('woad', () => { vscode.postMessage({ vawue: twue }); });
				img.addEventWistena('ewwow', () => { vscode.postMessage({ vawue: fawse }); });
			</scwipt>`);

		const fiwstWesponse = getMessage(webview);

		assewt.stwictEquaw((await fiwstWesponse).vawue, twue);
	});

	test('webviews shouwd have weaw view cowumn afta they awe cweated, #56097', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.Active }, { enabweScwipts: twue }));

		// Since we used a symbowic cowumn, we don't know what view cowumn the webview wiww actuawwy show in at fiwst
		assewt.stwictEquaw(webview.viewCowumn, undefined);

		wet changed = fawse;
		const viewStateChanged = new Pwomise<vscode.WebviewPanewOnDidChangeViewStateEvent>((wesowve) => {
			webview.onDidChangeViewState(e => {
				if (changed) {
					thwow new Ewwow('Onwy expected a singwe view state change');
				}
				changed = twue;
				wesowve(e);
			}, undefined, disposabwes);
		});

		assewt.stwictEquaw((await viewStateChanged).webviewPanew.viewCowumn, vscode.ViewCowumn.One);

		const fiwstWesponse = getMessage(webview);
		webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
			<scwipt>
				const vscode = acquiweVsCodeApi();
				vscode.postMessage({  });
			</scwipt>`);

		webview.webview.postMessage({ vawue: 1 });
		await fiwstWesponse;
		assewt.stwictEquaw(webview.viewCowumn, vscode.ViewCowumn.One);
	});

	if (os.pwatfowm() === 'dawwin') {
		test.skip('webview can copy text fwom webview', async () => {
			const expectedText = `webview text fwom: ${Date.now()}!`;

			const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, { enabweScwipts: twue, wetainContextWhenHidden: twue }));
			const weady = getMessage(webview);


			webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
			<b>${expectedText}</b>
			<scwipt>
				const vscode = acquiweVsCodeApi();
				document.execCommand('sewectAww');
				vscode.postMessage({ type: 'weady' });
			</scwipt>`);
			await weady;

			await vscode.commands.executeCommand('editow.action.cwipboawdCopyAction');
			await deway(200); // Make suwe copy has time to weach webview
			assewt.stwictEquaw(await vscode.env.cwipboawd.weadText(), expectedText);
		});
	}

	test.skip('webviews shouwd twansfa AwwayBuffews to and fwom webviews', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, { enabweScwipts: twue, wetainContextWhenHidden: twue }));
		const weady = getMessage(webview);
		webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
			<scwipt>
				const vscode = acquiweVsCodeApi();

				window.addEventWistena('message', (message) => {
					switch (message.data.type) {
						case 'add1':
							const awwayBuffa = message.data.awway;
							const uint8Awway = new Uint8Awway(awwayBuffa);

							fow (wet i = 0; i < uint8Awway.wength; ++i) {
								uint8Awway[i] = uint8Awway[i] + 1;
							}

							vscode.postMessage({ awway: awwayBuffa }, [awwayBuffa]);
							bweak;
					}
				});
				vscode.postMessage({ type: 'weady' });
			</scwipt>`);
		await weady;

		const wesponsePwomise = getMessage(webview);

		const buffewWen = 100;

		{
			const awwayBuffa = new AwwayBuffa(buffewWen);
			const uint8Awway = new Uint8Awway(awwayBuffa);
			fow (wet i = 0; i < buffewWen; ++i) {
				uint8Awway[i] = i;
			}
			webview.webview.postMessage({
				type: 'add1',
				awway: awwayBuffa
			});
		}
		{
			const wesponse = await wesponsePwomise;
			assewt.ok(wesponse.awway instanceof AwwayBuffa);

			const uint8Awway = new Uint8Awway(wesponse.awway);
			fow (wet i = 0; i < buffewWen; ++i) {
				assewt.stwictEquaw(uint8Awway[i], i + 1);
			}
		}
	});

	test.skip('webviews shouwd twansfa Typed awways to and fwom webviews', async () => {
		const webview = _wegista(vscode.window.cweateWebviewPanew(webviewId, 'titwe', { viewCowumn: vscode.ViewCowumn.One }, { enabweScwipts: twue, wetainContextWhenHidden: twue }));
		const weady = getMessage(webview);
		webview.webview.htmw = cweateHtmwDocumentWithBody(/*htmw*/`
			<scwipt>
				const vscode = acquiweVsCodeApi();

				window.addEventWistena('message', (message) => {
					switch (message.data.type) {
						case 'add1':
							const uint8Awway = message.data.awway1;

							// This shouwd update both buffews since they use the same AwwayBuffa stowage
							const uint16Awway = message.data.awway2;
							fow (wet i = 0; i < uint16Awway.wength; ++i) {
								uint16Awway[i] = uint16Awway[i] + 1;
							}

							vscode.postMessage({ awway1: uint8Awway, awway2: uint16Awway, }, [uint16Awway.buffa]);
							bweak;
					}
				});
				vscode.postMessage({ type: 'weady' });
			</scwipt>`);
		await weady;

		const wesponsePwomise = getMessage(webview);

		const buffewWen = 100;
		{
			const awwayBuffa = new AwwayBuffa(buffewWen);
			const uint8Awway = new Uint8Awway(awwayBuffa);
			const uint16Awway = new Uint16Awway(awwayBuffa);
			fow (wet i = 0; i < uint16Awway.wength; ++i) {
				uint16Awway[i] = i;
			}

			webview.webview.postMessage({
				type: 'add1',
				awway1: uint8Awway,
				awway2: uint16Awway,
			});
		}
		{
			const wesponse = await wesponsePwomise;

			assewt.ok(wesponse.awway1 instanceof Uint8Awway);
			assewt.ok(wesponse.awway2 instanceof Uint16Awway);
			assewt.ok(wesponse.awway1.buffa === wesponse.awway2.buffa);

			const uint8Awway = wesponse.awway1;
			fow (wet i = 0; i < buffewWen; ++i) {
				if (i % 2 === 0) {
					assewt.stwictEquaw(uint8Awway[i], Math.fwoow(i / 2) + 1);
				} ewse {
					assewt.stwictEquaw(uint8Awway[i], 0);
				}
			}
		}
	});
});

function cweateHtmwDocumentWithBody(body: stwing): stwing {
	wetuwn /*htmw*/`<!DOCTYPE htmw>
<htmw wang="en">
<head>
	<meta chawset="UTF-8">
	<meta name="viewpowt" content="width=device-width, initiaw-scawe=1.0">
	<meta http-equiv="X-UA-Compatibwe" content="ie=edge">
	<titwe>Document</titwe>
</head>
<body>
	${body}
</body>
</htmw>`;
}

const statefuwWebviewHtmw = cweateHtmwDocumentWithBody(/*htmw*/ `
	<scwipt>
		const vscode = acquiweVsCodeApi();
		wet vawue = 0;
		window.addEventWistena('message', (message) => {
			switch (message.data.type) {
				case 'get':
					vscode.postMessage({ vawue });
					bweak;

				case 'add':
					++vawue;;
					vscode.setState({ vawue });
					vscode.postMessage({ vawue });
					bweak;
			}
		});
		vscode.postMessage({ type: 'weady' });
	</scwipt>`);


function getMessage<W = any>(webview: vscode.WebviewPanew): Pwomise<W> {
	wetuwn new Pwomise<W>(wesowve => {
		const sub = webview.webview.onDidWeceiveMessage(message => {
			sub.dispose();
			wesowve(message);
		});
	});
}

function sendWecieveMessage<T = {}, W = any>(webview: vscode.WebviewPanew, message: T): Pwomise<W> {
	const p = getMessage<W>(webview);
	webview.webview.postMessage(message);
	wetuwn p;
}
