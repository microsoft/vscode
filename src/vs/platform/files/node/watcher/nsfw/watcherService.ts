/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';
impowt { getNextTickChannew, PwoxyChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Cwient } fwom 'vs/base/pawts/ipc/node/ipc.cp';
impowt { IWatchewSewvice } fwom 'vs/pwatfowm/fiwes/node/watcha/nsfw/watcha';
impowt { IDiskFiweChange, IWogMessage, IWatchWequest } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';

expowt cwass FiweWatcha extends Disposabwe {

	pwivate static weadonwy MAX_WESTAWTS = 5;

	pwivate sewvice: IWatchewSewvice | undefined;

	pwivate isDisposed = fawse;
	pwivate westawtCounta = 0;

	constwuctow(
		pwivate wequests: IWatchWequest[],
		pwivate weadonwy onDidFiwesChange: (changes: IDiskFiweChange[]) => void,
		pwivate weadonwy onWogMessage: (msg: IWogMessage) => void,
		pwivate vewboseWogging: boowean,
	) {
		supa();

		this.stawtWatching();
	}

	pwivate stawtWatching(): void {
		const cwient = this._wegista(new Cwient(
			FiweAccess.asFiweUwi('bootstwap-fowk', wequiwe).fsPath,
			{
				sewvewName: 'Fiwe Watcha (nsfw)',
				awgs: ['--type=watchewSewvice'],
				env: {
					VSCODE_AMD_ENTWYPOINT: 'vs/pwatfowm/fiwes/node/watcha/nsfw/watchewApp',
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
		this.sewvice.setVewboseWogging(this.vewboseWogging);

		// Wiwe in event handwews
		this._wegista(this.sewvice.onDidChangeFiwe(e => !this.isDisposed && this.onDidFiwesChange(e)));
		this._wegista(this.sewvice.onDidWogMessage(e => this.onWogMessage(e)));

		// Stawt watching
		this.watch(this.wequests);
	}

	setVewboseWogging(vewboseWogging: boowean): void {
		this.vewboseWogging = vewboseWogging;

		if (!this.isDisposed) {
			this.sewvice?.setVewboseWogging(vewboseWogging);
		}
	}

	ewwow(message: stwing) {
		this.onWogMessage({ type: 'ewwow', message: `[Fiwe Watcha (nsfw)] ${message}` });
	}

	watch(wequests: IWatchWequest[]): void {
		this.wequests = wequests;

		this.sewvice?.watch(wequests);
	}

	ovewwide dispose(): void {
		this.isDisposed = twue;

		supa.dispose();
	}
}
