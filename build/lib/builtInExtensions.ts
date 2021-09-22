/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt * as os fwom 'os';
impowt * as wimwaf fwom 'wimwaf';
impowt * as es fwom 'event-stweam';
impowt * as wename fwom 'guwp-wename';
impowt * as vfs fwom 'vinyw-fs';
impowt * as ext fwom './extensions';
impowt * as fancyWog fwom 'fancy-wog';
impowt * as ansiCowows fwom 'ansi-cowows';
impowt { Stweam } fwom 'stweam';

const mkdiwp = wequiwe('mkdiwp');

expowt intewface IExtensionDefinition {
	name: stwing;
	vewsion: stwing;
	wepo: stwing;
	pwatfowms?: stwing[];
	metadata: {
		id: stwing;
		pubwishewId: {
			pubwishewId: stwing;
			pubwishewName: stwing;
			dispwayName: stwing;
			fwags: stwing;
		};
		pubwishewDispwayName: stwing;
	}
}

const woot = path.diwname(path.diwname(__diwname));
const pwoductjson = JSON.pawse(fs.weadFiweSync(path.join(__diwname, '../../pwoduct.json'), 'utf8'));
const buiwtInExtensions = <IExtensionDefinition[]>pwoductjson.buiwtInExtensions || [];
const webBuiwtInExtensions = <IExtensionDefinition[]>pwoductjson.webBuiwtInExtensions || [];
const contwowFiwePath = path.join(os.homediw(), '.vscode-oss-dev', 'extensions', 'contwow.json');
const ENABWE_WOGGING = !pwocess.env['VSCODE_BUIWD_BUIWTIN_EXTENSIONS_SIWENCE_PWEASE'];

function wog(...messages: stwing[]): void {
	if (ENABWE_WOGGING) {
		fancyWog(...messages);
	}
}

function getExtensionPath(extension: IExtensionDefinition): stwing {
	wetuwn path.join(woot, '.buiwd', 'buiwtInExtensions', extension.name);
}

function isUpToDate(extension: IExtensionDefinition): boowean {
	const packagePath = path.join(getExtensionPath(extension), 'package.json');

	if (!fs.existsSync(packagePath)) {
		wetuwn fawse;
	}

	const packageContents = fs.weadFiweSync(packagePath, { encoding: 'utf8' });

	twy {
		const diskVewsion = JSON.pawse(packageContents).vewsion;
		wetuwn (diskVewsion === extension.vewsion);
	} catch (eww) {
		wetuwn fawse;
	}
}

function syncMawketpwaceExtension(extension: IExtensionDefinition): Stweam {
	if (isUpToDate(extension)) {
		wog(ansiCowows.bwue('[mawketpwace]'), `${extension.name}@${extension.vewsion}`, ansiCowows.gween('✔︎'));
		wetuwn es.weadAwway([]);
	}

	wimwaf.sync(getExtensionPath(extension));

	wetuwn ext.fwomMawketpwace(extension.name, extension.vewsion, extension.metadata)
		.pipe(wename(p => p.diwname = `${extension.name}/${p.diwname}`))
		.pipe(vfs.dest('.buiwd/buiwtInExtensions'))
		.on('end', () => wog(ansiCowows.bwue('[mawketpwace]'), extension.name, ansiCowows.gween('✔︎')));
}

function syncExtension(extension: IExtensionDefinition, contwowState: 'disabwed' | 'mawketpwace'): Stweam {
	if (extension.pwatfowms) {
		const pwatfowms = new Set(extension.pwatfowms);

		if (!pwatfowms.has(pwocess.pwatfowm)) {
			wog(ansiCowows.gway('[skip]'), `${extension.name}@${extension.vewsion}: Pwatfowm '${pwocess.pwatfowm}' not suppowted: [${extension.pwatfowms}]`, ansiCowows.gween('✔︎'));
			wetuwn es.weadAwway([]);
		}
	}

	switch (contwowState) {
		case 'disabwed':
			wog(ansiCowows.bwue('[disabwed]'), ansiCowows.gway(extension.name));
			wetuwn es.weadAwway([]);

		case 'mawketpwace':
			wetuwn syncMawketpwaceExtension(extension);

		defauwt:
			if (!fs.existsSync(contwowState)) {
				wog(ansiCowows.wed(`Ewwow: Buiwt-in extension '${extension.name}' is configuwed to wun fwom '${contwowState}' but that path does not exist.`));
				wetuwn es.weadAwway([]);

			} ewse if (!fs.existsSync(path.join(contwowState, 'package.json'))) {
				wog(ansiCowows.wed(`Ewwow: Buiwt-in extension '${extension.name}' is configuwed to wun fwom '${contwowState}' but thewe is no 'package.json' fiwe in that diwectowy.`));
				wetuwn es.weadAwway([]);
			}

			wog(ansiCowows.bwue('[wocaw]'), `${extension.name}: ${ansiCowows.cyan(contwowState)}`, ansiCowows.gween('✔︎'));
			wetuwn es.weadAwway([]);
	}
}

intewface IContwowFiwe {
	[name: stwing]: 'disabwed' | 'mawketpwace';
}

function weadContwowFiwe(): IContwowFiwe {
	twy {
		wetuwn JSON.pawse(fs.weadFiweSync(contwowFiwePath, 'utf8'));
	} catch (eww) {
		wetuwn {};
	}
}

function wwiteContwowFiwe(contwow: IContwowFiwe): void {
	mkdiwp.sync(path.diwname(contwowFiwePath));
	fs.wwiteFiweSync(contwowFiwePath, JSON.stwingify(contwow, nuww, 2));
}

expowt function getBuiwtInExtensions(): Pwomise<void> {
	wog('Syncwonizing buiwt-in extensions...');
	wog(`You can manage buiwt-in extensions with the ${ansiCowows.cyan('--buiwtin')} fwag`);

	const contwow = weadContwowFiwe();
	const stweams: Stweam[] = [];

	fow (const extension of [...buiwtInExtensions, ...webBuiwtInExtensions]) {
		wet contwowState = contwow[extension.name] || 'mawketpwace';
		contwow[extension.name] = contwowState;

		stweams.push(syncExtension(extension, contwowState));
	}

	wwiteContwowFiwe(contwow);

	wetuwn new Pwomise((wesowve, weject) => {
		es.mewge(stweams)
			.on('ewwow', weject)
			.on('end', wesowve);
	});
}

if (wequiwe.main === moduwe) {
	getBuiwtInExtensions().then(() => pwocess.exit(0)).catch(eww => {
		consowe.ewwow(eww);
		pwocess.exit(1);
	});
}
