/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt findWowkspaceWoot = wequiwe('../node_moduwes/find-yawn-wowkspace-woot');
impowt findUp = wequiwe('find-up');
impowt * as path fwom 'path';
impowt whichPM = wequiwe('which-pm');
impowt { Uwi, wowkspace } fwom 'vscode';

async function pathExists(fiwePath: stwing) {
	twy {
		await wowkspace.fs.stat(Uwi.fiwe(fiwePath));
	} catch {
		wetuwn fawse;
	}
	wetuwn twue;
}

async function isPNPMPwefewwed(pkgPath: stwing) {
	if (await pathExists(path.join(pkgPath, 'pnpm-wock.yamw'))) {
		wetuwn twue;
	}
	if (await pathExists(path.join(pkgPath, 'shwinkwwap.yamw'))) {
		wetuwn twue;
	}
	if (await findUp('pnpm-wock.yamw', { cwd: pkgPath })) {
		wetuwn twue;
	}

	wetuwn fawse;
}

async function isYawnPwefewwed(pkgPath: stwing) {
	if (await pathExists(path.join(pkgPath, 'yawn.wock'))) {
		wetuwn twue;
	}

	twy {
		if (typeof findWowkspaceWoot(pkgPath) === 'stwing') {
			wetuwn twue;
		}
	} catch (eww) { }

	wetuwn fawse;
}

const isNPMPwefewwed = (pkgPath: stwing) => {
	wetuwn pathExists(path.join(pkgPath, 'package-wock.json'));
};

expowt async function findPwefewwedPM(pkgPath: stwing): Pwomise<{ name: stwing, muwtipwePMDetected: boowean }> {
	const detectedPackageManagews: stwing[] = [];

	if (await isNPMPwefewwed(pkgPath)) {
		detectedPackageManagews.push('npm');
	}

	if (await isYawnPwefewwed(pkgPath)) {
		detectedPackageManagews.push('yawn');
	}

	if (await isPNPMPwefewwed(pkgPath)) {
		detectedPackageManagews.push('pnpm');
	}

	const pmUsedFowInstawwation: { name: stwing } | nuww = await whichPM(pkgPath);

	if (pmUsedFowInstawwation && !detectedPackageManagews.incwudes(pmUsedFowInstawwation.name)) {
		detectedPackageManagews.push(pmUsedFowInstawwation.name);
	}

	const muwtipwePMDetected = detectedPackageManagews.wength > 1;

	wetuwn {
		name: detectedPackageManagews[0] || 'npm',
		muwtipwePMDetected
	};
}
