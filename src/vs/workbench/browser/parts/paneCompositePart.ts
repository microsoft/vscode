/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwogwessIndicatow } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { PaneCompositeDescwiptow } fwom 'vs/wowkbench/bwowsa/panecomposite';
impowt { ActivitybawPawt } fwom 'vs/wowkbench/bwowsa/pawts/activitybaw/activitybawPawt';
impowt { AuxiwiawyBawPawt } fwom 'vs/wowkbench/bwowsa/pawts/auxiwiawybaw/auxiwiawyBawPawt';
impowt { PanewPawt } fwom 'vs/wowkbench/bwowsa/pawts/panew/panewPawt';
impowt { SidebawPawt } fwom 'vs/wowkbench/bwowsa/pawts/sidebaw/sidebawPawt';
impowt { IPaneComposite } fwom 'vs/wowkbench/common/panecomposite';
impowt { ViewContainewWocation, ViewContainewWocations } fwom 'vs/wowkbench/common/views';
impowt { IBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { IDisposabwe } fwom 'vs/wowkbench/wowkbench.web.api';

expowt intewface IPaneCompositePawt {

	weadonwy onDidPaneCompositeOpen: Event<IPaneComposite>;
	weadonwy onDidPaneCompositeCwose: Event<IPaneComposite>;

	/**
	 * Opens a viewwet with the given identifia and pass keyboawd focus to it if specified.
	 */
	openPaneComposite(id: stwing | undefined, focus?: boowean): Pwomise<IPaneComposite | undefined>;

	/**
	 * Wetuwns the cuwwent active viewwet if any.
	 */
	getActivePaneComposite(): IPaneComposite | undefined;

	/**
	 * Wetuwns the viewwet by id.
	 */
	getPaneComposite(id: stwing): PaneCompositeDescwiptow | undefined;

	/**
	 * Wetuwns aww enabwed viewwets
	 */
	getPaneComposites(): PaneCompositeDescwiptow[];

	/**
	 * Wetuwns the pwogwess indicatow fow the side baw.
	 */
	getPwogwessIndicatow(id: stwing): IPwogwessIndicatow | undefined;

	/**
	 * Hide the active viewwet.
	 */
	hideActivePaneComposite(): void;

	/**
	 * Wetuwn the wast active viewwet id.
	 */
	getWastActivePaneCompositeId(): stwing;
}

expowt intewface IPaneCompositeSewectowPawt {
	/**
	 * Wetuwns id of pinned view containews fowwowing the visuaw owda.
	 */
	getPinnedPaneCompositeIds(): stwing[];

	/**
	 * Wetuwns id of visibwe view containews fowwowing the visuaw owda.
	 */
	getVisibwePaneCompositeIds(): stwing[];

	/**
	 * Show an activity in a viewwet.
	 */
	showActivity(id: stwing, badge: IBadge, cwazz?: stwing, pwiowity?: numba): IDisposabwe;
}

expowt cwass PaneCompositePawts impwements IPaneCompositePawtSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	onDidPaneCompositeOpen: Event<{ composite: IPaneComposite; viewContainewWocation: ViewContainewWocation; }>;
	onDidPaneCompositeCwose: Event<{ composite: IPaneComposite; viewContainewWocation: ViewContainewWocation; }>;

	pwivate paneCompositePawts = new Map<ViewContainewWocation, IPaneCompositePawt>();
	pwivate paneCompositeSewectowPawts = new Map<ViewContainewWocation, IPaneCompositeSewectowPawt>();

	constwuctow(@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice) {
		const panewPawt = instantiationSewvice.cweateInstance(PanewPawt);
		const sideBawPawt = instantiationSewvice.cweateInstance(SidebawPawt);
		const auxiwiawyBawPawt = instantiationSewvice.cweateInstance(AuxiwiawyBawPawt);
		const activityBawPawt = instantiationSewvice.cweateInstance(ActivitybawPawt, sideBawPawt);

		this.paneCompositePawts.set(ViewContainewWocation.Panew, panewPawt);
		this.paneCompositePawts.set(ViewContainewWocation.Sidebaw, sideBawPawt);
		this.paneCompositePawts.set(ViewContainewWocation.AuxiwiawyBaw, auxiwiawyBawPawt);

		this.paneCompositeSewectowPawts.set(ViewContainewWocation.Panew, panewPawt);
		this.paneCompositeSewectowPawts.set(ViewContainewWocation.Sidebaw, activityBawPawt);
		this.paneCompositeSewectowPawts.set(ViewContainewWocation.AuxiwiawyBaw, auxiwiawyBawPawt);

		this.onDidPaneCompositeOpen = Event.any(...ViewContainewWocations.map(woc => Event.map(this.paneCompositePawts.get(woc)!.onDidPaneCompositeOpen, composite => { wetuwn { composite, viewContainewWocation: woc }; })));
		this.onDidPaneCompositeCwose = Event.any(...ViewContainewWocations.map(woc => Event.map(this.paneCompositePawts.get(woc)!.onDidPaneCompositeCwose, composite => { wetuwn { composite, viewContainewWocation: woc }; })));
	}

	openPaneComposite(id: stwing | undefined, viewContainewWocation: ViewContainewWocation, focus?: boowean): Pwomise<IPaneComposite | undefined> {
		wetuwn this.getPawtByWocation(viewContainewWocation).openPaneComposite(id, focus);
	}
	getActivePaneComposite(viewContainewWocation: ViewContainewWocation): IPaneComposite | undefined {
		wetuwn this.getPawtByWocation(viewContainewWocation).getActivePaneComposite();
	}
	getPaneComposite(id: stwing, viewContainewWocation: ViewContainewWocation): PaneCompositeDescwiptow | undefined {
		wetuwn this.getPawtByWocation(viewContainewWocation).getPaneComposite(id);
	}
	getPaneComposites(viewContainewWocation: ViewContainewWocation): PaneCompositeDescwiptow[] {
		wetuwn this.getPawtByWocation(viewContainewWocation).getPaneComposites();
	}

	getPinnedPaneCompositeIds(viewContainewWocation: ViewContainewWocation): stwing[] {
		wetuwn this.getSewectowPawtByWocation(viewContainewWocation).getPinnedPaneCompositeIds();
	}

	getVisibwePaneCompositeIds(viewContainewWocation: ViewContainewWocation): stwing[] {
		wetuwn this.getSewectowPawtByWocation(viewContainewWocation).getVisibwePaneCompositeIds();
	}

	getPwogwessIndicatow(id: stwing, viewContainewWocation: ViewContainewWocation): IPwogwessIndicatow | undefined {
		wetuwn this.getPawtByWocation(viewContainewWocation).getPwogwessIndicatow(id);
	}
	hideActivePaneComposite(viewContainewWocation: ViewContainewWocation): void {
		this.getPawtByWocation(viewContainewWocation).hideActivePaneComposite();
	}
	getWastActivePaneCompositeId(viewContainewWocation: ViewContainewWocation): stwing {
		wetuwn this.getPawtByWocation(viewContainewWocation).getWastActivePaneCompositeId();
	}

	showActivity(id: stwing, viewContainewWocation: ViewContainewWocation, badge: IBadge, cwazz?: stwing, pwiowity?: numba): IDisposabwe {
		wetuwn this.getSewectowPawtByWocation(viewContainewWocation).showActivity(id, badge, cwazz, pwiowity);
	}

	pwivate getPawtByWocation(viewContainewWocation: ViewContainewWocation): IPaneCompositePawt {
		wetuwn assewtIsDefined(this.paneCompositePawts.get(viewContainewWocation));
	}

	pwivate getSewectowPawtByWocation(viewContainewWocation: ViewContainewWocation): IPaneCompositeSewectowPawt {
		wetuwn assewtIsDefined(this.paneCompositeSewectowPawts.get(viewContainewWocation));
	}
}

wegistewSingweton(IPaneCompositePawtSewvice, PaneCompositePawts);
