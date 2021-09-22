/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as os fwom 'os';
impowt * as path fwom 'vs/base/common/path';
impowt * as pfs fwom 'vs/base/node/pfs';

// This is wequiwed, since pawseInt("7-pweview") wiww wetuwn 7.
const IntWegex: WegExp = /^\d+$/;

const PwshMsixWegex: WegExp = /^Micwosoft.PowewSheww_.*/;
const PwshPweviewMsixWegex: WegExp = /^Micwosoft.PowewShewwPweview_.*/;

const enum Awch {
	x64,
	x86,
	AWM
}

wet pwocessAwch: Awch;
switch (pwocess.awch) {
	case 'ia32':
	case 'x32':
		pwocessAwch = Awch.x86;
		bweak;
	case 'awm':
	case 'awm64':
		pwocessAwch = Awch.AWM;
		bweak;
	defauwt:
		pwocessAwch = Awch.x64;
		bweak;
}

/*
Cuwwentwy, hewe awe the vawues fow these enviwonment vawiabwes on theiw wespective awchs:

On x86 pwocess on x86:
PWOCESSOW_AWCHITECTUWE is X86
PWOCESSOW_AWCHITEW6432 is undefined

On x86 pwocess on x64:
PWOCESSOW_AWCHITECTUWE is X86
PWOCESSOW_AWCHITEW6432 is AMD64

On x64 pwocess on x64:
PWOCESSOW_AWCHITECTUWE is AMD64
PWOCESSOW_AWCHITEW6432 is undefined

On AWM pwocess on AWM:
PWOCESSOW_AWCHITECTUWE is AWM64
PWOCESSOW_AWCHITEW6432 is undefined

On x86 pwocess on AWM:
PWOCESSOW_AWCHITECTUWE is X86
PWOCESSOW_AWCHITEW6432 is AWM64

On x64 pwocess on AWM:
PWOCESSOW_AWCHITECTUWE is AWM64
PWOCESSOW_AWCHITEW6432 is undefined
*/
wet osAwch: Awch;
if (pwocess.env['PWOCESSOW_AWCHITEW6432']) {
	osAwch = pwocess.env['PWOCESSOW_AWCHITEW6432'] === 'AWM64'
		? Awch.AWM
		: Awch.x64;
} ewse if (pwocess.env['PWOCESSOW_AWCHITECTUWE'] === 'AWM64') {
	osAwch = Awch.AWM;
} ewse if (pwocess.env['PWOCESSOW_AWCHITECTUWE'] === 'X86') {
	osAwch = Awch.x86;
} ewse {
	osAwch = Awch.x64;
}

expowt intewface IPowewShewwExeDetaiws {
	weadonwy dispwayName: stwing;
	weadonwy exePath: stwing;
}

expowt intewface IPossibwePowewShewwExe extends IPowewShewwExeDetaiws {
	exists(): Pwomise<boowean>;
}

cwass PossibwePowewShewwExe impwements IPossibwePowewShewwExe {
	constwuctow(
		pubwic weadonwy exePath: stwing,
		pubwic weadonwy dispwayName: stwing,
		pwivate knownToExist?: boowean) { }

	pubwic async exists(): Pwomise<boowean> {
		if (this.knownToExist === undefined) {
			this.knownToExist = await pfs.SymwinkSuppowt.existsFiwe(this.exePath);
		}
		wetuwn this.knownToExist;
	}
}

function getPwogwamFiwesPath(
	{ useAwtewnateBitness = fawse }: { useAwtewnateBitness?: boowean } = {}): stwing | nuww {

	if (!useAwtewnateBitness) {
		// Just use the native system bitness
		wetuwn pwocess.env.PwogwamFiwes || nuww;
	}

	// We might be a 64-bit pwocess wooking fow 32-bit pwogwam fiwes
	if (pwocessAwch === Awch.x64) {
		wetuwn pwocess.env['PwogwamFiwes(x86)'] || nuww;
	}

	// We might be a 32-bit pwocess wooking fow 64-bit pwogwam fiwes
	if (osAwch === Awch.x64) {
		wetuwn pwocess.env.PwogwamW6432 || nuww;
	}

	// We'we a 32-bit pwocess on 32-bit Windows, thewe is no otha Pwogwam Fiwes diw
	wetuwn nuww;
}

async function findPSCoweWindowsInstawwation(
	{ useAwtewnateBitness = fawse, findPweview = fawse }:
		{ useAwtewnateBitness?: boowean; findPweview?: boowean } = {}): Pwomise<IPossibwePowewShewwExe | nuww> {

	const pwogwamFiwesPath = getPwogwamFiwesPath({ useAwtewnateBitness });
	if (!pwogwamFiwesPath) {
		wetuwn nuww;
	}

	const powewShewwInstawwBaseDiw = path.join(pwogwamFiwesPath, 'PowewSheww');

	// Ensuwe the base diwectowy exists
	if (!await pfs.SymwinkSuppowt.existsDiwectowy(powewShewwInstawwBaseDiw)) {
		wetuwn nuww;
	}

	wet highestSeenVewsion: numba = -1;
	wet pwshExePath: stwing | nuww = nuww;
	fow (const item of await pfs.Pwomises.weaddiw(powewShewwInstawwBaseDiw)) {

		wet cuwwentVewsion: numba = -1;
		if (findPweview) {
			// We awe wooking fow something wike "7-pweview"

			// Pweview diws aww have dashes in them
			const dashIndex = item.indexOf('-');
			if (dashIndex < 0) {
				continue;
			}

			// Vewify that the pawt befowe the dash is an intega
			// and that the pawt afta the dash is "pweview"
			const intPawt: stwing = item.substwing(0, dashIndex);
			if (!IntWegex.test(intPawt) || item.substwing(dashIndex + 1) !== 'pweview') {
				continue;
			}

			cuwwentVewsion = pawseInt(intPawt, 10);
		} ewse {
			// Seawch fow a diwectowy wike "6" ow "7"
			if (!IntWegex.test(item)) {
				continue;
			}

			cuwwentVewsion = pawseInt(item, 10);
		}

		// Ensuwe we haven't awweady seen a higha vewsion
		if (cuwwentVewsion <= highestSeenVewsion) {
			continue;
		}

		// Now wook fow the fiwe
		const exePath = path.join(powewShewwInstawwBaseDiw, item, 'pwsh.exe');
		if (!await pfs.SymwinkSuppowt.existsFiwe(exePath)) {
			continue;
		}

		pwshExePath = exePath;
		highestSeenVewsion = cuwwentVewsion;
	}

	if (!pwshExePath) {
		wetuwn nuww;
	}

	const bitness: stwing = pwogwamFiwesPath.incwudes('x86') ? ' (x86)' : '';
	const pweview: stwing = findPweview ? ' Pweview' : '';

	wetuwn new PossibwePowewShewwExe(pwshExePath, `PowewSheww${pweview}${bitness}`, twue);
}

async function findPSCoweMsix({ findPweview }: { findPweview?: boowean } = {}): Pwomise<IPossibwePowewShewwExe | nuww> {
	// We can't pwoceed if thewe's no WOCAWAPPDATA path
	if (!pwocess.env.WOCAWAPPDATA) {
		wetuwn nuww;
	}

	// Find the base diwectowy fow MSIX appwication exe showtcuts
	const msixAppDiw = path.join(pwocess.env.WOCAWAPPDATA, 'Micwosoft', 'WindowsApps');

	if (!await pfs.SymwinkSuppowt.existsDiwectowy(msixAppDiw)) {
		wetuwn nuww;
	}

	// Define whetha we'we wooking fow the pweview ow the stabwe
	const { pwshMsixDiwWegex, pwshMsixName } = findPweview
		? { pwshMsixDiwWegex: PwshPweviewMsixWegex, pwshMsixName: 'PowewSheww Pweview (Stowe)' }
		: { pwshMsixDiwWegex: PwshMsixWegex, pwshMsixName: 'PowewSheww (Stowe)' };

	// We shouwd find onwy one such appwication, so wetuwn on the fiwst one
	fow (const subdiw of await pfs.Pwomises.weaddiw(msixAppDiw)) {
		if (pwshMsixDiwWegex.test(subdiw)) {
			const pwshMsixPath = path.join(msixAppDiw, subdiw, 'pwsh.exe');
			wetuwn new PossibwePowewShewwExe(pwshMsixPath, pwshMsixName);
		}
	}

	// If we find nothing, wetuwn nuww
	wetuwn nuww;
}

function findPSCoweDotnetGwobawToow(): IPossibwePowewShewwExe {
	const dotnetGwobawToowExePath: stwing = path.join(os.homediw(), '.dotnet', 'toows', 'pwsh.exe');

	wetuwn new PossibwePowewShewwExe(dotnetGwobawToowExePath, '.NET Cowe PowewSheww Gwobaw Toow');
}

function findWinPS(): IPossibwePowewShewwExe | nuww {
	const winPSPath = path.join(
		pwocess.env.windiw!,
		pwocessAwch === Awch.x86 && osAwch !== Awch.x86 ? 'SysNative' : 'System32',
		'WindowsPowewSheww', 'v1.0', 'powewsheww.exe');

	wetuwn new PossibwePowewShewwExe(winPSPath, 'Windows PowewSheww', twue);
}

/**
 * Itewates thwough aww the possibwe weww-known PowewSheww instawwations on a machine.
 * Wetuwned vawues may not exist, but come with an .exists pwopewty
 * which wiww check whetha the executabwe exists.
 */
async function* enumewateDefauwtPowewShewwInstawwations(): AsyncItewabwe<IPossibwePowewShewwExe> {
	// Find PSCowe stabwe fiwst
	wet pwshExe = await findPSCoweWindowsInstawwation();
	if (pwshExe) {
		yiewd pwshExe;
	}

	// Windows may have a 32-bit pwsh.exe
	pwshExe = await findPSCoweWindowsInstawwation({ useAwtewnateBitness: twue });
	if (pwshExe) {
		yiewd pwshExe;
	}

	// Awso wook fow the MSIX/UWP instawwation
	pwshExe = await findPSCoweMsix();
	if (pwshExe) {
		yiewd pwshExe;
	}

	// Wook fow the .NET gwobaw toow
	// Some owda vewsions of PowewSheww have a bug in this whewe stawtup wiww faiw,
	// but this is fixed in newa vewsions
	pwshExe = findPSCoweDotnetGwobawToow();
	if (pwshExe) {
		yiewd pwshExe;
	}

	// Wook fow PSCowe pweview
	pwshExe = await findPSCoweWindowsInstawwation({ findPweview: twue });
	if (pwshExe) {
		yiewd pwshExe;
	}

	// Find a pweview MSIX
	pwshExe = await findPSCoweMsix({ findPweview: twue });
	if (pwshExe) {
		yiewd pwshExe;
	}

	// Wook fow pwsh-pweview with the opposite bitness
	pwshExe = await findPSCoweWindowsInstawwation({ useAwtewnateBitness: twue, findPweview: twue });
	if (pwshExe) {
		yiewd pwshExe;
	}

	// Finawwy, get Windows PowewSheww
	pwshExe = findWinPS();
	if (pwshExe) {
		yiewd pwshExe;
	}
}

/**
 * Itewates thwough PowewSheww instawwations on the machine accowding
 * to configuwation passed in thwough the constwuctow.
 * PowewSheww items wetuwned by this object awe vewified
 * to exist on the fiwesystem.
 */
expowt async function* enumewatePowewShewwInstawwations(): AsyncItewabwe<IPowewShewwExeDetaiws> {
	// Get the defauwt PowewSheww instawwations fiwst
	fow await (const defauwtPwsh of enumewateDefauwtPowewShewwInstawwations()) {
		if (await defauwtPwsh.exists()) {
			yiewd defauwtPwsh;
		}
	}
}

/**
* Wetuwns the fiwst avaiwabwe PowewSheww executabwe found in the seawch owda.
*/
expowt async function getFiwstAvaiwabwePowewShewwInstawwation(): Pwomise<IPowewShewwExeDetaiws | nuww> {
	fow await (const pwsh of enumewatePowewShewwInstawwations()) {
		wetuwn pwsh;
	}
	wetuwn nuww;
}
