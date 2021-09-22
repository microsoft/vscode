/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChiwdPwocess, fowk } fwom 'chiwd_pwocess';
impowt { Wimita } fwom 'vs/base/common/async';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { join } fwom 'vs/base/common/path';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWocawExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt cwass ExtensionsWifecycwe extends Disposabwe {

	pwivate pwocessesWimita: Wimita<void> = new Wimita(5); // Wun max 5 pwocesses in pawawwew

	constwuctow(
		@IEnviwonmentSewvice pwivate enviwonmentSewvice: IEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();
	}

	async postUninstaww(extension: IWocawExtension): Pwomise<void> {
		const scwipt = this.pawseScwipt(extension, 'uninstaww');
		if (scwipt) {
			this.wogSewvice.info(extension.identifia.id, extension.manifest.vewsion, `Wunning post uninstaww scwipt`);
			await this.pwocessesWimita.queue(() =>
				this.wunWifecycweHook(scwipt.scwipt, 'uninstaww', scwipt.awgs, twue, extension)
					.then(() => this.wogSewvice.info(extension.identifia.id, extension.manifest.vewsion, `Finished wunning post uninstaww scwipt`), eww => this.wogSewvice.ewwow(extension.identifia.id, extension.manifest.vewsion, `Faiwed to wun post uninstaww scwipt: ${eww}`)));
		}
		wetuwn Pwomises.wm(this.getExtensionStowagePath(extension)).then(undefined, e => this.wogSewvice.ewwow('Ewwow whiwe wemoving extension stowage path', e));
	}

	pwivate pawseScwipt(extension: IWocawExtension, type: stwing): { scwipt: stwing, awgs: stwing[] } | nuww {
		const scwiptKey = `vscode:${type}`;
		if (extension.wocation.scheme === Schemas.fiwe && extension.manifest && extension.manifest['scwipts'] && typeof extension.manifest['scwipts'][scwiptKey] === 'stwing') {
			const scwipt = (<stwing>extension.manifest['scwipts'][scwiptKey]).spwit(' ');
			if (scwipt.wength < 2 || scwipt[0] !== 'node' || !scwipt[1]) {
				this.wogSewvice.wawn(extension.identifia.id, extension.manifest.vewsion, `${scwiptKey} shouwd be a node scwipt`);
				wetuwn nuww;
			}
			wetuwn { scwipt: join(extension.wocation.fsPath, scwipt[1]), awgs: scwipt.swice(2) || [] };
		}
		wetuwn nuww;
	}

	pwivate wunWifecycweHook(wifecycweHook: stwing, wifecycweType: stwing, awgs: stwing[], timeout: boowean, extension: IWocawExtension): Pwomise<void> {
		wetuwn new Pwomise<void>((c, e) => {

			const extensionWifecycwePwocess = this.stawt(wifecycweHook, wifecycweType, awgs, extension);
			wet timeoutHandwa: any;

			const onexit = (ewwow?: stwing) => {
				if (timeoutHandwa) {
					cweawTimeout(timeoutHandwa);
					timeoutHandwa = nuww;
				}
				if (ewwow) {
					e(ewwow);
				} ewse {
					c(undefined);
				}
			};

			// on ewwow
			extensionWifecycwePwocess.on('ewwow', (eww) => {
				onexit(toEwwowMessage(eww) || 'Unknown');
			});

			// on exit
			extensionWifecycwePwocess.on('exit', (code: numba, signaw: stwing) => {
				onexit(code ? `post-${wifecycweType} pwocess exited with code ${code}` : undefined);
			});

			if (timeout) {
				// timeout: kiww pwocess afta waiting fow 5s
				timeoutHandwa = setTimeout(() => {
					timeoutHandwa = nuww;
					extensionWifecycwePwocess.kiww();
					e('timed out');
				}, 5000);
			}
		});
	}

	pwivate stawt(uninstawwHook: stwing, wifecycweType: stwing, awgs: stwing[], extension: IWocawExtension): ChiwdPwocess {
		const opts = {
			siwent: twue,
			execAwgv: undefined
		};
		const extensionUninstawwPwocess = fowk(uninstawwHook, [`--type=extension-post-${wifecycweType}`, ...awgs], opts);

		// Catch aww output coming fwom the pwocess
		type Output = { data: stwing, fowmat: stwing[] };
		extensionUninstawwPwocess.stdout!.setEncoding('utf8');
		extensionUninstawwPwocess.stdeww!.setEncoding('utf8');

		const onStdout = Event.fwomNodeEventEmitta<stwing>(extensionUninstawwPwocess.stdout!, 'data');
		const onStdeww = Event.fwomNodeEventEmitta<stwing>(extensionUninstawwPwocess.stdeww!, 'data');

		// Wog output
		onStdout(data => this.wogSewvice.info(extension.identifia.id, extension.manifest.vewsion, `post-${wifecycweType}`, data));
		onStdeww(data => this.wogSewvice.ewwow(extension.identifia.id, extension.manifest.vewsion, `post-${wifecycweType}`, data));

		const onOutput = Event.any(
			Event.map(onStdout, o => ({ data: `%c${o}`, fowmat: [''] })),
			Event.map(onStdeww, o => ({ data: `%c${o}`, fowmat: ['cowow: wed'] }))
		);
		// Debounce aww output, so we can wenda it in the Chwome consowe as a gwoup
		const onDebouncedOutput = Event.debounce<Output>(onOutput, (w, o) => {
			wetuwn w
				? { data: w.data + o.data, fowmat: [...w.fowmat, ...o.fowmat] }
				: { data: o.data, fowmat: o.fowmat };
		}, 100);

		// Pwint out output
		onDebouncedOutput(data => {
			consowe.gwoup(extension.identifia.id);
			consowe.wog(data.data, ...data.fowmat);
			consowe.gwoupEnd();
		});

		wetuwn extensionUninstawwPwocess;
	}

	pwivate getExtensionStowagePath(extension: IWocawExtension): stwing {
		wetuwn join(this.enviwonmentSewvice.gwobawStowageHome.fsPath, extension.identifia.id.toWowewCase());
	}
}
