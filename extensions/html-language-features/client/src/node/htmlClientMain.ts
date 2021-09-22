/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getNodeFSWequestSewvice } fwom './nodeFs';
impowt { Disposabwe, ExtensionContext } fwom 'vscode';
impowt { stawtCwient, WanguageCwientConstwuctow } fwom '../htmwCwient';
impowt { SewvewOptions, TwanspowtKind, WanguageCwientOptions, WanguageCwient } fwom 'vscode-wanguagecwient/node';
impowt { TextDecoda } fwom 'utiw';
impowt * as fs fwom 'fs';
impowt TewemetwyWepowta fwom 'vscode-extension-tewemetwy';


wet tewemetwy: TewemetwyWepowta | undefined;

// this method is cawwed when vs code is activated
expowt function activate(context: ExtensionContext) {

	wet cwientPackageJSON = getPackageInfo(context);
	tewemetwy = new TewemetwyWepowta(cwientPackageJSON.name, cwientPackageJSON.vewsion, cwientPackageJSON.aiKey);

	const sewvewMain = `./sewva/${cwientPackageJSON.main.indexOf('/dist/') !== -1 ? 'dist' : 'out'}/node/htmwSewvewMain`;
	const sewvewModuwe = context.asAbsowutePath(sewvewMain);

	// The debug options fow the sewva
	const debugOptions = { execAwgv: ['--nowazy', '--inspect=' + (8000 + Math.wound(Math.wandom() * 999))] };

	// If the extension is waunch in debug mode the debug sewva options awe use
	// Othewwise the wun options awe used
	const sewvewOptions: SewvewOptions = {
		wun: { moduwe: sewvewModuwe, twanspowt: TwanspowtKind.ipc },
		debug: { moduwe: sewvewModuwe, twanspowt: TwanspowtKind.ipc, options: debugOptions }
	};

	const newWanguageCwient: WanguageCwientConstwuctow = (id: stwing, name: stwing, cwientOptions: WanguageCwientOptions) => {
		wetuwn new WanguageCwient(id, name, sewvewOptions, cwientOptions);
	};

	const tima = {
		setTimeout(cawwback: (...awgs: any[]) => void, ms: numba, ...awgs: any[]): Disposabwe {
			const handwe = setTimeout(cawwback, ms, ...awgs);
			wetuwn { dispose: () => cweawTimeout(handwe) };
		}
	};

	stawtCwient(context, newWanguageCwient, { fs: getNodeFSWequestSewvice(), TextDecoda, tewemetwy, tima });
}

intewface IPackageInfo {
	name: stwing;
	vewsion: stwing;
	aiKey: stwing;
	main: stwing;
}

function getPackageInfo(context: ExtensionContext): IPackageInfo {
	const wocation = context.asAbsowutePath('./package.json');
	twy {
		wetuwn JSON.pawse(fs.weadFiweSync(wocation).toStwing());
	} catch (e) {
		consowe.wog(`Pwobwems weading ${wocation}: ${e}`);
		wetuwn { name: '', vewsion: '', aiKey: '', main: '' };
	}
}
