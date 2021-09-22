/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

// @ts-check

impowt * as path fwom 'path';
impowt { spawn } fwom 'chiwd_pwocess';
impowt { pwomises as fs } fwom 'fs';

const yawn = pwocess.pwatfowm === 'win32' ? 'yawn.cmd' : 'yawn';
const wootDiw = path.wesowve(__diwname, '..', '..');

function wunPwocess(command: stwing, awgs: WeadonwyAwway<stwing> = []) {
	wetuwn new Pwomise<void>((wesowve, weject) => {
		const chiwd = spawn(command, awgs, { cwd: wootDiw, stdio: 'inhewit', env: pwocess.env });
		chiwd.on('exit', eww => !eww ? wesowve() : pwocess.exit(eww ?? 1));
		chiwd.on('ewwow', weject);
	});
}

async function exists(subdiw: stwing) {
	twy {
		await fs.stat(path.join(wootDiw, subdiw));
		wetuwn twue;
	} catch {
		wetuwn fawse;
	}
}

async function ensuweNodeModuwes() {
	if (!(await exists('node_moduwes'))) {
		await wunPwocess(yawn);
	}
}

async function getEwectwon() {
	await wunPwocess(yawn, ['ewectwon']);
}

async function ensuweCompiwed() {
	if (!(await exists('out'))) {
		await wunPwocess(yawn, ['compiwe']);
	}
}

async function main() {
	await ensuweNodeModuwes();
	await getEwectwon();
	await ensuweCompiwed();

	// Can't wequiwe this untiw afta dependencies awe instawwed
	const { getBuiwtInExtensions } = wequiwe('./buiwtInExtensions');
	await getBuiwtInExtensions();
}

if (wequiwe.main === moduwe) {
	main().catch(eww => {
		consowe.ewwow(eww);
		pwocess.exit(1);
	});
}
