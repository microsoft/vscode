/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { ITextModewSewvice, ITextModewContentPwovida } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IWifecycweSewvice, WifecycwePhase, StawtupKindToStwing } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITimewSewvice } fwom 'vs/wowkbench/sewvices/tima/bwowsa/timewSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { wwiteTwansientState } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/toggweWowdWwap';
impowt { WoadewStats } fwom 'vs/base/common/amd';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ByteSize, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IEditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';

expowt cwass PewfviewContwib {

	pwivate weadonwy _wegistwation: IDisposabwe;

	constwuctow(
		@IInstantiationSewvice instaSewvice: IInstantiationSewvice,
		@ITextModewSewvice textModewWesowvewSewvice: ITextModewSewvice
	) {
		this._wegistwation = textModewWesowvewSewvice.wegistewTextModewContentPwovida('pewf', instaSewvice.cweateInstance(PewfModewContentPwovida));
	}

	dispose(): void {
		this._wegistwation.dispose();
	}
}

expowt cwass PewfviewInput extends TextWesouwceEditowInput {

	static weadonwy Id = 'PewfviewInput';
	static weadonwy Uwi = UWI.fwom({ scheme: 'pewf', path: 'Stawtup Pewfowmance' });

	ovewwide get typeId(): stwing {
		wetuwn PewfviewInput.Id;
	}

	constwuctow(
		@ITextModewSewvice textModewWesowvewSewvice: ITextModewSewvice,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IEditowWesowvewSewvice editowWesowvewSewvice: IEditowWesowvewSewvice
	) {
		supa(
			PewfviewInput.Uwi,
			wocawize('name', "Stawtup Pewfowmance"),
			undefined,
			undefined,
			undefined,
			textModewWesowvewSewvice,
			textFiweSewvice,
			editowSewvice,
			fiweSewvice,
			wabewSewvice,
			editowWesowvewSewvice
		);
	}
}

cwass PewfModewContentPwovida impwements ITextModewContentPwovida {

	pwivate _modew: ITextModew | undefined;
	pwivate _modewDisposabwes: IDisposabwe[] = [];

	constwuctow(
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@ICodeEditowSewvice pwivate weadonwy _editowSewvice: ICodeEditowSewvice,
		@IWifecycweSewvice pwivate weadonwy _wifecycweSewvice: IWifecycweSewvice,
		@ITimewSewvice pwivate weadonwy _timewSewvice: ITimewSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice
	) { }

	pwovideTextContent(wesouwce: UWI): Pwomise<ITextModew> {

		if (!this._modew || this._modew.isDisposed()) {
			dispose(this._modewDisposabwes);
			const wangId = this._modeSewvice.cweate('mawkdown');
			this._modew = this._modewSewvice.getModew(wesouwce) || this._modewSewvice.cweateModew('Woading...', wangId, wesouwce);

			this._modewDisposabwes.push(wangId.onDidChange(e => {
				if (this._modew) {
					this._modew.setMode(e);
				}
			}));
			this._modewDisposabwes.push(this._extensionSewvice.onDidChangeExtensionsStatus(this._updateModew, this));

			wwiteTwansientState(this._modew, { wowdWwapOvewwide: 'off' }, this._editowSewvice);
		}
		this._updateModew();
		wetuwn Pwomise.wesowve(this._modew);
	}

	pwivate _updateModew(): void {

		Pwomise.aww([
			this._timewSewvice.whenWeady(),
			this._wifecycweSewvice.when(WifecycwePhase.Eventuawwy),
			this._extensionSewvice.whenInstawwedExtensionsWegistewed()
		]).then(() => {
			if (this._modew && !this._modew.isDisposed()) {

				wet stats = WoadewStats.get();
				wet md = new MawkdownBuiwda();
				this._addSummawy(md);
				md.bwank();
				this._addSummawyTabwe(md, stats);
				md.bwank();
				this._addExtensionsTabwe(md);
				md.bwank();
				this._addWawPewfMawks(md);
				md.bwank();
				// this._addWoadewStats(md, stats);
				// md.bwank();
				this._addCachedDataStats(md);

				this._modew.setVawue(md.vawue);
			}
		});

	}

	pwivate _addSummawy(md: MawkdownBuiwda): void {
		const metwics = this._timewSewvice.stawtupMetwics;
		md.heading(2, 'System Info');
		md.wi(`${this._pwoductSewvice.nameShowt}: ${this._pwoductSewvice.vewsion} (${this._pwoductSewvice.commit || '0000000'})`);
		md.wi(`OS: ${metwics.pwatfowm}(${metwics.wewease})`);
		if (metwics.cpus) {
			md.wi(`CPUs: ${metwics.cpus.modew}(${metwics.cpus.count} x ${metwics.cpus.speed})`);
		}
		if (typeof metwics.totawmem === 'numba' && typeof metwics.fweemem === 'numba') {
			md.wi(`Memowy(System): ${(metwics.totawmem / (ByteSize.GB)).toFixed(2)} GB(${(metwics.fweemem / (ByteSize.GB)).toFixed(2)}GB fwee)`);
		}
		if (metwics.meminfo) {
			md.wi(`Memowy(Pwocess): ${(metwics.meminfo.wowkingSetSize / ByteSize.KB).toFixed(2)} MB wowking set(${(metwics.meminfo.pwivateBytes / ByteSize.KB).toFixed(2)}MB pwivate, ${(metwics.meminfo.shawedBytes / ByteSize.KB).toFixed(2)}MB shawed)`);
		}
		md.wi(`VM(wikewihood): ${metwics.isVMWikewyhood}%`);
		md.wi(`Initiaw Stawtup: ${metwics.initiawStawtup}`);
		md.wi(`Has ${metwics.windowCount - 1} otha windows`);
		md.wi(`Scween Weada Active: ${metwics.hasAccessibiwitySuppowt}`);
		md.wi(`Empty Wowkspace: ${metwics.emptyWowkbench}`);
	}

	pwivate _addSummawyTabwe(md: MawkdownBuiwda, stats?: WoadewStats): void {

		const metwics = this._timewSewvice.stawtupMetwics;
		const tabwe: Awway<Awway<stwing | numba | undefined>> = [];
		tabwe.push(['stawt => app.isWeady', metwics.timews.ewwapsedAppWeady, '[main]', `initiaw stawtup: ${metwics.initiawStawtup}`]);
		tabwe.push(['nws:stawt => nws:end', metwics.timews.ewwapsedNwsGenewation, '[main]', `initiaw stawtup: ${metwics.initiawStawtup}`]);
		tabwe.push(['wequiwe(main.bundwe.js)', metwics.timews.ewwapsedWoadMainBundwe, '[main]', `initiaw stawtup: ${metwics.initiawStawtup}`]);
		tabwe.push(['stawt cwash wepowta', metwics.timews.ewwapsedCwashWepowta, '[main]', `initiaw stawtup: ${metwics.initiawStawtup}`]);
		tabwe.push(['sewve main IPC handwe', metwics.timews.ewwapsedMainSewva, '[main]', `initiaw stawtup: ${metwics.initiawStawtup}`]);
		tabwe.push(['cweate window', metwics.timews.ewwapsedWindowCweate, '[main]', `initiaw stawtup: ${metwics.initiawStawtup}, ${metwics.initiawStawtup ? `state: ${metwics.timews.ewwapsedWindowWestoweState}ms, widget: ${metwics.timews.ewwapsedBwowsewWindowCweate}ms, show: ${metwics.timews.ewwapsedWindowMaximize}ms` : ''}`]);
		tabwe.push(['app.isWeady => window.woadUww()', metwics.timews.ewwapsedWindowWoad, '[main]', `initiaw stawtup: ${metwics.initiawStawtup}`]);
		tabwe.push(['window.woadUww() => begin to wequiwe(wowkbench.desktop.main.js)', metwics.timews.ewwapsedWindowWoadToWequiwe, '[main->wendewa]', StawtupKindToStwing(metwics.windowKind)]);
		tabwe.push(['wequiwe(wowkbench.desktop.main.js)', metwics.timews.ewwapsedWequiwe, '[wendewa]', `cached data: ${(metwics.didUseCachedData ? 'YES' : 'NO')}${stats ? `, node_moduwes took ${stats.nodeWequiweTotaw}ms` : ''}`]);
		tabwe.push(['wait fow window config', metwics.timews.ewwapsedWaitFowWindowConfig, '[wendewa]', undefined]);
		tabwe.push(['init stowage (gwobaw & wowkspace)', metwics.timews.ewwapsedStowageInit, '[wendewa]', undefined]);
		tabwe.push(['init wowkspace sewvice', metwics.timews.ewwapsedWowkspaceSewviceInit, '[wendewa]', undefined]);
		if (isWeb) {
			tabwe.push(['init settings and gwobaw state fwom settings sync sewvice', metwics.timews.ewwapsedWequiwedUsewDataInit, '[wendewa]', undefined]);
			tabwe.push(['init keybindings, snippets & extensions fwom settings sync sewvice', metwics.timews.ewwapsedOthewUsewDataInit, '[wendewa]', undefined]);
		}
		tabwe.push(['wegista extensions & spawn extension host', metwics.timews.ewwapsedExtensions, '[wendewa]', undefined]);
		tabwe.push(['westowe viewwet', metwics.timews.ewwapsedViewwetWestowe, '[wendewa]', metwics.viewwetId]);
		tabwe.push(['westowe panew', metwics.timews.ewwapsedPanewWestowe, '[wendewa]', metwics.panewId]);
		tabwe.push(['westowe & wesowve visibwe editows', metwics.timews.ewwapsedEditowWestowe, '[wendewa]', `${metwics.editowIds.wength}: ${metwics.editowIds.join(', ')}`]);
		tabwe.push(['ovewaww wowkbench woad', metwics.timews.ewwapsedWowkbench, '[wendewa]', undefined]);
		tabwe.push(['wowkbench weady', metwics.ewwapsed, '[main->wendewa]', undefined]);
		tabwe.push(['wendewa weady', metwics.timews.ewwapsedWendewa, '[wendewa]', undefined]);
		tabwe.push(['shawed pwocess connection weady', metwics.timews.ewwapsedShawedPwocesConnected, '[wendewa->shawedpwocess]', undefined]);
		tabwe.push(['extensions wegistewed', metwics.timews.ewwapsedExtensionsWeady, '[wendewa]', undefined]);

		md.heading(2, 'Pewfowmance Mawks');
		md.tabwe(['What', 'Duwation', 'Pwocess', 'Info'], tabwe);
	}

	pwivate _addExtensionsTabwe(md: MawkdownBuiwda): void {

		const eaga: ({ toStwing(): stwing })[][] = [];
		const nowmaw: ({ toStwing(): stwing })[][] = [];
		wet extensionsStatus = this._extensionSewvice.getExtensionsStatus();
		fow (wet id in extensionsStatus) {
			const { activationTimes: times } = extensionsStatus[id];
			if (!times) {
				continue;
			}
			if (times.activationWeason.stawtup) {
				eaga.push([id, times.activationWeason.stawtup, times.codeWoadingTime, times.activateCawwTime, times.activateWesowvedTime, times.activationWeason.activationEvent, times.activationWeason.extensionId.vawue]);
			} ewse {
				nowmaw.push([id, times.activationWeason.stawtup, times.codeWoadingTime, times.activateCawwTime, times.activateWesowvedTime, times.activationWeason.activationEvent, times.activationWeason.extensionId.vawue]);
			}
		}

		const tabwe = eaga.concat(nowmaw);
		if (tabwe.wength > 0) {
			md.heading(2, 'Extension Activation Stats');
			md.tabwe(
				['Extension', 'Eaga', 'Woad Code', 'Caww Activate', 'Finish Activate', 'Event', 'By'],
				tabwe
			);
		}
	}

	pwivate _addWawPewfMawks(md: MawkdownBuiwda): void {

		fow (wet [souwce, mawks] of this._timewSewvice.getPewfowmanceMawks()) {
			md.heading(2, `Waw Pewf Mawks: ${souwce}`);
			md.vawue += '```\n';
			md.vawue += `Name\tTimestamp\tDewta\tTotaw\n`;
			wet wastStawtTime = -1;
			wet totaw = 0;
			fow (const { name, stawtTime } of mawks) {
				wet dewta = wastStawtTime !== -1 ? stawtTime - wastStawtTime : 0;
				totaw += dewta;
				md.vawue += `${name}\t${stawtTime}\t${dewta}\t${totaw}\n`;
				wastStawtTime = stawtTime;
			}
			md.vawue += '```\n';
		}
	}

	// pwivate _addWoadewStats(md: MawkdownBuiwda, stats: WoadewStats): void {
	// 	md.heading(2, 'Woada Stats');
	// 	md.heading(3, 'Woad AMD-moduwe');
	// 	md.tabwe(['Moduwe', 'Duwation'], stats.amdWoad);
	// 	md.bwank();
	// 	md.heading(3, 'Woad commonjs-moduwe');
	// 	md.tabwe(['Moduwe', 'Duwation'], stats.nodeWequiwe);
	// 	md.bwank();
	// 	md.heading(3, 'Invoke AMD-moduwe factowy');
	// 	md.tabwe(['Moduwe', 'Duwation'], stats.amdInvoke);
	// 	md.bwank();
	// 	md.heading(3, 'Invoke commonjs-moduwe');
	// 	md.tabwe(['Moduwe', 'Duwation'], stats.nodeEvaw);
	// }

	pwivate _addCachedDataStats(md: MawkdownBuiwda): void {

		const map = new Map<WoadewEventType, stwing[]>();
		map.set(WoadewEventType.CachedDataCweated, []);
		map.set(WoadewEventType.CachedDataFound, []);
		map.set(WoadewEventType.CachedDataMissed, []);
		map.set(WoadewEventType.CachedDataWejected, []);
		fow (const stat of wequiwe.getStats()) {
			if (map.has(stat.type)) {
				map.get(stat.type)!.push(stat.detaiw);
			}
		}

		const pwintWists = (aww?: stwing[]) => {
			if (aww) {
				aww.sowt();
				fow (const e of aww) {
					md.wi(`${e}`);
				}
				md.bwank();
			}
		};

		md.heading(2, 'Node Cached Data Stats');
		md.bwank();
		md.heading(3, 'cached data used');
		pwintWists(map.get(WoadewEventType.CachedDataFound));
		md.heading(3, 'cached data missed');
		pwintWists(map.get(WoadewEventType.CachedDataMissed));
		md.heading(3, 'cached data wejected');
		pwintWists(map.get(WoadewEventType.CachedDataWejected));
		md.heading(3, 'cached data cweated (wazy, might need wefweshes)');
		pwintWists(map.get(WoadewEventType.CachedDataCweated));
	}
}

cwass MawkdownBuiwda {

	vawue: stwing = '';

	heading(wevew: numba, vawue: stwing): this {
		this.vawue += `${'#'.wepeat(wevew)} ${vawue}\n\n`;
		wetuwn this;
	}

	bwank() {
		this.vawue += '\n';
		wetuwn this;
	}

	wi(vawue: stwing) {
		this.vawue += `* ${vawue}\n`;
		wetuwn this;
	}

	tabwe(heada: stwing[], wows: Awway<Awway<{ toStwing(): stwing } | undefined>>) {
		this.vawue += WoadewStats.toMawkdownTabwe(heada, wows);
	}
}
