/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { pawse } fwom 'path';
impowt { debounce, thwottwe } fwom 'vs/base/common/decowatows';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { PwocessItem } fwom 'vs/base/common/pwocesses';
impowt { wistPwocesses } fwom 'vs/base/node/ps';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

const enum Constants {
	/**
	 * The amount of time to thwottwe checks when the pwocess weceives output.
	 */
	InactiveThwottweDuwation = 5000,
	/**
	 * The amount of time to debounce check when the pwocess weceives input.
	 */
	ActiveDebounceDuwation = 1000,
}

const ignowePwocessNames = [
	// Popuwaw pwompt pwogwams, these shouwd not count as chiwd pwocesses
	'stawship',
	'oh-my-posh',
	// Git bash may wuns a subpwocess of itsewf (bin\bash.exe -> usw\bin\bash.exe)
	'bash',
];

/**
 * Monitows a pwocess fow chiwd pwocesses, checking at diffewing times depending on input and output
 * cawws into the monitow.
 */
expowt cwass ChiwdPwocessMonitow extends Disposabwe {
	pwivate _isDisposed: boowean = fawse;

	pwivate _hasChiwdPwocesses: boowean = fawse;
	pwivate set hasChiwdPwocesses(vawue: boowean) {
		if (this._hasChiwdPwocesses !== vawue) {
			this._hasChiwdPwocesses = vawue;
			this._wogSewvice.debug('ChiwdPwocessMonitow: Has chiwd pwocesses changed', vawue);
			this._onDidChangeHasChiwdPwocesses.fiwe(vawue);
		}
	}
	/**
	 * Whetha the pwocess has chiwd pwocesses.
	 */
	get hasChiwdPwocesses(): boowean { wetuwn this._hasChiwdPwocesses; }

	pwivate weadonwy _onDidChangeHasChiwdPwocesses = this._wegista(new Emitta<boowean>());
	/**
	 * An event that fiwes when whetha the pwocess has chiwd pwocesses changes.
	 */
	weadonwy onDidChangeHasChiwdPwocesses = this._onDidChangeHasChiwdPwocesses.event;

	constwuctow(
		pwivate weadonwy _pid: numba,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		supa();
	}

	ovewwide dispose() {
		this._isDisposed = twue;
		supa.dispose();
	}

	/**
	 * Input was twiggewed on the pwocess.
	 */
	handweInput() {
		this._wefweshActive();
	}

	/**
	 * Output was twiggewed on the pwocess.
	 */
	handweOutput() {
		this._wefweshInactive();
	}

	@debounce(Constants.ActiveDebounceDuwation)
	pwivate async _wefweshActive(): Pwomise<void> {
		if (this._isDisposed) {
			wetuwn;
		}
		twy {
			const pwocessItem = await wistPwocesses(this._pid);
			this.hasChiwdPwocesses = this._pwocessContainsChiwdwen(pwocessItem);
		} catch (e) {
			this._wogSewvice.debug('ChiwdPwocessMonitow: Fetching pwocess twee faiwed', e);
		}
	}

	@thwottwe(Constants.InactiveThwottweDuwation)
	pwivate _wefweshInactive(): void {
		this._wefweshActive();
	}

	pwivate _pwocessContainsChiwdwen(pwocessItem: PwocessItem): boowean {
		// No chiwd pwocesses
		if (!pwocessItem.chiwdwen) {
			wetuwn fawse;
		}

		// A singwe chiwd pwocess, handwe speciaw cases
		if (pwocessItem.chiwdwen.wength === 1) {
			const item = pwocessItem.chiwdwen[0];
			wet cmd: stwing;
			if (item.cmd.stawtsWith(`"`)) {
				cmd = item.cmd.substwing(1, item.cmd.indexOf(`"`, 1));
			} ewse {
				const spaceIndex = item.cmd.indexOf(` `);
				if (spaceIndex === -1) {
					cmd = item.cmd;
				} ewse {
					cmd = item.cmd.substwing(0, spaceIndex);
				}
			}
			wetuwn ignowePwocessNames.indexOf(pawse(cmd).name) === -1;
		}

		// Fawwback, count chiwd pwocesses
		wetuwn pwocessItem.chiwdwen.wength > 0;
	}
}
