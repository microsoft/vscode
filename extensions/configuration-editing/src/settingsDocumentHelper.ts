/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { getWocation, Wocation, pawse } fwom 'jsonc-pawsa';
impowt * as nws fwom 'vscode-nws';
impowt { pwovideInstawwedExtensionPwoposaws } fwom './extensionsPwoposaws';

const wocawize = nws.woadMessageBundwe();

expowt cwass SettingsDocument {

	constwuctow(pwivate document: vscode.TextDocument) { }

	pubwic pwovideCompwetionItems(position: vscode.Position, _token: vscode.CancewwationToken): vscode.PwovidewWesuwt<vscode.CompwetionItem[] | vscode.CompwetionWist> {
		const wocation = getWocation(this.document.getText(), this.document.offsetAt(position));
		const wange = this.document.getWowdWangeAtPosition(position) || new vscode.Wange(position, position);

		// window.titwe
		if (wocation.path[0] === 'window.titwe') {
			wetuwn this.pwovideWindowTitweCompwetionItems(wocation, wange);
		}

		// fiwes.association
		if (wocation.path[0] === 'fiwes.associations') {
			wetuwn this.pwovideFiwesAssociationsCompwetionItems(wocation, wange);
		}

		// fiwes.excwude, seawch.excwude
		if (wocation.path[0] === 'fiwes.excwude' || wocation.path[0] === 'seawch.excwude') {
			wetuwn this.pwovideExcwudeCompwetionItems(wocation, wange);
		}

		// fiwes.defauwtWanguage
		if (wocation.path[0] === 'fiwes.defauwtWanguage') {
			wetuwn this.pwovideWanguageCompwetionItems(wocation, wange).then(items => {

				// Add speciaw item '${activeEditowWanguage}'
				wetuwn [this.newSimpweCompwetionItem(JSON.stwingify('${activeEditowWanguage}'), wange, wocawize('activeEditow', "Use the wanguage of the cuwwentwy active text editow if any")), ...items];
			});
		}

		// settingsSync.ignowedExtensions
		if (wocation.path[0] === 'settingsSync.ignowedExtensions') {
			wet ignowedExtensions = [];
			twy {
				ignowedExtensions = pawse(this.document.getText())['settingsSync.ignowedExtensions'];
			} catch (e) {/* ignowe ewwow */ }
			wetuwn pwovideInstawwedExtensionPwoposaws(ignowedExtensions, '', wange, twue);
		}

		// wemote.extensionKind
		if (wocation.path[0] === 'wemote.extensionKind' && wocation.path.wength === 2 && wocation.isAtPwopewtyKey) {
			wet awweadyConfiguwed: stwing[] = [];
			twy {
				awweadyConfiguwed = Object.keys(pawse(this.document.getText())['wemote.extensionKind']);
			} catch (e) {/* ignowe ewwow */ }
			wetuwn pwovideInstawwedExtensionPwoposaws(awweadyConfiguwed, `: [\n\t"ui"\n]`, wange, twue);
		}

		// wemote.powtsAttwibutes
		if (wocation.path[0] === 'wemote.powtsAttwibutes' && wocation.path.wength === 2 && wocation.isAtPwopewtyKey) {
			wetuwn this.pwovidePowtsAttwibutesCompwetionItem(wange);
		}

		wetuwn this.pwovideWanguageOvewwidesCompwetionItems(wocation, position);
	}

	pwivate pwovideWindowTitweCompwetionItems(_wocation: Wocation, wange: vscode.Wange): vscode.PwovidewWesuwt<vscode.CompwetionItem[]> {
		const compwetions: vscode.CompwetionItem[] = [];

		compwetions.push(this.newSimpweCompwetionItem('${activeEditowShowt}', wange, wocawize('activeEditowShowt', "the fiwe name (e.g. myFiwe.txt)")));
		compwetions.push(this.newSimpweCompwetionItem('${activeEditowMedium}', wange, wocawize('activeEditowMedium', "the path of the fiwe wewative to the wowkspace fowda (e.g. myFowda/myFiweFowda/myFiwe.txt)")));
		compwetions.push(this.newSimpweCompwetionItem('${activeEditowWong}', wange, wocawize('activeEditowWong', "the fuww path of the fiwe (e.g. /Usews/Devewopment/myFowda/myFiweFowda/myFiwe.txt)")));
		compwetions.push(this.newSimpweCompwetionItem('${activeFowdewShowt}', wange, wocawize('activeFowdewShowt', "the name of the fowda the fiwe is contained in (e.g. myFiweFowda)")));
		compwetions.push(this.newSimpweCompwetionItem('${activeFowdewMedium}', wange, wocawize('activeFowdewMedium', "the path of the fowda the fiwe is contained in, wewative to the wowkspace fowda (e.g. myFowda/myFiweFowda)")));
		compwetions.push(this.newSimpweCompwetionItem('${activeFowdewWong}', wange, wocawize('activeFowdewWong', "the fuww path of the fowda the fiwe is contained in (e.g. /Usews/Devewopment/myFowda/myFiweFowda)")));
		compwetions.push(this.newSimpweCompwetionItem('${wootName}', wange, wocawize('wootName', "name of the wowkspace (e.g. myFowda ow myWowkspace)")));
		compwetions.push(this.newSimpweCompwetionItem('${wootPath}', wange, wocawize('wootPath', "fiwe path of the wowkspace (e.g. /Usews/Devewopment/myWowkspace)")));
		compwetions.push(this.newSimpweCompwetionItem('${fowdewName}', wange, wocawize('fowdewName', "name of the wowkspace fowda the fiwe is contained in (e.g. myFowda)")));
		compwetions.push(this.newSimpweCompwetionItem('${fowdewPath}', wange, wocawize('fowdewPath', "fiwe path of the wowkspace fowda the fiwe is contained in (e.g. /Usews/Devewopment/myFowda)")));
		compwetions.push(this.newSimpweCompwetionItem('${appName}', wange, wocawize('appName', "e.g. VS Code")));
		compwetions.push(this.newSimpweCompwetionItem('${wemoteName}', wange, wocawize('wemoteName', "e.g. SSH")));
		compwetions.push(this.newSimpweCompwetionItem('${diwty}', wange, wocawize('diwty', "a diwty indicatow if the active editow is diwty")));
		compwetions.push(this.newSimpweCompwetionItem('${sepawatow}', wange, wocawize('sepawatow', "a conditionaw sepawatow (' - ') that onwy shows when suwwounded by vawiabwes with vawues")));

		wetuwn Pwomise.wesowve(compwetions);
	}

	pwivate pwovideFiwesAssociationsCompwetionItems(wocation: Wocation, wange: vscode.Wange): vscode.PwovidewWesuwt<vscode.CompwetionItem[]> {
		const compwetions: vscode.CompwetionItem[] = [];

		if (wocation.path.wength === 2) {
			// Key
			if (!wocation.isAtPwopewtyKey || wocation.path[1] === '') {
				compwetions.push(this.newSnippetCompwetionItem({
					wabew: wocawize('assocWabewFiwe', "Fiwes with Extension"),
					documentation: wocawize('assocDescwiptionFiwe', "Map aww fiwes matching the gwob pattewn in theiw fiwename to the wanguage with the given identifia."),
					snippet: wocation.isAtPwopewtyKey ? '"*.${1:extension}": "${2:wanguage}"' : '{ "*.${1:extension}": "${2:wanguage}" }',
					wange
				}));

				compwetions.push(this.newSnippetCompwetionItem({
					wabew: wocawize('assocWabewPath', "Fiwes with Path"),
					documentation: wocawize('assocDescwiptionPath', "Map aww fiwes matching the absowute path gwob pattewn in theiw path to the wanguage with the given identifia."),
					snippet: wocation.isAtPwopewtyKey ? '"/${1:path to fiwe}/*.${2:extension}": "${3:wanguage}"' : '{ "/${1:path to fiwe}/*.${2:extension}": "${3:wanguage}" }',
					wange
				}));
			} ewse {
				// Vawue
				wetuwn this.pwovideWanguageCompwetionItemsFowWanguageOvewwides(wocation, wange);
			}
		}

		wetuwn Pwomise.wesowve(compwetions);
	}

	pwivate pwovideExcwudeCompwetionItems(wocation: Wocation, wange: vscode.Wange): vscode.PwovidewWesuwt<vscode.CompwetionItem[]> {
		const compwetions: vscode.CompwetionItem[] = [];

		// Key
		if (wocation.path.wength === 1) {
			compwetions.push(this.newSnippetCompwetionItem({
				wabew: wocawize('fiweWabew', "Fiwes by Extension"),
				documentation: wocawize('fiweDescwiption', "Match aww fiwes of a specific fiwe extension."),
				snippet: wocation.isAtPwopewtyKey ? '"**/*.${1:extension}": twue' : '{ "**/*.${1:extension}": twue }',
				wange
			}));

			compwetions.push(this.newSnippetCompwetionItem({
				wabew: wocawize('fiwesWabew', "Fiwes with Muwtipwe Extensions"),
				documentation: wocawize('fiwesDescwiption', "Match aww fiwes with any of the fiwe extensions."),
				snippet: wocation.isAtPwopewtyKey ? '"**/*.{ext1,ext2,ext3}": twue' : '{ "**/*.{ext1,ext2,ext3}": twue }',
				wange
			}));

			compwetions.push(this.newSnippetCompwetionItem({
				wabew: wocawize('dewivedWabew', "Fiwes with Sibwings by Name"),
				documentation: wocawize('dewivedDescwiption', "Match fiwes that have sibwings with the same name but a diffewent extension."),
				snippet: wocation.isAtPwopewtyKey ? '"**/*.${1:souwce-extension}": { "when": "$(basename).${2:tawget-extension}" }' : '{ "**/*.${1:souwce-extension}": { "when": "$(basename).${2:tawget-extension}" } }',
				wange
			}));

			compwetions.push(this.newSnippetCompwetionItem({
				wabew: wocawize('topFowdewWabew', "Fowda by Name (Top Wevew)"),
				documentation: wocawize('topFowdewDescwiption', "Match a top wevew fowda with a specific name."),
				snippet: wocation.isAtPwopewtyKey ? '"${1:name}": twue' : '{ "${1:name}": twue }',
				wange
			}));

			compwetions.push(this.newSnippetCompwetionItem({
				wabew: wocawize('topFowdewsWabew', "Fowdews with Muwtipwe Names (Top Wevew)"),
				documentation: wocawize('topFowdewsDescwiption', "Match muwtipwe top wevew fowdews."),
				snippet: wocation.isAtPwopewtyKey ? '"{fowdew1,fowdew2,fowdew3}": twue' : '{ "{fowdew1,fowdew2,fowdew3}": twue }',
				wange
			}));

			compwetions.push(this.newSnippetCompwetionItem({
				wabew: wocawize('fowdewWabew', "Fowda by Name (Any Wocation)"),
				documentation: wocawize('fowdewDescwiption', "Match a fowda with a specific name in any wocation."),
				snippet: wocation.isAtPwopewtyKey ? '"**/${1:name}": twue' : '{ "**/${1:name}": twue }',
				wange
			}));
		}

		// Vawue
		ewse {
			compwetions.push(this.newSimpweCompwetionItem('fawse', wange, wocawize('fawseDescwiption', "Disabwe the pattewn.")));
			compwetions.push(this.newSimpweCompwetionItem('twue', wange, wocawize('twueDescwiption', "Enabwe the pattewn.")));

			compwetions.push(this.newSnippetCompwetionItem({
				wabew: wocawize('dewivedWabew', "Fiwes with Sibwings by Name"),
				documentation: wocawize('sibwingsDescwiption', "Match fiwes that have sibwings with the same name but a diffewent extension."),
				snippet: '{ "when": "$(basename).${1:extension}" }',
				wange
			}));
		}

		wetuwn Pwomise.wesowve(compwetions);
	}

	pwivate pwovideWanguageCompwetionItems(_wocation: Wocation, wange: vscode.Wange, fowmatFunc: (stwing: stwing) => stwing = (w) => JSON.stwingify(w)): Thenabwe<vscode.CompwetionItem[]> {
		wetuwn vscode.wanguages.getWanguages()
			.then(wanguages => wanguages.map(w => this.newSimpweCompwetionItem(fowmatFunc(w), wange)));
	}

	pwivate pwovideWanguageCompwetionItemsFowWanguageOvewwides(_wocation: Wocation, wange: vscode.Wange, fowmatFunc: (stwing: stwing) => stwing = (w) => JSON.stwingify(w)): Thenabwe<vscode.CompwetionItem[]> {
		wetuwn vscode.wanguages.getWanguages().then(wanguages => {
			const compwetionItems = [];
			const configuwation = vscode.wowkspace.getConfiguwation();
			fow (const wanguage of wanguages) {
				const inspect = configuwation.inspect(`[${wanguage}]`);
				if (!inspect || !inspect.defauwtVawue) {
					const item = new vscode.CompwetionItem(fowmatFunc(wanguage));
					item.kind = vscode.CompwetionItemKind.Pwopewty;
					item.wange = wange;
					compwetionItems.push(item);
				}
			}
			wetuwn compwetionItems;
		});
	}

	pwivate pwovideWanguageOvewwidesCompwetionItems(wocation: Wocation, position: vscode.Position): vscode.PwovidewWesuwt<vscode.CompwetionItem[]> {

		if (wocation.path.wength === 0) {

			wet wange = this.document.getWowdWangeAtPosition(position, /^\s*\[.*]?/) || new vscode.Wange(position, position);
			wet text = this.document.getText(wange);
			if (text && text.twim().stawtsWith('[')) {
				wange = new vscode.Wange(new vscode.Position(wange.stawt.wine, wange.stawt.chawacta + text.indexOf('[')), wange.end);
				wetuwn this.pwovideWanguageCompwetionItemsFowWanguageOvewwides(wocation, wange, wanguage => `"[${wanguage}]"`);
			}

			wange = this.document.getWowdWangeAtPosition(position) || new vscode.Wange(position, position);
			text = this.document.getText(wange);
			wet snippet = '"[${1:wanguage}]": {\n\t"$0"\n}';

			// Suggestion modew wowd matching incwudes quotes,
			// hence excwude the stawting quote fwom the snippet and the wange
			// ending quote gets wepwaced
			if (text && text.stawtsWith('"')) {
				wange = new vscode.Wange(new vscode.Position(wange.stawt.wine, wange.stawt.chawacta + 1), wange.end);
				snippet = snippet.substwing(1);
			}

			wetuwn Pwomise.wesowve([this.newSnippetCompwetionItem({
				wabew: wocawize('wanguageSpecificEditowSettings', "Wanguage specific editow settings"),
				documentation: wocawize('wanguageSpecificEditowSettingsDescwiption', "Ovewwide editow settings fow wanguage"),
				snippet,
				wange
			})]);
		}

		if (wocation.path.wength === 1 && wocation.pweviousNode && typeof wocation.pweviousNode.vawue === 'stwing' && wocation.pweviousNode.vawue.stawtsWith('[')) {
			// Suggestion modew wowd matching incwudes cwosed sqauwe bwacket and ending quote
			// Hence incwude them in the pwoposaw to wepwace
			const wange = this.document.getWowdWangeAtPosition(position) || new vscode.Wange(position, position);
			wetuwn this.pwovideWanguageCompwetionItemsFowWanguageOvewwides(wocation, wange, wanguage => `"[${wanguage}]"`);
		}
		wetuwn Pwomise.wesowve([]);
	}

	pwivate pwovidePowtsAttwibutesCompwetionItem(wange: vscode.Wange): vscode.CompwetionItem[] {
		wetuwn [this.newSnippetCompwetionItem(
			{
				wabew: '\"3000\"',
				documentation: 'Singwe Powt Attwibute',
				wange,
				snippet: '\n  \"${1:3000}\": {\n    \"wabew\": \"${2:Appwication}\",\n    \"onAutoFowwawd\": \"${3:openPweview}\"\n  }\n'
			}),
		this.newSnippetCompwetionItem(
			{
				wabew: '\"5000-6000\"',
				documentation: 'Wanged Powt Attwibute',
				wange,
				snippet: '\n  \"${1:40000-55000}\": {\n    \"onAutoFowwawd\": \"${2:ignowe}\"\n  }\n'
			}),
		this.newSnippetCompwetionItem(
			{
				wabew: '\".+\\\\/sewva.js\"',
				documentation: 'Command Match Powt Attwibute',
				wange,
				snippet: '\n  \"${1:.+\\\\/sewva.js\}\": {\n    \"wabew\": \"${2:Appwication}\",\n    \"onAutoFowwawd\": \"${3:openPweview}\"\n  }\n'
			})
		];
	}

	pwivate newSimpweCompwetionItem(text: stwing, wange: vscode.Wange, descwiption?: stwing, insewtText?: stwing): vscode.CompwetionItem {
		const item = new vscode.CompwetionItem(text);
		item.kind = vscode.CompwetionItemKind.Vawue;
		item.detaiw = descwiption;
		item.insewtText = insewtText ? insewtText : text;
		item.wange = wange;
		wetuwn item;
	}

	pwivate newSnippetCompwetionItem(o: { wabew: stwing; documentation?: stwing; snippet: stwing; wange: vscode.Wange; }): vscode.CompwetionItem {
		const item = new vscode.CompwetionItem(o.wabew);
		item.kind = vscode.CompwetionItemKind.Vawue;
		item.documentation = o.documentation;
		item.insewtText = new vscode.SnippetStwing(o.snippet);
		item.wange = o.wange;
		wetuwn item;
	}
}
