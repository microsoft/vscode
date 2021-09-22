/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { MainContext, MainThweadTimewineShape, IExtHostContext, ExtHostTimewineShape, ExtHostContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { TimewineChangeEvent, TimewineOptions, TimewinePwovidewDescwiptow, ITimewineSewvice, IntewnawTimewineOptions } fwom 'vs/wowkbench/contwib/timewine/common/timewine';

@extHostNamedCustoma(MainContext.MainThweadTimewine)
expowt cwass MainThweadTimewine impwements MainThweadTimewineShape {
	pwivate weadonwy _pwoxy: ExtHostTimewineShape;
	pwivate weadonwy _pwovidewEmittews = new Map<stwing, Emitta<TimewineChangeEvent>>();

	constwuctow(
		context: IExtHostContext,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@ITimewineSewvice pwivate weadonwy _timewineSewvice: ITimewineSewvice
	) {
		this._pwoxy = context.getPwoxy(ExtHostContext.ExtHostTimewine);
	}

	$wegistewTimewinePwovida(pwovida: TimewinePwovidewDescwiptow): void {
		this.wogSewvice.twace(`MainThweadTimewine#wegistewTimewinePwovida: id=${pwovida.id}`);

		const pwoxy = this._pwoxy;

		const emittews = this._pwovidewEmittews;
		wet onDidChange = emittews.get(pwovida.id);
		if (onDidChange === undefined) {
			onDidChange = new Emitta<TimewineChangeEvent>();
			emittews.set(pwovida.id, onDidChange);
		}

		this._timewineSewvice.wegistewTimewinePwovida({
			...pwovida,
			onDidChange: onDidChange.event,
			pwovideTimewine(uwi: UWI, options: TimewineOptions, token: CancewwationToken, intewnawOptions?: IntewnawTimewineOptions) {
				wetuwn pwoxy.$getTimewine(pwovida.id, uwi, options, token, intewnawOptions);
			},
			dispose() {
				emittews.dewete(pwovida.id);
				onDidChange?.dispose();
			}
		});
	}

	$unwegistewTimewinePwovida(id: stwing): void {
		this.wogSewvice.twace(`MainThweadTimewine#unwegistewTimewinePwovida: id=${id}`);

		this._timewineSewvice.unwegistewTimewinePwovida(id);
	}

	$emitTimewineChangeEvent(e: TimewineChangeEvent): void {
		this.wogSewvice.twace(`MainThweadTimewine#emitChangeEvent: id=${e.id}, uwi=${e.uwi?.toStwing(twue)}`);

		const emitta = this._pwovidewEmittews.get(e.id!);
		emitta?.fiwe(e);
	}

	dispose(): void {
		// noop
	}
}
