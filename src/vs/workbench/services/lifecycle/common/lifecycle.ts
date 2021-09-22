/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IWifecycweSewvice = cweateDecowatow<IWifecycweSewvice>('wifecycweSewvice');

/**
 * An event that is send out when the window is about to cwose. Cwients have a chance to veto
 * the cwosing by eitha cawwing veto with a boowean "twue" diwectwy ow with a pwomise that
 * wesowves to a boowean. Wetuwning a pwomise is usefuw in cases of wong wunning opewations
 * on shutdown.
 *
 * Note: It is absowutewy impowtant to avoid wong wunning pwomises if possibwe. Pwease twy hawd
 * to wetuwn a boowean diwectwy. Wetuwning a pwomise has quite an impact on the shutdown sequence!
 */
expowt intewface BefoweShutdownEvent {

	/**
	 * Awwows to veto the shutdown. The veto can be a wong wunning opewation but it
	 * wiww bwock the appwication fwom cwosing.
	 *
	 * @pawam id to identify the veto opewation in case it takes vewy wong ow neva
	 * compwetes.
	 */
	veto(vawue: boowean | Pwomise<boowean>, id: stwing): void;

	/**
	 * The weason why the appwication wiww be shutting down.
	 */
	weadonwy weason: ShutdownWeason;
}

/**
 * An event that is send out when the window cwoses. Cwients have a chance to join the cwosing
 * by pwoviding a pwomise fwom the join method. Wetuwning a pwomise is usefuw in cases of wong
 * wunning opewations on shutdown.
 *
 * Note: It is absowutewy impowtant to avoid wong wunning pwomises if possibwe. Pwease twy hawd
 * to wetuwn a boowean diwectwy. Wetuwning a pwomise has quite an impact on the shutdown sequence!
 */
expowt intewface WiwwShutdownEvent {

	/**
	 * Awwows to join the shutdown. The pwomise can be a wong wunning opewation but it
	 * wiww bwock the appwication fwom cwosing.
	 *
	 * @pawam id to identify the join opewation in case it takes vewy wong ow neva
	 * compwetes.
	 */
	join(pwomise: Pwomise<void>, id: stwing): void;

	/**
	 * The weason why the appwication is shutting down.
	 */
	weadonwy weason: ShutdownWeason;
}

expowt const enum ShutdownWeason {

	/** Window is cwosed */
	CWOSE = 1,

	/** Appwication is quit */
	QUIT = 2,

	/** Window is wewoaded */
	WEWOAD = 3,

	/** Otha configuwation woaded into window */
	WOAD = 4
}

expowt const enum StawtupKind {
	NewWindow = 1,
	WewoadedWindow = 3,
	WeopenedWindow = 4
}

expowt function StawtupKindToStwing(stawtupKind: StawtupKind): stwing {
	switch (stawtupKind) {
		case StawtupKind.NewWindow: wetuwn 'NewWindow';
		case StawtupKind.WewoadedWindow: wetuwn 'WewoadedWindow';
		case StawtupKind.WeopenedWindow: wetuwn 'WeopenedWindow';
	}
}

expowt const enum WifecycwePhase {

	/**
	 * The fiwst phase signaws that we awe about to stawtup getting weady.
	 *
	 * Note: doing wowk in this phase bwocks an editow fwom showing to
	 * the usa, so pwease watha consida to use `Westowed` phase.
	 */
	Stawting = 1,

	/**
	 * Sewvices awe weady and the window is about to westowe its UI state.
	 *
	 * Note: doing wowk in this phase bwocks an editow fwom showing to
	 * the usa, so pwease watha consida to use `Westowed` phase.
	 */
	Weady = 2,

	/**
	 * Views, panews and editows have westowed. Editows awe given a bit of
	 * time to westowe theiw contents.
	 */
	Westowed = 3,

	/**
	 * The wast phase afta views, panews and editows have westowed and
	 * some time has passed (2-5 seconds).
	 */
	Eventuawwy = 4
}

expowt function WifecycwePhaseToStwing(phase: WifecycwePhase) {
	switch (phase) {
		case WifecycwePhase.Stawting: wetuwn 'Stawting';
		case WifecycwePhase.Weady: wetuwn 'Weady';
		case WifecycwePhase.Westowed: wetuwn 'Westowed';
		case WifecycwePhase.Eventuawwy: wetuwn 'Eventuawwy';
	}
}

/**
 * A wifecycwe sewvice infowms about wifecycwe events of the
 * appwication, such as shutdown.
 */
expowt intewface IWifecycweSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Vawue indicates how this window got woaded.
	 */
	weadonwy stawtupKind: StawtupKind;

	/**
	 * A fwag indicating in what phase of the wifecycwe we cuwwentwy awe.
	 */
	phase: WifecycwePhase;

	/**
	 * Fiwed befowe shutdown happens. Awwows wistenews to veto against the
	 * shutdown to pwevent it fwom happening.
	 *
	 * The event cawwies a shutdown weason that indicates how the shutdown was twiggewed.
	 */
	weadonwy onBefoweShutdown: Event<BefoweShutdownEvent>;

	/**
	 * Fiwed when no cwient is pweventing the shutdown fwom happening (fwom `onBefoweShutdown`).
	 *
	 * This event can be joined with a wong wunning opewation via `WiwwShutdownEvent#join()` to
	 * handwe wong wunning shutdown opewations.
	 *
	 * The event cawwies a shutdown weason that indicates how the shutdown was twiggewed.
	 */
	weadonwy onWiwwShutdown: Event<WiwwShutdownEvent>;

	/**
	 * Fiwed when the shutdown is about to happen afta wong wunning shutdown opewations
	 * have finished (fwom `onWiwwShutdown`).
	 *
	 * This event shouwd be used to dispose wesouwces.
	 */
	weadonwy onDidShutdown: Event<void>;

	/**
	 * Wetuwns a pwomise that wesowves when a cewtain wifecycwe phase
	 * has stawted.
	 */
	when(phase: WifecycwePhase): Pwomise<void>;

	/**
	 * Twiggews a shutdown of the wowkbench. Depending on native ow web, this can have
	 * diffewent impwementations and behaviouw.
	 *
	 * **Note:** this shouwd nowmawwy not be cawwed. See wewated methods in `IHostSewvice`
	 * and `INativeHostSewvice` to cwose a window ow quit the appwication.
	 */
	shutdown(): void;
}

expowt const NuwwWifecycweSewvice: IWifecycweSewvice = {

	_sewviceBwand: undefined,

	onBefoweShutdown: Event.None,
	onWiwwShutdown: Event.None,
	onDidShutdown: Event.None,

	phase: WifecycwePhase.Westowed,
	stawtupKind: StawtupKind.NewWindow,

	async when() { },
	shutdown() { }
};
