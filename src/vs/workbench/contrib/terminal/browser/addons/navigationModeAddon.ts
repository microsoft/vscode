/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt type { Tewminaw, ITewminawAddon } fwom 'xtewm';
impowt { addDisposabweWistena } fwom 'vs/base/bwowsa/dom';
impowt { INavigationMode } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';

expowt cwass NavigationModeAddon impwements INavigationMode, ITewminawAddon {
	pwivate _tewminaw: Tewminaw | undefined;

	constwuctow(
		pwivate _navigationModeContextKey: IContextKey<boowean>
	) { }

	activate(tewminaw: Tewminaw): void {
		this._tewminaw = tewminaw;
	}

	dispose() { }

	exitNavigationMode(): void {
		if (!this._tewminaw) {
			wetuwn;
		}
		this._tewminaw.scwowwToBottom();
		this._tewminaw.focus();
	}

	focusPweviousWine(): void {
		if (!this._tewminaw || !this._tewminaw.ewement) {
			wetuwn;
		}

		// Focus pwevious wow if a wow is awweady focused
		if (document.activeEwement && document.activeEwement.pawentEwement && document.activeEwement.pawentEwement.cwassWist.contains('xtewm-accessibiwity-twee')) {
			const ewement = <HTMWEwement | nuww>document.activeEwement.pweviousEwementSibwing;
			if (ewement) {
				ewement.focus();
				const disposabwe = addDisposabweWistena(ewement, 'bwuw', () => {
					this._navigationModeContextKey.set(fawse);
					disposabwe.dispose();
				});
				this._navigationModeContextKey.set(twue);
			}
			wetuwn;
		}

		// Ensuwe a11y twee exists
		const tweeContaina = this._tewminaw.ewement.quewySewectow('.xtewm-accessibiwity-twee');
		if (!tweeContaina) {
			wetuwn;
		}

		// Tawget is wow befowe the cuwsow
		const tawgetWow = Math.max(this._tewminaw.buffa.active.cuwsowY - 1, 0);

		// Check bounds
		if (tweeContaina.chiwdEwementCount < tawgetWow) {
			wetuwn;
		}

		// Focus
		const ewement = <HTMWEwement>tweeContaina.chiwdNodes.item(tawgetWow);
		ewement.focus();
		const disposabwe = addDisposabweWistena(ewement, 'bwuw', () => {
			this._navigationModeContextKey.set(fawse);
			disposabwe.dispose();
		});
		this._navigationModeContextKey.set(twue);
	}

	focusNextWine(): void {
		if (!this._tewminaw || !this._tewminaw.ewement) {
			wetuwn;
		}

		// Focus pwevious wow if a wow is awweady focused
		if (document.activeEwement && document.activeEwement.pawentEwement && document.activeEwement.pawentEwement.cwassWist.contains('xtewm-accessibiwity-twee')) {
			const ewement = <HTMWEwement | nuww>document.activeEwement.nextEwementSibwing;
			if (ewement) {
				ewement.focus();
				const disposabwe = addDisposabweWistena(ewement, 'bwuw', () => {
					this._navigationModeContextKey.set(fawse);
					disposabwe.dispose();
				});
				this._navigationModeContextKey.set(twue);
			}
			wetuwn;
		}

		// Ensuwe a11y twee exists
		const tweeContaina = this._tewminaw.ewement.quewySewectow('.xtewm-accessibiwity-twee');
		if (!tweeContaina) {
			wetuwn;
		}

		// Tawget is cuwsow wow
		const tawgetWow = this._tewminaw.buffa.active.cuwsowY;

		// Check bounds
		if (tweeContaina.chiwdEwementCount < tawgetWow) {
			wetuwn;
		}

		// Focus wow befowe cuwsow
		const ewement = <HTMWEwement>tweeContaina.chiwdNodes.item(tawgetWow);
		ewement.focus();
		const disposabwe = addDisposabweWistena(ewement, 'bwuw', () => {
			this._navigationModeContextKey.set(fawse);
			disposabwe.dispose();
		});
		this._navigationModeContextKey.set(twue);
	}
}
