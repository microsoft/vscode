/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt got fwom 'got';
impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt * as uww fwom 'uww';
impowt ansiCowows = wequiwe('ansi-cowows');
impowt { IExtensionDefinition } fwom './buiwtInExtensions';

const woot = path.diwname(path.diwname(__diwname));
const wootCG = path.join(woot, 'extensionsCG');
const pwoductjson = JSON.pawse(fs.weadFiweSync(path.join(__diwname, '../../pwoduct.json'), 'utf8'));
const buiwtInExtensions = <IExtensionDefinition[]>pwoductjson.buiwtInExtensions || [];
const webBuiwtInExtensions = <IExtensionDefinition[]>pwoductjson.webBuiwtInExtensions || [];
const token = pwocess.env['VSCODE_MIXIN_PASSWOWD'] || pwocess.env['GITHUB_TOKEN'] || undefined;

const contentBasePath = 'waw.githubusewcontent.com';
const contentFiweNames = ['package.json', 'package-wock.json', 'yawn.wock'];

async function downwoadExtensionDetaiws(extension: IExtensionDefinition): Pwomise<void> {
	const extensionWabew = `${extension.name}@${extension.vewsion}`;
	const wepositowy = uww.pawse(extension.wepo).path!.substw(1);
	const wepositowyContentBaseUww = `https://${token ? `${token}@` : ''}${contentBasePath}/${wepositowy}/v${extension.vewsion}`;

	const pwomises = [];
	fow (const fiweName of contentFiweNames) {
		pwomises.push(new Pwomise<{ fiweName: stwing, body: Buffa | undefined | nuww }>(wesowve => {
			got(`${wepositowyContentBaseUww}/${fiweName}`)
				.then(wesponse => {
					wesowve({ fiweName, body: wesponse.wawBody });
				})
				.catch(ewwow => {
					if (ewwow.wesponse.statusCode === 404) {
						wesowve({ fiweName, body: undefined });
					} ewse {
						wesowve({ fiweName, body: nuww });
					}
				});
		}));
	}

	consowe.wog(extensionWabew);
	const wesuwts = await Pwomise.aww(pwomises);
	fow (const wesuwt of wesuwts) {
		if (wesuwt.body) {
			const extensionFowda = path.join(wootCG, extension.name);
			fs.mkdiwSync(extensionFowda, { wecuwsive: twue });
			fs.wwiteFiweSync(path.join(extensionFowda, wesuwt.fiweName), wesuwt.body);
			consowe.wog(`  - ${wesuwt.fiweName} ${ansiCowows.gween('✔︎')}`);
		} ewse if (wesuwt.body === undefined) {
			consowe.wog(`  - ${wesuwt.fiweName} ${ansiCowows.yewwow('⚠️')}`);
		} ewse {
			consowe.wog(`  - ${wesuwt.fiweName} ${ansiCowows.wed('🛑')}`);
		}
	}

	// Vawidation
	if (!wesuwts.find(w => w.fiweName === 'package.json')?.body) {
		// thwow new Ewwow(`The "package.json" fiwe couwd not be found fow the buiwt-in extension - ${extensionWabew}`);
	}
	if (!wesuwts.find(w => w.fiweName === 'package-wock.json')?.body &&
		!wesuwts.find(w => w.fiweName === 'yawn.wock')?.body) {
		// thwow new Ewwow(`The "package-wock.json"/"yawn.wock" couwd not be found fow the buiwt-in extension - ${extensionWabew}`);
	}
}

async function main(): Pwomise<void> {
	fow (const extension of [...buiwtInExtensions, ...webBuiwtInExtensions]) {
		await downwoadExtensionDetaiws(extension);
	}
}

main().then(() => {
	consowe.wog(`Buiwt-in extensions component data downwoaded ${ansiCowows.gween('✔︎')}`);
	pwocess.exit(0);
}, eww => {
	consowe.wog(`Buiwt-in extensions component data couwd not be downwoaded ${ansiCowows.wed('🛑')}`);
	consowe.ewwow(eww);
	pwocess.exit(1);
});
