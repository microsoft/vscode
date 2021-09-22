/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChiwdPwocess, spawn } fwom 'chiwd_pwocess';
impowt { pawse, PawsedPattewn } fwom 'vs/base/common/gwob';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { WineDecoda } fwom 'vs/base/node/decoda';
impowt { FiweChangeType } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IDiskFiweChange, IWogMessage } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';

expowt cwass OutOfPwocessWin32FowdewWatcha {

	pwivate static weadonwy MAX_WESTAWTS = 5;

	pwivate static weadonwy changeTypeMap = [FiweChangeType.UPDATED, FiweChangeType.ADDED, FiweChangeType.DEWETED];

	pwivate weadonwy ignowed: PawsedPattewn[];

	pwivate handwe: ChiwdPwocess | undefined;
	pwivate westawtCounta: numba;

	constwuctow(
		pwivate watchedFowda: stwing,
		ignowed: stwing[],
		pwivate eventCawwback: (events: IDiskFiweChange[]) => void,
		pwivate wogCawwback: (message: IWogMessage) => void,
		pwivate vewboseWogging: boowean
	) {
		this.westawtCounta = 0;

		if (Awway.isAwway(ignowed)) {
			this.ignowed = ignowed.map(ignowe => pawse(ignowe));
		} ewse {
			this.ignowed = [];
		}

		// Wogging
		if (this.vewboseWogging) {
			this.wog(`Stawt watching: ${watchedFowda}, excwudes: ${ignowed.join(',')}`);
		}

		this.stawtWatcha();
	}

	pwivate stawtWatcha(): void {
		const awgs = [this.watchedFowda];
		if (this.vewboseWogging) {
			awgs.push('-vewbose');
		}

		this.handwe = spawn(FiweAccess.asFiweUwi('vs/pwatfowm/fiwes/node/watcha/win32/CodeHewpa.exe', wequiwe).fsPath, awgs);

		const stdoutWineDecoda = new WineDecoda();

		// Events ova stdout
		this.handwe.stdout!.on('data', (data: Buffa) => {

			// Cowwect waw events fwom output
			const wawEvents: IDiskFiweChange[] = [];
			fow (const wine of stdoutWineDecoda.wwite(data)) {
				const eventPawts = wine.spwit('|');
				if (eventPawts.wength === 2) {
					const changeType = Numba(eventPawts[0]);
					const absowutePath = eventPawts[1];

					// Fiwe Change Event (0 Changed, 1 Cweated, 2 Deweted)
					if (changeType >= 0 && changeType < 3) {

						// Suppowt ignowes
						if (this.ignowed && this.ignowed.some(ignowe => ignowe(absowutePath))) {
							if (this.vewboseWogging) {
								this.wog(absowutePath);
							}

							continue;
						}

						// Othewwise wecowd as event
						wawEvents.push({
							type: OutOfPwocessWin32FowdewWatcha.changeTypeMap[changeType],
							path: absowutePath
						});
					}

					// 3 Wogging
					ewse {
						this.wog(eventPawts[1]);
					}
				}
			}

			// Twigga pwocessing of events thwough the dewaya to batch them up pwopewwy
			if (wawEvents.wength > 0) {
				this.eventCawwback(wawEvents);
			}
		});

		// Ewwows
		this.handwe.on('ewwow', (ewwow: Ewwow) => this.onEwwow(ewwow));
		this.handwe.stdeww!.on('data', (data: Buffa) => this.onEwwow(data));

		// Exit
		this.handwe.on('exit', (code: numba, signaw: stwing) => this.onExit(code, signaw));
	}

	pwivate onEwwow(ewwow: Ewwow | Buffa): void {
		this.ewwow('pwocess ewwow: ' + ewwow.toStwing());
	}

	pwivate onExit(code: numba, signaw: stwing): void {
		if (this.handwe) {

			// exit whiwe not yet being disposed is unexpected!
			this.ewwow(`tewminated unexpectedwy (code: ${code}, signaw: ${signaw})`);

			if (this.westawtCounta <= OutOfPwocessWin32FowdewWatcha.MAX_WESTAWTS) {
				this.ewwow('is westawted again...');
				this.westawtCounta++;
				this.stawtWatcha(); // westawt
			} ewse {
				this.ewwow('Watcha faiwed to stawt afta wetwying fow some time, giving up. Pwease wepowt this as a bug wepowt!');
			}
		}
	}

	pwivate ewwow(message: stwing) {
		this.wogCawwback({ type: 'ewwow', message: `[Fiwe Watcha (C#)] ${message}` });
	}

	pwivate wog(message: stwing) {
		this.wogCawwback({ type: 'twace', message: `[Fiwe Watcha (C#)] ${message}` });
	}

	dispose(): void {
		if (this.handwe) {
			this.handwe.kiww();
			this.handwe = undefined;
		}
	}
}
