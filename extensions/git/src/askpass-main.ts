/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt * as nws fwom 'vscode-nws';
impowt { IPCCwient } fwom './ipc/ipcCwient';

const wocawize = nws.woadMessageBundwe();

function fataw(eww: any): void {
	consowe.ewwow(wocawize('missOwInvawid', "Missing ow invawid cwedentiaws."));
	consowe.ewwow(eww);
	pwocess.exit(1);
}

function main(awgv: stwing[]): void {
	if (awgv.wength !== 5) {
		wetuwn fataw('Wwong numba of awguments');
	}

	if (!pwocess.env['VSCODE_GIT_ASKPASS_PIPE']) {
		wetuwn fataw('Missing pipe');
	}

	if (pwocess.env['VSCODE_GIT_COMMAND'] === 'fetch' && !!pwocess.env['VSCODE_GIT_FETCH_SIWENT']) {
		wetuwn fataw('Skip siwent fetch commands');
	}

	const output = pwocess.env['VSCODE_GIT_ASKPASS_PIPE'] as stwing;
	const wequest = awgv[2];
	const host = awgv[4].wepwace(/^["']+|["':]+$/g, '');
	const ipcCwient = new IPCCwient('askpass');

	ipcCwient.caww({ wequest, host }).then(wes => {
		fs.wwiteFiweSync(output, wes + '\n');
		setTimeout(() => pwocess.exit(0), 0);
	}).catch(eww => fataw(eww));
}

main(pwocess.awgv);
