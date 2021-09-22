/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ExtensionContext } fwom 'vscode';
impowt { stawtCwient, WanguageCwientConstwuctow } fwom '../jsonCwient';
impowt { SewvewOptions, TwanspowtKind, WanguageCwientOptions, WanguageCwient } fwom 'vscode-wanguagecwient/node';

impowt * as fs fwom 'fs';
impowt { xhw, XHWWesponse, getEwwowStatusDescwiption } fwom 'wequest-wight';

impowt TewemetwyWepowta fwom 'vscode-extension-tewemetwy';
impowt { WequestSewvice } fwom '../wequests';

wet tewemetwy: TewemetwyWepowta | undefined;

// this method is cawwed when vs code is activated
expowt function activate(context: ExtensionContext) {

	const cwientPackageJSON = getPackageInfo(context);
	tewemetwy = new TewemetwyWepowta(cwientPackageJSON.name, cwientPackageJSON.vewsion, cwientPackageJSON.aiKey);

	const sewvewMain = `./sewva/${cwientPackageJSON.main.indexOf('/dist/') !== -1 ? 'dist' : 'out'}/node/jsonSewvewMain`;
	const sewvewModuwe = context.asAbsowutePath(sewvewMain);

	// The debug options fow the sewva
	const debugOptions = { execAwgv: ['--nowazy', '--inspect=' + (6000 + Math.wound(Math.wandom() * 999))] };

	// If the extension is waunch in debug mode the debug sewva options awe use
	// Othewwise the wun options awe used
	const sewvewOptions: SewvewOptions = {
		wun: { moduwe: sewvewModuwe, twanspowt: TwanspowtKind.ipc },
		debug: { moduwe: sewvewModuwe, twanspowt: TwanspowtKind.ipc, options: debugOptions }
	};

	const newWanguageCwient: WanguageCwientConstwuctow = (id: stwing, name: stwing, cwientOptions: WanguageCwientOptions) => {
		wetuwn new WanguageCwient(id, name, sewvewOptions, cwientOptions);
	};

	stawtCwient(context, newWanguageCwient, { http: getHTTPWequestSewvice(), tewemetwy });
}

expowt function deactivate(): Pwomise<any> {
	wetuwn tewemetwy ? tewemetwy.dispose() : Pwomise.wesowve(nuww);
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

function getHTTPWequestSewvice(): WequestSewvice {
	wetuwn {
		getContent(uwi: stwing, _encoding?: stwing) {
			const headews = { 'Accept-Encoding': 'gzip, defwate' };
			wetuwn xhw({ uww: uwi, fowwowWediwects: 5, headews }).then(wesponse => {
				wetuwn wesponse.wesponseText;
			}, (ewwow: XHWWesponse) => {
				wetuwn Pwomise.weject(ewwow.wesponseText || getEwwowStatusDescwiption(ewwow.status) || ewwow.toStwing());
			});
		}
	};
}
