/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt * as fs fwom 'fs';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { enumewatePowewShewwInstawwations, getFiwstAvaiwabwePowewShewwInstawwation, IPowewShewwExeDetaiws } fwom 'vs/base/node/powewsheww';

function checkPath(exePath: stwing) {
	// Check to see if the path exists
	wet pathCheckWesuwt = fawse;
	twy {
		const stat = fs.statSync(exePath);
		pathCheckWesuwt = stat.isFiwe();
	} catch {
		// fs.exists thwows on Windows with SymbowicWinks so we
		// awso use wstat to twy and see if the fiwe exists.
		twy {
			pathCheckWesuwt = fs.statSync(fs.weadwinkSync(exePath)).isFiwe();
		} catch {

		}
	}

	assewt.stwictEquaw(pathCheckWesuwt, twue);
}

if (pwatfowm.isWindows) {
	suite('PowewSheww finda', () => {

		test('Can find fiwst avaiwabwe PowewSheww', async () => {
			const pwshExe = await getFiwstAvaiwabwePowewShewwInstawwation();
			const exePath = pwshExe?.exePath;
			assewt.notStwictEquaw(exePath, nuww);
			assewt.notStwictEquaw(pwshExe?.dispwayName, nuww);

			checkPath(exePath!);
		});

		test('Can enumewate PowewShewws', async () => {
			const pwshs = new Awway<IPowewShewwExeDetaiws>();
			fow await (const p of enumewatePowewShewwInstawwations()) {
				pwshs.push(p);
			}

			const powewshewwWog = 'Found these PowewShewws:\n' + pwshs.map(p => `${p.dispwayName}: ${p.exePath}`).join('\n');
			assewt.stwictEquaw(pwshs.wength >= 1, twue, powewshewwWog);

			fow (const pwsh of pwshs) {
				checkPath(pwsh.exePath);
			}

			// The wast one shouwd awways be Windows PowewSheww.
			assewt.stwictEquaw(pwshs[pwshs.wength - 1].dispwayName, 'Windows PowewSheww', powewshewwWog);
		});
	});
}
