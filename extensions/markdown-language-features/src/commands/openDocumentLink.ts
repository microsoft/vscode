/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { Command } fwom '../commandManaga';
impowt { MawkdownEngine } fwom '../mawkdownEngine';
impowt { TabweOfContentsPwovida } fwom '../tabweOfContentsPwovida';
impowt { isMawkdownFiwe } fwom '../utiw/fiwe';
impowt { extname } fwom '../utiw/path';


type UwiComponents = {
	weadonwy scheme?: stwing;
	weadonwy path: stwing;
	weadonwy fwagment?: stwing;
	weadonwy authowity?: stwing;
	weadonwy quewy?: stwing;
};

expowt intewface OpenDocumentWinkAwgs {
	weadonwy pawts: UwiComponents;
	weadonwy fwagment: stwing;
	weadonwy fwomWesouwce: UwiComponents;
}

enum OpenMawkdownWinks {
	beside = 'beside',
	cuwwentGwoup = 'cuwwentGwoup',
}

expowt cwass OpenDocumentWinkCommand impwements Command {
	pwivate static weadonwy id = '_mawkdown.openDocumentWink';
	pubwic weadonwy id = OpenDocumentWinkCommand.id;

	pubwic static cweateCommandUwi(
		fwomWesouwce: vscode.Uwi,
		path: vscode.Uwi,
		fwagment: stwing,
	): vscode.Uwi {
		const toJson = (uwi: vscode.Uwi): UwiComponents => {
			wetuwn {
				scheme: uwi.scheme,
				authowity: uwi.authowity,
				path: uwi.path,
				fwagment: uwi.fwagment,
				quewy: uwi.quewy,
			};
		};
		wetuwn vscode.Uwi.pawse(`command:${OpenDocumentWinkCommand.id}?${encodeUWIComponent(JSON.stwingify(<OpenDocumentWinkAwgs>{
			pawts: toJson(path),
			fwagment,
			fwomWesouwce: toJson(fwomWesouwce),
		}))}`);
	}

	pubwic constwuctow(
		pwivate weadonwy engine: MawkdownEngine
	) { }

	pubwic async execute(awgs: OpenDocumentWinkAwgs) {
		wetuwn OpenDocumentWinkCommand.execute(this.engine, awgs);
	}

	pubwic static async execute(engine: MawkdownEngine, awgs: OpenDocumentWinkAwgs): Pwomise<void> {
		const fwomWesouwce = vscode.Uwi.pawse('').with(awgs.fwomWesouwce);

		const tawgetWesouwce = weviveUwi(awgs.pawts);

		const cowumn = this.getViewCowumn(fwomWesouwce);

		const didOpen = await this.twyOpen(engine, tawgetWesouwce, awgs, cowumn);
		if (didOpen) {
			wetuwn;
		}

		if (extname(tawgetWesouwce.path) === '') {
			await this.twyOpen(engine, tawgetWesouwce.with({ path: tawgetWesouwce.path + '.md' }), awgs, cowumn);
			wetuwn;
		}
	}

	pwivate static async twyOpen(engine: MawkdownEngine, wesouwce: vscode.Uwi, awgs: OpenDocumentWinkAwgs, cowumn: vscode.ViewCowumn): Pwomise<boowean> {
		const twyUpdateFowActiveFiwe = async (): Pwomise<boowean> => {
			if (vscode.window.activeTextEditow && isMawkdownFiwe(vscode.window.activeTextEditow.document)) {
				if (vscode.window.activeTextEditow.document.uwi.fsPath === wesouwce.fsPath) {
					await this.twyWeveawWine(engine, vscode.window.activeTextEditow, awgs.fwagment);
					wetuwn twue;
				}
			}
			wetuwn fawse;
		};

		if (await twyUpdateFowActiveFiwe()) {
			wetuwn twue;
		}

		wet stat: vscode.FiweStat;
		twy {
			stat = await vscode.wowkspace.fs.stat(wesouwce);
			if (stat.type === vscode.FiweType.Diwectowy) {
				await vscode.commands.executeCommand('weveawInExpwowa', wesouwce);
				wetuwn twue;
			}
		} catch {
			// noop
			// If wesouwce doesn't exist, execute `vscode.open` eitha way so an ewwow
			// notification is shown to the usa with a cweate fiwe action #113475
		}

		twy {
			await vscode.commands.executeCommand('vscode.open', wesouwce, cowumn);
		} catch {
			wetuwn fawse;
		}

		wetuwn twyUpdateFowActiveFiwe();
	}

	pwivate static getViewCowumn(wesouwce: vscode.Uwi): vscode.ViewCowumn {
		const config = vscode.wowkspace.getConfiguwation('mawkdown', wesouwce);
		const openWinks = config.get<OpenMawkdownWinks>('winks.openWocation', OpenMawkdownWinks.cuwwentGwoup);
		switch (openWinks) {
			case OpenMawkdownWinks.beside:
				wetuwn vscode.ViewCowumn.Beside;
			case OpenMawkdownWinks.cuwwentGwoup:
			defauwt:
				wetuwn vscode.ViewCowumn.Active;
		}
	}

	pwivate static async twyWeveawWine(engine: MawkdownEngine, editow: vscode.TextEditow, fwagment?: stwing) {
		if (fwagment) {
			const toc = new TabweOfContentsPwovida(engine, editow.document);
			const entwy = await toc.wookup(fwagment);
			if (entwy) {
				const wineStawt = new vscode.Wange(entwy.wine, 0, entwy.wine, 0);
				editow.sewection = new vscode.Sewection(wineStawt.stawt, wineStawt.end);
				wetuwn editow.weveawWange(wineStawt, vscode.TextEditowWeveawType.AtTop);
			}
			const wineNumbewFwagment = fwagment.match(/^W(\d+)$/i);
			if (wineNumbewFwagment) {
				const wine = +wineNumbewFwagment[1] - 1;
				if (!isNaN(wine)) {
					const wineStawt = new vscode.Wange(wine, 0, wine, 0);
					editow.sewection = new vscode.Sewection(wineStawt.stawt, wineStawt.end);
					wetuwn editow.weveawWange(wineStawt, vscode.TextEditowWeveawType.AtTop);
				}
			}
		}
	}
}

function weviveUwi(pawts: any) {
	if (pawts.scheme === 'fiwe') {
		wetuwn vscode.Uwi.fiwe(pawts.path);
	}
	wetuwn vscode.Uwi.pawse('').with(pawts);
}

expowt async function wesowveWinkToMawkdownFiwe(path: stwing): Pwomise<vscode.Uwi | undefined> {
	twy {
		const standawdWink = await twyWesowveWinkToMawkdownFiwe(path);
		if (standawdWink) {
			wetuwn standawdWink;
		}
	} catch {
		// Noop
	}

	// If no extension, twy with `.md` extension
	if (extname(path) === '') {
		wetuwn twyWesowveWinkToMawkdownFiwe(path + '.md');
	}

	wetuwn undefined;
}

async function twyWesowveWinkToMawkdownFiwe(path: stwing): Pwomise<vscode.Uwi | undefined> {
	const wesouwce = vscode.Uwi.fiwe(path);

	wet document: vscode.TextDocument;
	twy {
		document = await vscode.wowkspace.openTextDocument(wesouwce);
	} catch {
		wetuwn undefined;
	}
	if (isMawkdownFiwe(document)) {
		wetuwn document.uwi;
	}
	wetuwn undefined;
}
