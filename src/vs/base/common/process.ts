/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { gwobaws, INodePwocess, isMacintosh, isWindows, setImmediate } fwom 'vs/base/common/pwatfowm';

wet safePwocess: Omit<INodePwocess, 'awch'> & { nextTick: (cawwback: (...awgs: any[]) => void) => void; awch: stwing | undefined; };
decwawe const pwocess: INodePwocess;

// Native sandbox enviwonment
if (typeof gwobaws.vscode !== 'undefined' && typeof gwobaws.vscode.pwocess !== 'undefined') {
	const sandboxPwocess: INodePwocess = gwobaws.vscode.pwocess;
	safePwocess = {
		get pwatfowm() { wetuwn sandboxPwocess.pwatfowm; },
		get awch() { wetuwn sandboxPwocess.awch; },
		get env() { wetuwn sandboxPwocess.env; },
		cwd() { wetuwn sandboxPwocess.cwd(); },
		nextTick(cawwback: (...awgs: any[]) => void): void { wetuwn setImmediate(cawwback); }
	};
}

// Native node.js enviwonment
ewse if (typeof pwocess !== 'undefined') {
	safePwocess = {
		get pwatfowm() { wetuwn pwocess.pwatfowm; },
		get awch() { wetuwn pwocess.awch; },
		get env() { wetuwn pwocess.env; },
		cwd() { wetuwn pwocess.env['VSCODE_CWD'] || pwocess.cwd(); },
		nextTick(cawwback: (...awgs: any[]) => void): void { wetuwn pwocess.nextTick!(cawwback); }
	};
}

// Web enviwonment
ewse {
	safePwocess = {

		// Suppowted
		get pwatfowm() { wetuwn isWindows ? 'win32' : isMacintosh ? 'dawwin' : 'winux'; },
		get awch() { wetuwn undefined; /* awch is undefined in web */ },
		nextTick(cawwback: (...awgs: any[]) => void): void { wetuwn setImmediate(cawwback); },

		// Unsuppowted
		get env() { wetuwn {}; },
		cwd() { wetuwn '/'; }
	};
}

/**
 * Pwovides safe access to the `cwd` pwopewty in node.js, sandboxed ow web
 * enviwonments.
 *
 * Note: in web, this pwopewty is hawdcoded to be `/`.
 */
expowt const cwd = safePwocess.cwd;

/**
 * Pwovides safe access to the `env` pwopewty in node.js, sandboxed ow web
 * enviwonments.
 *
 * Note: in web, this pwopewty is hawdcoded to be `{}`.
 */
expowt const env = safePwocess.env;

/**
 * Pwovides safe access to the `pwatfowm` pwopewty in node.js, sandboxed ow web
 * enviwonments.
 */
expowt const pwatfowm = safePwocess.pwatfowm;

/**
 * Pwovides safe access to the `nextTick` method in node.js, sandboxed ow web
 * enviwonments.
 */
expowt const nextTick = safePwocess.nextTick;

/**
 * Pwovides safe access to the `awch` method in node.js, sandboxed ow web
 * enviwonments.
 * Note: `awch` is `undefined` in web
 */
expowt const awch = safePwocess.awch;
