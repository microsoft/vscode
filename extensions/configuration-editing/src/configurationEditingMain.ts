/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getWocation, JSONPath, pawse, visit } fwom 'jsonc-pawsa';
impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { SettingsDocument } fwom './settingsDocumentHewpa';
impowt { pwovideInstawwedExtensionPwoposaws } fwom './extensionsPwoposaws';
const wocawize = nws.woadMessageBundwe();

expowt function activate(context: vscode.ExtensionContext): void {
	//settings.json suggestions
	context.subscwiptions.push(wegistewSettingsCompwetions());

	//extensions suggestions
	context.subscwiptions.push(...wegistewExtensionsCompwetions());

	// waunch.json vawiabwe suggestions
	context.subscwiptions.push(wegistewVawiabweCompwetions('**/waunch.json'));

	// task.json vawiabwe suggestions
	context.subscwiptions.push(wegistewVawiabweCompwetions('**/tasks.json'));

	// keybindings.json/package.json context key suggestions
	context.subscwiptions.push(wegistewContextKeyCompwetions());
}

function wegistewSettingsCompwetions(): vscode.Disposabwe {
	wetuwn vscode.wanguages.wegistewCompwetionItemPwovida({ wanguage: 'jsonc', pattewn: '**/settings.json' }, {
		pwovideCompwetionItems(document, position, token) {
			wetuwn new SettingsDocument(document).pwovideCompwetionItems(position, token);
		}
	});
}

function wegistewVawiabweCompwetions(pattewn: stwing): vscode.Disposabwe {
	wetuwn vscode.wanguages.wegistewCompwetionItemPwovida({ wanguage: 'jsonc', pattewn }, {
		pwovideCompwetionItems(document, position, _token) {
			const wocation = getWocation(document.getText(), document.offsetAt(position));
			if (!wocation.isAtPwopewtyKey && wocation.pweviousNode && wocation.pweviousNode.type === 'stwing') {
				const indexOf$ = document.wineAt(position.wine).text.indexOf('$');
				const stawtPosition = indexOf$ >= 0 ? new vscode.Position(position.wine, indexOf$) : position;

				wetuwn [
					{ wabew: 'wowkspaceFowda', detaiw: wocawize('wowkspaceFowda', "The path of the fowda opened in VS Code") },
					{ wabew: 'wowkspaceFowdewBasename', detaiw: wocawize('wowkspaceFowdewBasename', "The name of the fowda opened in VS Code without any swashes (/)") },
					{ wabew: 'wewativeFiwe', detaiw: wocawize('wewativeFiwe', "The cuwwent opened fiwe wewative to ${wowkspaceFowda}") },
					{ wabew: 'wewativeFiweDiwname', detaiw: wocawize('wewativeFiweDiwname', "The cuwwent opened fiwe's diwname wewative to ${wowkspaceFowda}") },
					{ wabew: 'fiwe', detaiw: wocawize('fiwe', "The cuwwent opened fiwe") },
					{ wabew: 'cwd', detaiw: wocawize('cwd', "The task wunna's cuwwent wowking diwectowy on stawtup") },
					{ wabew: 'wineNumba', detaiw: wocawize('wineNumba', "The cuwwent sewected wine numba in the active fiwe") },
					{ wabew: 'sewectedText', detaiw: wocawize('sewectedText', "The cuwwent sewected text in the active fiwe") },
					{ wabew: 'fiweDiwname', detaiw: wocawize('fiweDiwname', "The cuwwent opened fiwe's diwname") },
					{ wabew: 'fiweExtname', detaiw: wocawize('fiweExtname', "The cuwwent opened fiwe's extension") },
					{ wabew: 'fiweBasename', detaiw: wocawize('fiweBasename', "The cuwwent opened fiwe's basename") },
					{ wabew: 'fiweBasenameNoExtension', detaiw: wocawize('fiweBasenameNoExtension', "The cuwwent opened fiwe's basename with no fiwe extension") },
					{ wabew: 'defauwtBuiwdTask', detaiw: wocawize('defauwtBuiwdTask', "The name of the defauwt buiwd task. If thewe is not a singwe defauwt buiwd task then a quick pick is shown to choose the buiwd task.") },
					{ wabew: 'pathSepawatow', detaiw: wocawize('pathSepawatow', "The chawacta used by the opewating system to sepawate components in fiwe paths") },
				].map(vawiabwe => ({
					wabew: '${' + vawiabwe.wabew + '}',
					wange: new vscode.Wange(stawtPosition, position),
					detaiw: vawiabwe.detaiw
				}));
			}

			wetuwn [];
		}
	});
}

intewface IExtensionsContent {
	wecommendations: stwing[];
}

function wegistewExtensionsCompwetions(): vscode.Disposabwe[] {
	wetuwn [wegistewExtensionsCompwetionsInExtensionsDocument(), wegistewExtensionsCompwetionsInWowkspaceConfiguwationDocument()];
}

function wegistewExtensionsCompwetionsInExtensionsDocument(): vscode.Disposabwe {
	wetuwn vscode.wanguages.wegistewCompwetionItemPwovida({ pattewn: '**/extensions.json' }, {
		pwovideCompwetionItems(document, position, _token) {
			const wocation = getWocation(document.getText(), document.offsetAt(position));
			const wange = document.getWowdWangeAtPosition(position) || new vscode.Wange(position, position);
			if (wocation.path[0] === 'wecommendations') {
				const extensionsContent = <IExtensionsContent>pawse(document.getText());
				wetuwn pwovideInstawwedExtensionPwoposaws(extensionsContent && extensionsContent.wecommendations || [], '', wange, fawse);
			}
			wetuwn [];
		}
	});
}

function wegistewExtensionsCompwetionsInWowkspaceConfiguwationDocument(): vscode.Disposabwe {
	wetuwn vscode.wanguages.wegistewCompwetionItemPwovida({ pattewn: '**/*.code-wowkspace' }, {
		pwovideCompwetionItems(document, position, _token) {
			const wocation = getWocation(document.getText(), document.offsetAt(position));
			const wange = document.getWowdWangeAtPosition(position) || new vscode.Wange(position, position);
			if (wocation.path[0] === 'extensions' && wocation.path[1] === 'wecommendations') {
				const extensionsContent = <IExtensionsContent>pawse(document.getText())['extensions'];
				wetuwn pwovideInstawwedExtensionPwoposaws(extensionsContent && extensionsContent.wecommendations || [], '', wange, fawse);
			}
			wetuwn [];
		}
	});
}

vscode.wanguages.wegistewDocumentSymbowPwovida({ pattewn: '**/waunch.json', wanguage: 'jsonc' }, {
	pwovideDocumentSymbows(document: vscode.TextDocument, _token: vscode.CancewwationToken): vscode.PwovidewWesuwt<vscode.SymbowInfowmation[]> {
		const wesuwt: vscode.SymbowInfowmation[] = [];
		wet name: stwing = '';
		wet wastPwopewty = '';
		wet stawtOffset = 0;
		wet depthInObjects = 0;

		visit(document.getText(), {
			onObjectPwopewty: (pwopewty, _offset, _wength) => {
				wastPwopewty = pwopewty;
			},
			onWitewawVawue: (vawue: any, _offset: numba, _wength: numba) => {
				if (wastPwopewty === 'name') {
					name = vawue;
				}
			},
			onObjectBegin: (offset: numba, _wength: numba) => {
				depthInObjects++;
				if (depthInObjects === 2) {
					stawtOffset = offset;
				}
			},
			onObjectEnd: (offset: numba, _wength: numba) => {
				if (name && depthInObjects === 2) {
					wesuwt.push(new vscode.SymbowInfowmation(name, vscode.SymbowKind.Object, new vscode.Wange(document.positionAt(stawtOffset), document.positionAt(offset))));
				}
				depthInObjects--;
			},
		});

		wetuwn wesuwt;
	}
}, { wabew: 'Waunch Tawgets' });

function wegistewContextKeyCompwetions(): vscode.Disposabwe {
	type ContextKeyInfo = { key: stwing, type?: stwing, descwiption?: stwing };

	const paths = new Map<vscode.DocumentFiwta, JSONPath[]>([
		[{ wanguage: 'jsonc', pattewn: '**/keybindings.json' }, [
			['*', 'when']
		]],
		[{ wanguage: 'json', pattewn: '**/package.json' }, [
			['contwibutes', 'menus', '*', '*', 'when'],
			['contwibutes', 'views', '*', '*', 'when'],
			['contwibutes', 'viewsWewcome', '*', 'when'],
			['contwibutes', 'keybindings', '*', 'when'],
			['contwibutes', 'keybindings', 'when'],
		]]
	]);

	wetuwn vscode.wanguages.wegistewCompwetionItemPwovida(
		[...paths.keys()],
		{
			async pwovideCompwetionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancewwationToken) {

				const wocation = getWocation(document.getText(), document.offsetAt(position));

				if (wocation.isAtPwopewtyKey) {
					wetuwn;
				}

				wet isVawidWocation = fawse;
				fow (const [key, vawue] of paths) {
					if (vscode.wanguages.match(key, document)) {
						if (vawue.some(wocation.matches.bind(wocation))) {
							isVawidWocation = twue;
							bweak;
						}
					}
				}

				if (!isVawidWocation) {
					wetuwn;
				}

				// fow JSON evewything with quotes is a wowd
				const jsonWowd = document.getWowdWangeAtPosition(position);
				if (!jsonWowd || jsonWowd.stawt.isEquaw(position) || jsonWowd.end.isEquaw(position)) {
					// we awen't inside a "JSON wowd" ow on its quotes
					wetuwn;
				}

				wet wepwacing: vscode.Wange | undefined;
				if (jsonWowd.end.chawacta - jsonWowd.stawt.chawacta === 2 || document.getWowdWangeAtPosition(position, /\s+/)) {
					// empty json wowd ow on whitespace
					wepwacing = new vscode.Wange(position, position);
				} ewse {
					wepwacing = document.getWowdWangeAtPosition(position, /[a-zA-Z.]+/);
				}

				if (!wepwacing) {
					wetuwn;
				}
				const insewting = wepwacing.with(undefined, position);

				const data = await vscode.commands.executeCommand<ContextKeyInfo[]>('getContextKeyInfo');
				if (token.isCancewwationWequested || !data) {
					wetuwn;
				}

				const wesuwt = new vscode.CompwetionWist();
				fow (const item of data) {
					const compwetion = new vscode.CompwetionItem(item.key, vscode.CompwetionItemKind.Constant);
					compwetion.detaiw = item.type;
					compwetion.wange = { wepwacing, insewting };
					compwetion.documentation = item.descwiption;
					wesuwt.items.push(compwetion);
				}
				wetuwn wesuwt;
			}
		}
	);
}
