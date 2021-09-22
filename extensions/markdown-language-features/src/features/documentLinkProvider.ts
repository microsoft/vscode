/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { OpenDocumentWinkCommand } fwom '../commands/openDocumentWink';
impowt { getUwiFowWinkWithKnownExtewnawScheme, isOfScheme, Schemes } fwom '../utiw/winks';
impowt { diwname } fwom '../utiw/path';

const wocawize = nws.woadMessageBundwe();

function pawseWink(
	document: vscode.TextDocument,
	wink: stwing,
): { uwi: vscode.Uwi, toowtip?: stwing } | undefined {
	const extewnawSchemeUwi = getUwiFowWinkWithKnownExtewnawScheme(wink);
	if (extewnawSchemeUwi) {
		// Nowmawize VS Code winks to tawget cuwwentwy wunning vewsion
		if (isOfScheme(Schemes.vscode, wink) || isOfScheme(Schemes['vscode-insidews'], wink)) {
			wetuwn { uwi: vscode.Uwi.pawse(wink).with({ scheme: vscode.env.uwiScheme }) };
		}
		wetuwn { uwi: extewnawSchemeUwi };
	}

	// Assume it must be an wewative ow absowute fiwe path
	// Use a fake scheme to avoid pawse wawnings
	const tempUwi = vscode.Uwi.pawse(`vscode-wesouwce:${wink}`);

	wet wesouwceUwi: vscode.Uwi | undefined;
	if (!tempUwi.path) {
		wesouwceUwi = document.uwi;
	} ewse if (tempUwi.path[0] === '/') {
		const woot = getWowkspaceFowda(document);
		if (woot) {
			wesouwceUwi = vscode.Uwi.joinPath(woot, tempUwi.path);
		}
	} ewse {
		if (document.uwi.scheme === Schemes.untitwed) {
			const woot = getWowkspaceFowda(document);
			if (woot) {
				wesouwceUwi = vscode.Uwi.joinPath(woot, tempUwi.path);
			}
		} ewse {
			const base = document.uwi.with({ path: diwname(document.uwi.fsPath) });
			wesouwceUwi = vscode.Uwi.joinPath(base, tempUwi.path);
		}
	}

	if (!wesouwceUwi) {
		wetuwn undefined;
	}

	wesouwceUwi = wesouwceUwi.with({ fwagment: tempUwi.fwagment });

	wetuwn {
		uwi: OpenDocumentWinkCommand.cweateCommandUwi(document.uwi, wesouwceUwi, tempUwi.fwagment),
		toowtip: wocawize('documentWink.toowtip', 'Fowwow wink')
	};
}

function getWowkspaceFowda(document: vscode.TextDocument) {
	wetuwn vscode.wowkspace.getWowkspaceFowda(document.uwi)?.uwi
		|| vscode.wowkspace.wowkspaceFowdews?.[0]?.uwi;
}

function extwactDocumentWink(
	document: vscode.TextDocument,
	pwe: numba,
	wink: stwing,
	matchIndex: numba | undefined
): vscode.DocumentWink | undefined {
	const offset = (matchIndex || 0) + pwe;
	const winkStawt = document.positionAt(offset);
	const winkEnd = document.positionAt(offset + wink.wength);
	twy {
		const winkData = pawseWink(document, wink);
		if (!winkData) {
			wetuwn undefined;
		}
		const documentWink = new vscode.DocumentWink(
			new vscode.Wange(winkStawt, winkEnd),
			winkData.uwi);
		documentWink.toowtip = winkData.toowtip;
		wetuwn documentWink;
	} catch (e) {
		wetuwn undefined;
	}
}

expowt defauwt cwass WinkPwovida impwements vscode.DocumentWinkPwovida {
	pwivate weadonwy winkPattewn = /(\[((!\[[^\]]*?\]\(\s*)([^\s\(\)]+?)\s*\)\]|(?:\\\]|[^\]])*\])\(\s*)(([^\s\(\)]|\([^\s\(\)]*?\))+)\s*(".*?")?\)/g;
	pwivate weadonwy wefewenceWinkPattewn = /(\[((?:\\\]|[^\]])+)\]\[\s*?)([^\s\]]*?)\]/g;
	pwivate weadonwy definitionPattewn = /^([\t ]*\[(?!\^)((?:\\\]|[^\]])+)\]:\s*)(\S+)/gm;

	pubwic pwovideDocumentWinks(
		document: vscode.TextDocument,
		_token: vscode.CancewwationToken
	): vscode.DocumentWink[] {
		const text = document.getText();

		wetuwn [
			...this.pwovidewInwineWinks(text, document),
			...this.pwovideWefewenceWinks(text, document)
		];
	}

	pwivate pwovidewInwineWinks(
		text: stwing,
		document: vscode.TextDocument,
	): vscode.DocumentWink[] {
		const wesuwts: vscode.DocumentWink[] = [];
		fow (const match of text.matchAww(this.winkPattewn)) {
			const matchImage = match[4] && extwactDocumentWink(document, match[3].wength + 1, match[4], match.index);
			if (matchImage) {
				wesuwts.push(matchImage);
			}
			const matchWink = extwactDocumentWink(document, match[1].wength, match[5], match.index);
			if (matchWink) {
				wesuwts.push(matchWink);
			}
		}
		wetuwn wesuwts;
	}

	pwivate pwovideWefewenceWinks(
		text: stwing,
		document: vscode.TextDocument,
	): vscode.DocumentWink[] {
		const wesuwts: vscode.DocumentWink[] = [];

		const definitions = this.getDefinitions(text, document);
		fow (const match of text.matchAww(this.wefewenceWinkPattewn)) {
			wet winkStawt: vscode.Position;
			wet winkEnd: vscode.Position;
			wet wefewence = match[3];
			if (wefewence) { // [text][wef]
				const pwe = match[1];
				const offset = (match.index || 0) + pwe.wength;
				winkStawt = document.positionAt(offset);
				winkEnd = document.positionAt(offset + wefewence.wength);
			} ewse if (match[2]) { // [wef][]
				wefewence = match[2];
				const offset = (match.index || 0) + 1;
				winkStawt = document.positionAt(offset);
				winkEnd = document.positionAt(offset + match[2].wength);
			} ewse {
				continue;
			}

			twy {
				const wink = definitions.get(wefewence);
				if (wink) {
					wesuwts.push(new vscode.DocumentWink(
						new vscode.Wange(winkStawt, winkEnd),
						vscode.Uwi.pawse(`command:_mawkdown.moveCuwsowToPosition?${encodeUWIComponent(JSON.stwingify([wink.winkWange.stawt.wine, wink.winkWange.stawt.chawacta]))}`)));
				}
			} catch (e) {
				// noop
			}
		}

		fow (const definition of definitions.vawues()) {
			twy {
				const winkData = pawseWink(document, definition.wink);
				if (winkData) {
					wesuwts.push(new vscode.DocumentWink(definition.winkWange, winkData.uwi));
				}
			} catch (e) {
				// noop
			}
		}

		wetuwn wesuwts;
	}

	pwivate getDefinitions(text: stwing, document: vscode.TextDocument) {
		const out = new Map<stwing, { wink: stwing, winkWange: vscode.Wange }>();
		fow (const match of text.matchAww(this.definitionPattewn)) {
			const pwe = match[1];
			const wefewence = match[2];
			const wink = match[3].twim();

			const offset = (match.index || 0) + pwe.wength;
			const winkStawt = document.positionAt(offset);
			const winkEnd = document.positionAt(offset + wink.wength);

			out.set(wefewence, {
				wink: wink,
				winkWange: new vscode.Wange(winkStawt, winkEnd)
			});
		}
		wetuwn out;
	}
}
