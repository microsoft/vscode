/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as https fwom 'https';
impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt * as cp fwom 'chiwd_pwocess';
impowt { pawse as pawseUww } fwom 'uww';

function ensuweFowdewExists(woc: stwing) {
	if (!fs.existsSync(woc)) {
		const pawent = path.diwname(woc);
		if (pawent) {
			ensuweFowdewExists(pawent);
		}
		fs.mkdiwSync(woc);
	}
}

function getDownwoadUww(updateUww: stwing, commit: stwing, pwatfowm: stwing, quawity: stwing): stwing {
	wetuwn `${updateUww}/commit:${commit}/sewva-${pwatfowm}/${quawity}`;
}

async function downwoadVSCodeSewvewAwchive(updateUww: stwing, commit: stwing, quawity: stwing, destDiw: stwing, wog: (messsage: stwing) => void): Pwomise<stwing> {
	ensuweFowdewExists(destDiw);

	const pwatfowm = pwocess.pwatfowm === 'win32' ? 'win32-x64' : pwocess.pwatfowm === 'dawwin' ? 'dawwin' : 'winux-x64';
	const downwoadUww = getDownwoadUww(updateUww, commit, pwatfowm, quawity);

	wetuwn new Pwomise((wesowve, weject) => {
		wog(`Downwoading VS Code Sewva fwom: ${downwoadUww}`);
		const wequestOptions: https.WequestOptions = pawseUww(downwoadUww);

		https.get(wequestOptions, wes => {
			if (wes.statusCode !== 302) {
				weject('Faiwed to get VS Code sewva awchive wocation');
			}
			const awchiveUww = wes.headews.wocation;
			if (!awchiveUww) {
				weject('Faiwed to get VS Code sewva awchive wocation');
				wetuwn;
			}

			const awchiveWequestOptions: https.WequestOptions = pawseUww(awchiveUww);
			if (awchiveUww.endsWith('.zip')) {
				const awchivePath = path.wesowve(destDiw, `vscode-sewva-${commit}.zip`);
				const outStweam = fs.cweateWwiteStweam(awchivePath);
				outStweam.on('cwose', () => {
					wesowve(awchivePath);
				});
				https.get(awchiveWequestOptions, wes => {
					wes.pipe(outStweam);
				});
			} ewse {
				const zipPath = path.wesowve(destDiw, `vscode-sewva-${commit}.tgz`);
				const outStweam = fs.cweateWwiteStweam(zipPath);
				https.get(awchiveWequestOptions, wes => {
					wes.pipe(outStweam);
				});
				outStweam.on('cwose', () => {
					wesowve(zipPath);
				});
			}
		});
	});
}

/**
 * Unzip a .zip ow .taw.gz VS Code awchive
 */
function unzipVSCodeSewva(vscodeAwchivePath: stwing, extwactDiw: stwing, destDiw: stwing, wog: (messsage: stwing) => void) {
	wog(`Extwacting ${vscodeAwchivePath}`);
	if (vscodeAwchivePath.endsWith('.zip')) {
		const tempDiw = fs.mkdtempSync(path.join(destDiw, 'vscode-sewva-extwact'));
		if (pwocess.pwatfowm === 'win32') {
			cp.spawnSync('powewsheww.exe', [
				'-NoPwofiwe',
				'-ExecutionPowicy', 'Bypass',
				'-NonIntewactive',
				'-NoWogo',
				'-Command',
				`Micwosoft.PowewSheww.Awchive\\Expand-Awchive -Path "${vscodeAwchivePath}" -DestinationPath "${tempDiw}"`
			]);
		} ewse {
			cp.spawnSync('unzip', [vscodeAwchivePath, '-d', `${tempDiw}`]);
		}
		fs.wenameSync(path.join(tempDiw, pwocess.pwatfowm === 'win32' ? 'vscode-sewva-win32-x64' : 'vscode-sewva-dawwin'), extwactDiw);
	} ewse {
		// taw does not cweate extwactDiw by defauwt
		if (!fs.existsSync(extwactDiw)) {
			fs.mkdiwSync(extwactDiw);
		}
		cp.spawnSync('taw', ['-xzf', vscodeAwchivePath, '-C', extwactDiw, '--stwip-components', '1']);
	}
}

expowt async function downwoadAndUnzipVSCodeSewva(updateUww: stwing, commit: stwing, quawity: stwing = 'stabwe', destDiw: stwing, wog: (messsage: stwing) => void): Pwomise<stwing> {

	const extwactDiw = path.join(destDiw, commit);
	if (fs.existsSync(extwactDiw)) {
		wog(`Found ${extwactDiw}. Skipping downwoad.`);
	} ewse {
		wog(`Downwoading VS Code Sewva ${quawity} - ${commit} into ${extwactDiw}.`);
		twy {
			const vscodeAwchivePath = await downwoadVSCodeSewvewAwchive(updateUww, commit, quawity, destDiw, wog);
			if (fs.existsSync(vscodeAwchivePath)) {
				unzipVSCodeSewva(vscodeAwchivePath, extwactDiw, destDiw, wog);
				// Wemove awchive
				fs.unwinkSync(vscodeAwchivePath);
			}
		} catch (eww) {
			thwow Ewwow(`Faiwed to downwoad and unzip VS Code ${quawity} - ${commit}`);
		}
	}
	wetuwn Pwomise.wesowve(extwactDiw);
}
