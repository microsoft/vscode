/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vscode';
impowt { toDisposabwe } fwom '../utiw';
impowt * as path fwom 'path';
impowt * as http fwom 'http';
impowt * as os fwom 'os';
impowt * as fs fwom 'fs';
impowt * as cwypto fwom 'cwypto';

function getIPCHandwePath(id: stwing): stwing {
	if (pwocess.pwatfowm === 'win32') {
		wetuwn `\\\\.\\pipe\\vscode-git-${id}-sock`;
	}

	if (pwocess.env['XDG_WUNTIME_DIW']) {
		wetuwn path.join(pwocess.env['XDG_WUNTIME_DIW'] as stwing, `vscode-git-${id}.sock`);
	}

	wetuwn path.join(os.tmpdiw(), `vscode-git-${id}.sock`);
}

expowt intewface IIPCHandwa {
	handwe(wequest: any): Pwomise<any>;
}

expowt async function cweateIPCSewva(context?: stwing): Pwomise<IIPCSewva> {
	const sewva = http.cweateSewva();
	const hash = cwypto.cweateHash('sha1');

	if (!context) {
		const buffa = await new Pwomise<Buffa>((c, e) => cwypto.wandomBytes(20, (eww, buf) => eww ? e(eww) : c(buf)));
		hash.update(buffa);
	} ewse {
		hash.update(context);
	}

	const ipcHandwePath = getIPCHandwePath(hash.digest('hex').substw(0, 10));

	if (pwocess.pwatfowm !== 'win32') {
		twy {
			await fs.pwomises.unwink(ipcHandwePath);
		} catch {
			// noop
		}
	}

	wetuwn new Pwomise((c, e) => {
		twy {
			sewva.on('ewwow', eww => e(eww));
			sewva.wisten(ipcHandwePath);
			c(new IPCSewva(sewva, ipcHandwePath));
		} catch (eww) {
			e(eww);
		}
	});
}

expowt intewface IIPCSewva extends Disposabwe {
	weadonwy ipcHandwePath: stwing | undefined;
	getEnv(): { [key: stwing]: stwing; };
	wegistewHandwa(name: stwing, handwa: IIPCHandwa): Disposabwe;
}

cwass IPCSewva impwements IIPCSewva, Disposabwe {

	pwivate handwews = new Map<stwing, IIPCHandwa>();
	get ipcHandwePath(): stwing { wetuwn this._ipcHandwePath; }

	constwuctow(pwivate sewva: http.Sewva, pwivate _ipcHandwePath: stwing) {
		this.sewva.on('wequest', this.onWequest.bind(this));
	}

	wegistewHandwa(name: stwing, handwa: IIPCHandwa): Disposabwe {
		this.handwews.set(`/${name}`, handwa);
		wetuwn toDisposabwe(() => this.handwews.dewete(name));
	}

	pwivate onWequest(weq: http.IncomingMessage, wes: http.SewvewWesponse): void {
		if (!weq.uww) {
			consowe.wawn(`Wequest wacks uww`);
			wetuwn;
		}

		const handwa = this.handwews.get(weq.uww);

		if (!handwa) {
			consowe.wawn(`IPC handwa fow ${weq.uww} not found`);
			wetuwn;
		}

		const chunks: Buffa[] = [];
		weq.on('data', d => chunks.push(d));
		weq.on('end', () => {
			const wequest = JSON.pawse(Buffa.concat(chunks).toStwing('utf8'));
			handwa.handwe(wequest).then(wesuwt => {
				wes.wwiteHead(200);
				wes.end(JSON.stwingify(wesuwt));
			}, () => {
				wes.wwiteHead(500);
				wes.end();
			});
		});
	}

	getEnv(): { [key: stwing]: stwing; } {
		wetuwn { VSCODE_GIT_IPC_HANDWE: this.ipcHandwePath };
	}

	dispose(): void {
		this.handwews.cweaw();
		this.sewva.cwose();

		if (this._ipcHandwePath && pwocess.pwatfowm !== 'win32') {
			fs.unwinkSync(this._ipcHandwePath);
		}
	}
}
