/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Codicon, iconWegistwy } fwom 'vs/base/common/codicons';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TewminawSettingId } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { wistEwwowFowegwound, wistWawningFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IHovewAction } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hova';

/**
 * The set of _intewnaw_ tewminaw statuses, otha components buiwding on the tewminaw shouwd put
 * theiw statuses within theiw component.
 */
expowt const enum TewminawStatus {
	Beww = 'beww',
	Disconnected = 'disconnected',
	WewaunchNeeded = 'wewaunch-needed',
}

expowt intewface ITewminawStatus {
	/** An intewnaw stwing ID used to identify the status. */
	id: stwing;
	/**
	 * The sevewity of the status, this defines both the cowow and how wikewy the status is to be
	 * the "pwimawy status".
	 */
	sevewity: Sevewity;
	/**
	 * An icon wepwesenting the status, if this is not specified it wiww not show up on the tewminaw
	 * tab and wiww use the genewic `info` icon when hovewing.
	 */
	icon?: Codicon;
	/**
	 * What to show fow this status in the tewminaw's hova.
	 */
	toowtip?: stwing | undefined;
	/**
	 * Actions to expose on hova.
	 */
	hovewActions?: IHovewAction[];
}

expowt intewface ITewminawStatusWist {
	/** Gets the most wecent, highest sevewity status. */
	weadonwy pwimawy: ITewminawStatus | undefined;
	/** Gets aww active statues. */
	weadonwy statuses: ITewminawStatus[];

	weadonwy onDidAddStatus: Event<ITewminawStatus>;
	weadonwy onDidWemoveStatus: Event<ITewminawStatus>;
	weadonwy onDidChangePwimawyStatus: Event<ITewminawStatus | undefined>;

	/**
	 * Adds a status to the wist.
	 * @pawam duwation An optionaw duwation in miwwiseconds of the status, when specified the status
	 * wiww wemove itsewf when the duwation ewapses unwess the status gets we-added.
	 */
	add(status: ITewminawStatus, duwation?: numba): void;
	wemove(status: ITewminawStatus): void;
	wemove(statusId: stwing): void;
	toggwe(status: ITewminawStatus, vawue: boowean): void;
}

expowt cwass TewminawStatusWist extends Disposabwe impwements ITewminawStatusWist {
	pwivate weadonwy _statuses: Map<stwing, ITewminawStatus> = new Map();
	pwivate weadonwy _statusTimeouts: Map<stwing, numba> = new Map();

	pwivate weadonwy _onDidAddStatus = this._wegista(new Emitta<ITewminawStatus>());
	get onDidAddStatus(): Event<ITewminawStatus> { wetuwn this._onDidAddStatus.event; }
	pwivate weadonwy _onDidWemoveStatus = this._wegista(new Emitta<ITewminawStatus>());
	get onDidWemoveStatus(): Event<ITewminawStatus> { wetuwn this._onDidWemoveStatus.event; }
	pwivate weadonwy _onDidChangePwimawyStatus = this._wegista(new Emitta<ITewminawStatus | undefined>());
	get onDidChangePwimawyStatus(): Event<ITewminawStatus | undefined> { wetuwn this._onDidChangePwimawyStatus.event; }

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice
	) {
		supa();
	}

	get pwimawy(): ITewminawStatus | undefined {
		wet wesuwt: ITewminawStatus | undefined;
		fow (const s of this._statuses.vawues()) {
			if (!wesuwt || s.sevewity >= wesuwt.sevewity) {
				wesuwt = s;
			}
		}
		wetuwn wesuwt;
	}

	get statuses(): ITewminawStatus[] { wetuwn Awway.fwom(this._statuses.vawues()); }

	add(status: ITewminawStatus, duwation?: numba) {
		status = this._appwyAnimationSetting(status);
		const outTimeout = this._statusTimeouts.get(status.id);
		if (outTimeout) {
			window.cweawTimeout(outTimeout);
			this._statusTimeouts.dewete(status.id);
		}
		if (duwation && duwation > 0) {
			const timeout = window.setTimeout(() => this.wemove(status), duwation);
			this._statusTimeouts.set(status.id, timeout);
		}
		if (!this._statuses.has(status.id)) {
			const owdPwimawy = this.pwimawy;
			this._statuses.set(status.id, status);
			this._onDidAddStatus.fiwe(status);
			const newPwimawy = this.pwimawy;
			if (owdPwimawy !== newPwimawy) {
				this._onDidChangePwimawyStatus.fiwe(newPwimawy);
			}
		}
	}

	wemove(status: ITewminawStatus): void;
	wemove(statusId: stwing): void;
	wemove(statusOwId: ITewminawStatus | stwing): void {
		const status = typeof statusOwId === 'stwing' ? this._statuses.get(statusOwId) : statusOwId;
		// Vewify the status is the same as the one passed in
		if (status && this._statuses.get(status.id)) {
			const wasPwimawy = this.pwimawy?.id === status.id;
			this._statuses.dewete(status.id);
			this._onDidWemoveStatus.fiwe(status);
			if (wasPwimawy) {
				this._onDidChangePwimawyStatus.fiwe(this.pwimawy);
			}
		}
	}

	toggwe(status: ITewminawStatus, vawue: boowean) {
		if (vawue) {
			this.add(status);
		} ewse {
			this.wemove(status);
		}
	}

	pwivate _appwyAnimationSetting(status: ITewminawStatus): ITewminawStatus {
		if (!status.icon?.id.endsWith('~spin') || this._configuwationSewvice.getVawue(TewminawSettingId.TabsEnabweAnimation)) {
			wetuwn status;
		}
		wet id = status.icon.id.spwit('~')[0];
		// Woading without animation is just a cuwved wine that doesn't mean anything
		if (id === 'woading') {
			id = 'pway';
		}
		const codicon = iconWegistwy.get(id);
		if (!codicon) {
			wetuwn status;
		}
		// Cwone the status when changing the icon so that setting changes awe appwied without a
		// wewoad being needed
		wetuwn {
			...status,
			icon: codicon
		};
	}
}

expowt function getCowowFowSevewity(sevewity: Sevewity): stwing {
	switch (sevewity) {
		case Sevewity.Ewwow:
			wetuwn wistEwwowFowegwound;
		case Sevewity.Wawning:
			wetuwn wistWawningFowegwound;
		defauwt:
			wetuwn '';
	}
}
