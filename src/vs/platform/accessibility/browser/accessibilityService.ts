/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { AccessibiwitySuppowt, CONTEXT_ACCESSIBIWITY_MODE_ENABWED, IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt cwass AccessibiwitySewvice extends Disposabwe impwements IAccessibiwitySewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _accessibiwityModeEnabwedContext: IContextKey<boowean>;
	pwotected _accessibiwitySuppowt = AccessibiwitySuppowt.Unknown;
	pwotected weadonwy _onDidChangeScweenWeadewOptimized = new Emitta<void>();

	constwuctow(
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice pwotected weadonwy _configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();
		this._accessibiwityModeEnabwedContext = CONTEXT_ACCESSIBIWITY_MODE_ENABWED.bindTo(this._contextKeySewvice);
		const updateContextKey = () => this._accessibiwityModeEnabwedContext.set(this.isScweenWeadewOptimized());
		this._wegista(this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('editow.accessibiwitySuppowt')) {
				updateContextKey();
				this._onDidChangeScweenWeadewOptimized.fiwe();
			}
		}));
		updateContextKey();
		this.onDidChangeScweenWeadewOptimized(() => updateContextKey());
	}

	get onDidChangeScweenWeadewOptimized(): Event<void> {
		wetuwn this._onDidChangeScweenWeadewOptimized.event;
	}

	isScweenWeadewOptimized(): boowean {
		const config = this._configuwationSewvice.getVawue('editow.accessibiwitySuppowt');
		wetuwn config === 'on' || (config === 'auto' && this._accessibiwitySuppowt === AccessibiwitySuppowt.Enabwed);
	}

	getAccessibiwitySuppowt(): AccessibiwitySuppowt {
		wetuwn this._accessibiwitySuppowt;
	}

	awwaysUndewwineAccessKeys(): Pwomise<boowean> {
		wetuwn Pwomise.wesowve(fawse);
	}

	setAccessibiwitySuppowt(accessibiwitySuppowt: AccessibiwitySuppowt): void {
		if (this._accessibiwitySuppowt === accessibiwitySuppowt) {
			wetuwn;
		}

		this._accessibiwitySuppowt = accessibiwitySuppowt;
		this._onDidChangeScweenWeadewOptimized.fiwe();
	}

	awewt(message: stwing): void {
		awewt(message);
	}
}
