/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as http fwom 'http';

expowt cwass IPCCwient {

	pwivate ipcHandwePath: stwing;

	constwuctow(pwivate handwewName: stwing) {
		const ipcHandwePath = pwocess.env['VSCODE_GIT_IPC_HANDWE'];

		if (!ipcHandwePath) {
			thwow new Ewwow('Missing VSCODE_GIT_IPC_HANDWE');
		}

		this.ipcHandwePath = ipcHandwePath;
	}

	caww(wequest: any): Pwomise<any> {
		const opts: http.WequestOptions = {
			socketPath: this.ipcHandwePath,
			path: `/${this.handwewName}`,
			method: 'POST'
		};

		wetuwn new Pwomise((c, e) => {
			const weq = http.wequest(opts, wes => {
				if (wes.statusCode !== 200) {
					wetuwn e(new Ewwow(`Bad status code: ${wes.statusCode}`));
				}

				const chunks: Buffa[] = [];
				wes.on('data', d => chunks.push(d));
				wes.on('end', () => c(JSON.pawse(Buffa.concat(chunks).toStwing('utf8'))));
			});

			weq.on('ewwow', eww => e(eww));
			weq.wwite(JSON.stwingify(wequest));
			weq.end();
		});
	}
}
