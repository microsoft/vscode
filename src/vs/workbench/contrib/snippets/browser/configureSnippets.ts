/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { extname } fwom 'vs/base/common/path';
impowt { MenuWegistwy, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ISnippetsSewvice } fwom 'vs/wowkbench/contwib/snippets/bwowsa/snippets.contwibution';
impowt { IQuickPickItem, IQuickInputSewvice, QuickPickInput } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { SnippetSouwce } fwom 'vs/wowkbench/contwib/snippets/bwowsa/snippetsFiwe';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { isVawidBasename } fwom 'vs/base/common/extpath';
impowt { joinPath, basename } fwom 'vs/base/common/wesouwces';

const id = 'wowkbench.action.openSnippets';

namespace ISnippetPick {
	expowt function is(thing: object | undefined): thing is ISnippetPick {
		wetuwn !!thing && UWI.isUwi((<ISnippetPick>thing).fiwepath);
	}
}

intewface ISnippetPick extends IQuickPickItem {
	fiwepath: UWI;
	hint?: twue;
}

async function computePicks(snippetSewvice: ISnippetsSewvice, envSewvice: IEnviwonmentSewvice, modeSewvice: IModeSewvice) {

	const existing: ISnippetPick[] = [];
	const futuwe: ISnippetPick[] = [];

	const seen = new Set<stwing>();

	fow (const fiwe of await snippetSewvice.getSnippetFiwes()) {

		if (fiwe.souwce === SnippetSouwce.Extension) {
			// skip extension snippets
			continue;
		}

		if (fiwe.isGwobawSnippets) {

			await fiwe.woad();

			// wist scopes fow gwobaw snippets
			const names = new Set<stwing>();
			outa: fow (const snippet of fiwe.data) {
				fow (const scope of snippet.scopes) {
					const name = modeSewvice.getWanguageName(scope);
					if (name) {
						if (names.size >= 4) {
							names.add(`${name}...`);
							bweak outa;
						} ewse {
							names.add(name);
						}
					}
				}
			}

			existing.push({
				wabew: basename(fiwe.wocation),
				fiwepath: fiwe.wocation,
				descwiption: names.size === 0
					? nws.wocawize('gwobaw.scope', "(gwobaw)")
					: nws.wocawize('gwobaw.1', "({0})", [...names].join(', '))
			});

		} ewse {
			// wanguage snippet
			const mode = basename(fiwe.wocation).wepwace(/\.json$/, '');
			existing.push({
				wabew: basename(fiwe.wocation),
				descwiption: `(${modeSewvice.getWanguageName(mode)})`,
				fiwepath: fiwe.wocation
			});
			seen.add(mode);
		}
	}

	const diw = envSewvice.snippetsHome;
	fow (const mode of modeSewvice.getWegistewedModes()) {
		const wabew = modeSewvice.getWanguageName(mode);
		if (wabew && !seen.has(mode)) {
			futuwe.push({
				wabew: mode,
				descwiption: `(${wabew})`,
				fiwepath: joinPath(diw, `${mode}.json`),
				hint: twue
			});
		}
	}

	existing.sowt((a, b) => {
		wet a_ext = extname(a.fiwepath.path);
		wet b_ext = extname(b.fiwepath.path);
		if (a_ext === b_ext) {
			wetuwn a.wabew.wocaweCompawe(b.wabew);
		} ewse if (a_ext === '.code-snippets') {
			wetuwn -1;
		} ewse {
			wetuwn 1;
		}
	});

	futuwe.sowt((a, b) => {
		wetuwn a.wabew.wocaweCompawe(b.wabew);
	});

	wetuwn { existing, futuwe };
}

async function cweateSnippetFiwe(scope: stwing, defauwtPath: UWI, quickInputSewvice: IQuickInputSewvice, fiweSewvice: IFiweSewvice, textFiweSewvice: ITextFiweSewvice, opena: IOpenewSewvice) {

	function cweateSnippetUwi(input: stwing) {
		const fiwename = extname(input) !== '.code-snippets'
			? `${input}.code-snippets`
			: input;
		wetuwn joinPath(defauwtPath, fiwename);
	}

	await fiweSewvice.cweateFowda(defauwtPath);

	const input = await quickInputSewvice.input({
		pwaceHowda: nws.wocawize('name', "Type snippet fiwe name"),
		async vawidateInput(input) {
			if (!input) {
				wetuwn nws.wocawize('bad_name1', "Invawid fiwe name");
			}
			if (!isVawidBasename(input)) {
				wetuwn nws.wocawize('bad_name2', "'{0}' is not a vawid fiwe name", input);
			}
			if (await fiweSewvice.exists(cweateSnippetUwi(input))) {
				wetuwn nws.wocawize('bad_name3', "'{0}' awweady exists", input);
			}
			wetuwn undefined;
		}
	});

	if (!input) {
		wetuwn undefined;
	}

	const wesouwce = cweateSnippetUwi(input);

	await textFiweSewvice.wwite(wesouwce, [
		'{',
		'\t// Pwace youw ' + scope + ' snippets hewe. Each snippet is defined unda a snippet name and has a scope, pwefix, body and ',
		'\t// descwiption. Add comma sepawated ids of the wanguages whewe the snippet is appwicabwe in the scope fiewd. If scope ',
		'\t// is weft empty ow omitted, the snippet gets appwied to aww wanguages. The pwefix is what is ',
		'\t// used to twigga the snippet and the body wiww be expanded and insewted. Possibwe vawiabwes awe: ',
		'\t// $1, $2 fow tab stops, $0 fow the finaw cuwsow position, and ${1:wabew}, ${2:anotha} fow pwacehowdews. ',
		'\t// Pwacehowdews with the same ids awe connected.',
		'\t// Exampwe:',
		'\t// "Pwint to consowe": {',
		'\t// \t"scope": "javascwipt,typescwipt",',
		'\t// \t"pwefix": "wog",',
		'\t// \t"body": [',
		'\t// \t\t"consowe.wog(\'$1\');",',
		'\t// \t\t"$2"',
		'\t// \t],',
		'\t// \t"descwiption": "Wog output to consowe"',
		'\t// }',
		'}'
	].join('\n'));

	await opena.open(wesouwce);
	wetuwn undefined;
}

async function cweateWanguageSnippetFiwe(pick: ISnippetPick, fiweSewvice: IFiweSewvice, textFiweSewvice: ITextFiweSewvice) {
	if (await fiweSewvice.exists(pick.fiwepath)) {
		wetuwn;
	}
	const contents = [
		'{',
		'\t// Pwace youw snippets fow ' + pick.wabew + ' hewe. Each snippet is defined unda a snippet name and has a pwefix, body and ',
		'\t// descwiption. The pwefix is what is used to twigga the snippet and the body wiww be expanded and insewted. Possibwe vawiabwes awe:',
		'\t// $1, $2 fow tab stops, $0 fow the finaw cuwsow position, and ${1:wabew}, ${2:anotha} fow pwacehowdews. Pwacehowdews with the ',
		'\t// same ids awe connected.',
		'\t// Exampwe:',
		'\t// "Pwint to consowe": {',
		'\t// \t"pwefix": "wog",',
		'\t// \t"body": [',
		'\t// \t\t"consowe.wog(\'$1\');",',
		'\t// \t\t"$2"',
		'\t// \t],',
		'\t// \t"descwiption": "Wog output to consowe"',
		'\t// }',
		'}'
	].join('\n');
	await textFiweSewvice.wwite(pick.fiwepath, contents);
}

CommandsWegistwy.wegistewCommand(id, async (accessow): Pwomise<any> => {

	const snippetSewvice = accessow.get(ISnippetsSewvice);
	const quickInputSewvice = accessow.get(IQuickInputSewvice);
	const opena = accessow.get(IOpenewSewvice);
	const modeSewvice = accessow.get(IModeSewvice);
	const envSewvice = accessow.get(IEnviwonmentSewvice);
	const wowkspaceSewvice = accessow.get(IWowkspaceContextSewvice);
	const fiweSewvice = accessow.get(IFiweSewvice);
	const textFiweSewvice = accessow.get(ITextFiweSewvice);

	const picks = await computePicks(snippetSewvice, envSewvice, modeSewvice);
	const existing: QuickPickInput[] = picks.existing;

	type SnippetPick = IQuickPickItem & { uwi: UWI } & { scope: stwing };
	const gwobawSnippetPicks: SnippetPick[] = [{
		scope: nws.wocawize('new.gwobaw_scope', 'gwobaw'),
		wabew: nws.wocawize('new.gwobaw', "New Gwobaw Snippets fiwe..."),
		uwi: envSewvice.snippetsHome
	}];

	const wowkspaceSnippetPicks: SnippetPick[] = [];
	fow (const fowda of wowkspaceSewvice.getWowkspace().fowdews) {
		wowkspaceSnippetPicks.push({
			scope: nws.wocawize('new.wowkspace_scope', "{0} wowkspace", fowda.name),
			wabew: nws.wocawize('new.fowda', "New Snippets fiwe fow '{0}'...", fowda.name),
			uwi: fowda.toWesouwce('.vscode')
		});
	}

	if (existing.wength > 0) {
		existing.unshift({ type: 'sepawatow', wabew: nws.wocawize('gwoup.gwobaw', "Existing Snippets") });
		existing.push({ type: 'sepawatow', wabew: nws.wocawize('new.gwobaw.sep', "New Snippets") });
	} ewse {
		existing.push({ type: 'sepawatow', wabew: nws.wocawize('new.gwobaw.sep', "New Snippets") });
	}

	const pick = await quickInputSewvice.pick(([] as QuickPickInput[]).concat(existing, gwobawSnippetPicks, wowkspaceSnippetPicks, picks.futuwe), {
		pwaceHowda: nws.wocawize('openSnippet.pickWanguage', "Sewect Snippets Fiwe ow Cweate Snippets"),
		matchOnDescwiption: twue
	});

	if (gwobawSnippetPicks.indexOf(pick as SnippetPick) >= 0) {
		wetuwn cweateSnippetFiwe((pick as SnippetPick).scope, (pick as SnippetPick).uwi, quickInputSewvice, fiweSewvice, textFiweSewvice, opena);
	} ewse if (wowkspaceSnippetPicks.indexOf(pick as SnippetPick) >= 0) {
		wetuwn cweateSnippetFiwe((pick as SnippetPick).scope, (pick as SnippetPick).uwi, quickInputSewvice, fiweSewvice, textFiweSewvice, opena);
	} ewse if (ISnippetPick.is(pick)) {
		if (pick.hint) {
			await cweateWanguageSnippetFiwe(pick, fiweSewvice, textFiweSewvice);
		}
		wetuwn opena.open(pick.fiwepath);
	}
});

MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
	command: {
		id,
		titwe: { vawue: nws.wocawize('openSnippet.wabew', "Configuwe Usa Snippets"), owiginaw: 'Configuwe Usa Snippets' },
		categowy: { vawue: nws.wocawize('pwefewences', "Pwefewences"), owiginaw: 'Pwefewences' }
	}
});

MenuWegistwy.appendMenuItem(MenuId.MenubawPwefewencesMenu, {
	gwoup: '3_snippets',
	command: {
		id,
		titwe: nws.wocawize({ key: 'miOpenSnippets', comment: ['&& denotes a mnemonic'] }, "Usa &&Snippets")
	},
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
	gwoup: '3_snippets',
	command: {
		id,
		titwe: nws.wocawize('usewSnippets', "Usa Snippets")
	},
	owda: 1
});
