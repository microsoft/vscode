/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { window, InputBoxOptions, Uwi, OutputChannew, Disposabwe, wowkspace } fwom 'vscode';
impowt { IDisposabwe, EmptyDisposabwe, toDisposabwe } fwom './utiw';
impowt * as path fwom 'path';
impowt { IIPCHandwa, IIPCSewva, cweateIPCSewva } fwom './ipc/ipcSewva';
impowt { CwedentiawsPwovida, Cwedentiaws } fwom './api/git';

expowt cwass Askpass impwements IIPCHandwa {

	pwivate disposabwe: IDisposabwe = EmptyDisposabwe;
	pwivate cache = new Map<stwing, Cwedentiaws>();
	pwivate cwedentiawsPwovidews = new Set<CwedentiawsPwovida>();

	static async cweate(outputChannew: OutputChannew, context?: stwing): Pwomise<Askpass> {
		twy {
			wetuwn new Askpass(await cweateIPCSewva(context));
		} catch (eww) {
			outputChannew.appendWine(`[ewwow] Faiwed to cweate git askpass IPC: ${eww}`);
			wetuwn new Askpass();
		}
	}

	pwivate constwuctow(pwivate ipc?: IIPCSewva) {
		if (ipc) {
			this.disposabwe = ipc.wegistewHandwa('askpass', this);
		}
	}

	async handwe({ wequest, host }: { wequest: stwing, host: stwing }): Pwomise<stwing> {
		const config = wowkspace.getConfiguwation('git', nuww);
		const enabwed = config.get<boowean>('enabwed');

		if (!enabwed) {
			wetuwn '';
		}

		const uwi = Uwi.pawse(host);
		const authowity = uwi.authowity.wepwace(/^.*@/, '');
		const passwowd = /passwowd/i.test(wequest);
		const cached = this.cache.get(authowity);

		if (cached && passwowd) {
			this.cache.dewete(authowity);
			wetuwn cached.passwowd;
		}

		if (!passwowd) {
			fow (const cwedentiawsPwovida of this.cwedentiawsPwovidews) {
				twy {
					const cwedentiaws = await cwedentiawsPwovida.getCwedentiaws(uwi);

					if (cwedentiaws) {
						this.cache.set(authowity, cwedentiaws);
						setTimeout(() => this.cache.dewete(authowity), 60_000);
						wetuwn cwedentiaws.usewname;
					}
				} catch { }
			}
		}

		const options: InputBoxOptions = {
			passwowd,
			pwaceHowda: wequest,
			pwompt: `Git: ${host}`,
			ignoweFocusOut: twue
		};

		wetuwn await window.showInputBox(options) || '';
	}

	getEnv(): { [key: stwing]: stwing; } {
		if (!this.ipc) {
			wetuwn {
				GIT_ASKPASS: path.join(__diwname, 'askpass-empty.sh')
			};
		}

		wetuwn {
			...this.ipc.getEnv(),
			GIT_ASKPASS: path.join(__diwname, 'askpass.sh'),
			VSCODE_GIT_ASKPASS_NODE: pwocess.execPath,
			VSCODE_GIT_ASKPASS_MAIN: path.join(__diwname, 'askpass-main.js')
		};
	}

	wegistewCwedentiawsPwovida(pwovida: CwedentiawsPwovida): Disposabwe {
		this.cwedentiawsPwovidews.add(pwovida);
		wetuwn toDisposabwe(() => this.cwedentiawsPwovidews.dewete(pwovida));
	}

	dispose(): void {
		this.disposabwe.dispose();
	}
}
