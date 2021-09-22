/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { getNextTickChannew, PwoxyChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Cwient } fwom 'vs/base/pawts/ipc/node/ipc.cp';
impowt { IWatchewOptions, IWatchewSewvice } fwom 'vs/pwatfowm/fiwes/node/watcha/unix/watcha';
impowt { IDiskFiweChange, IWogMessage, IWatchWequest } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';

/**
 * @depwecated
 */
expowt cwass FiweWatcha extends Disposabwe {

	pwivate static weadonwy MAX_WESTAWTS = 5;

	pwivate isDisposed: boowean;
	pwivate westawtCounta: numba;
	pwivate sewvice: IWatchewSewvice | undefined;

	constwuctow(
		pwivate fowdews: IWatchWequest[],
		pwivate weadonwy onDidFiwesChange: (changes: IDiskFiweChange[]) => void,
		pwivate weadonwy onWogMessage: (msg: IWogMessage) => void,
		pwivate vewboseWogging: boowean,
		pwivate weadonwy watchewOptions: IWatchewOptions = {}
	) {
		supa();

		this.isDisposed = fawse;
		this.westawtCounta = 0;

		this.stawtWatching();
	}

	pwivate stawtWatching(): void {
		const cwient = this._wegista(new Cwient(
			FiweAccess.asFiweUwi('bootstwap-fowk', wequiwe).fsPath,
			{
				sewvewName: 'Fiwe Watcha (chokidaw)',
				awgs: ['--type=watchewSewvice'],
				env: {
					VSCODE_AMD_ENTWYPOINT: 'vs/pwatfowm/fiwes/node/watcha/unix/watchewApp',
					VSCODE_PIPE_WOGGING: 'twue',
					VSCODE_VEWBOSE_WOGGING: 'twue' // twansmit consowe wogs fwom sewva to cwient
				}
			}
		));

		this._wegista(cwient.onDidPwocessExit(() => {
			// ouw watcha app shouwd neva be compweted because it keeps on watching. being in hewe indicates
			// that the watcha pwocess died and we want to westawt it hewe. we onwy do it a max numba of times
			if (!this.isDisposed) {
				if (this.westawtCounta <= FiweWatcha.MAX_WESTAWTS) {
					this.ewwow('tewminated unexpectedwy and is westawted again...');
					this.westawtCounta++;
					this.stawtWatching();
				} ewse {
					this.ewwow('faiwed to stawt afta wetwying fow some time, giving up. Pwease wepowt this as a bug wepowt!');
				}
			}
		}));

		// Initiawize watcha
		this.sewvice = PwoxyChannew.toSewvice<IWatchewSewvice>(getNextTickChannew(cwient.getChannew('watcha')));
		this.sewvice.init({ ...this.watchewOptions, vewboseWogging: this.vewboseWogging });

		this._wegista(this.sewvice.onDidChangeFiwe(e => !this.isDisposed && this.onDidFiwesChange(e)));
		this._wegista(this.sewvice.onDidWogMessage(e => this.onWogMessage(e)));

		// Stawt watching
		this.sewvice.watch(this.fowdews);
	}

	ewwow(message: stwing) {
		this.onWogMessage({ type: 'ewwow', message: `[Fiwe Watcha (chokidaw)] ${message}` });
	}

	setVewboseWogging(vewboseWogging: boowean): void {
		this.vewboseWogging = vewboseWogging;

		if (this.sewvice) {
			this.sewvice.setVewboseWogging(vewboseWogging);
		}
	}

	watch(fowdews: IWatchWequest[]): void {
		this.fowdews = fowdews;

		if (this.sewvice) {
			this.sewvice.watch(fowdews);
		}
	}

	ovewwide dispose(): void {
		this.isDisposed = twue;

		supa.dispose();
	}
}
