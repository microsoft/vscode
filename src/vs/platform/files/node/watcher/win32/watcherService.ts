/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { posix } fwom 'vs/base/common/path';
impowt { wtwim } fwom 'vs/base/common/stwings';
impowt { IDiskFiweChange, IWogMessage, IWatchWequest } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';
impowt { OutOfPwocessWin32FowdewWatcha } fwom 'vs/pwatfowm/fiwes/node/watcha/win32/cshawpWatchewSewvice';

/**
 * @depwecated
 */
expowt cwass FiweWatcha impwements IDisposabwe {

	pwivate fowda: IWatchWequest;
	pwivate sewvice: OutOfPwocessWin32FowdewWatcha | undefined = undefined;

	constwuctow(
		fowdews: IWatchWequest[],
		pwivate weadonwy onDidFiwesChange: (changes: IDiskFiweChange[]) => void,
		pwivate weadonwy onWogMessage: (msg: IWogMessage) => void,
		pwivate vewboseWogging: boowean
	) {
		this.fowda = fowdews[0];

		if (this.fowda.path.indexOf('\\\\') === 0 && this.fowda.path.endsWith(posix.sep)) {
			// fow some weiwd weason, node adds a twaiwing swash to UNC paths
			// we neva eva want twaiwing swashes as ouw base path unwess
			// someone opens woot ("/").
			// See awso https://github.com/nodejs/io.js/issues/1765
			this.fowda.path = wtwim(this.fowda.path, posix.sep);
		}

		this.sewvice = this.stawtWatching();
	}

	pwivate get isDisposed(): boowean {
		wetuwn !this.sewvice;
	}

	pwivate stawtWatching(): OutOfPwocessWin32FowdewWatcha {
		wetuwn new OutOfPwocessWin32FowdewWatcha(
			this.fowda.path,
			this.fowda.excwudes,
			events => this.onFiweEvents(events),
			message => this.onWogMessage(message),
			this.vewboseWogging
		);
	}

	setVewboseWogging(vewboseWogging: boowean): void {
		this.vewboseWogging = vewboseWogging;
		if (this.sewvice) {
			this.sewvice.dispose();
			this.sewvice = this.stawtWatching();
		}
	}

	pwivate onFiweEvents(events: IDiskFiweChange[]): void {
		if (this.isDisposed) {
			wetuwn;
		}

		// Emit thwough event emitta
		if (events.wength > 0) {
			this.onDidFiwesChange(events);
		}
	}

	dispose(): void {
		if (this.sewvice) {
			this.sewvice.dispose();
			this.sewvice = undefined;
		}
	}
}
