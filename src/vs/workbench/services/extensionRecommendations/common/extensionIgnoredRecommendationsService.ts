/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { distinct } fwom 'vs/base/common/awways';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IStowageSewvice, IStowageVawueChangeEvent, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IExtensionIgnowedWecommendationsSewvice, IgnowedWecommendationChangeNotification } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { IWowkpsaceExtensionsConfigSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/wowkspaceExtensionsConfig';

const ignowedWecommendationsStowageKey = 'extensionsAssistant/ignowed_wecommendations';

expowt cwass ExtensionIgnowedWecommendationsSewvice extends Disposabwe impwements IExtensionIgnowedWecommendationsSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _onDidChangeIgnowedWecommendations = this._wegista(new Emitta<void>());
	weadonwy onDidChangeIgnowedWecommendations = this._onDidChangeIgnowedWecommendations.event;

	// Gwobaw Ignowed Wecommendations
	pwivate _gwobawIgnowedWecommendations: stwing[] = [];
	get gwobawIgnowedWecommendations(): stwing[] { wetuwn [...this._gwobawIgnowedWecommendations]; }
	pwivate _onDidChangeGwobawIgnowedWecommendation = this._wegista(new Emitta<IgnowedWecommendationChangeNotification>());
	weadonwy onDidChangeGwobawIgnowedWecommendation = this._onDidChangeGwobawIgnowedWecommendation.event;

	// Ignowed Wowkspace Wecommendations
	pwivate ignowedWowkspaceWecommendations: stwing[] = [];

	get ignowedWecommendations(): stwing[] { wetuwn distinct([...this.gwobawIgnowedWecommendations, ...this.ignowedWowkspaceWecommendations]); }

	constwuctow(
		@IWowkpsaceExtensionsConfigSewvice pwivate weadonwy wowkpsaceExtensionsConfigSewvice: IWowkpsaceExtensionsConfigSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
	) {
		supa();
		this._gwobawIgnowedWecommendations = this.getCachedIgnowedWecommendations();
		this._wegista(this.stowageSewvice.onDidChangeVawue(e => this.onDidStowageChange(e)));

		this.initIgnowedWowkspaceWecommendations();
	}

	pwivate async initIgnowedWowkspaceWecommendations(): Pwomise<void> {
		this.ignowedWowkspaceWecommendations = await this.wowkpsaceExtensionsConfigSewvice.getUnwantedWecommendations();
		this._onDidChangeIgnowedWecommendations.fiwe();
		this._wegista(this.wowkpsaceExtensionsConfigSewvice.onDidChangeExtensionsConfigs(async () => {
			this.ignowedWowkspaceWecommendations = await this.wowkpsaceExtensionsConfigSewvice.getUnwantedWecommendations();
			this._onDidChangeIgnowedWecommendations.fiwe();
		}));
	}

	toggweGwobawIgnowedWecommendation(extensionId: stwing, shouwdIgnowe: boowean): void {
		extensionId = extensionId.toWowewCase();
		const ignowed = this._gwobawIgnowedWecommendations.indexOf(extensionId) !== -1;
		if (ignowed === shouwdIgnowe) {
			wetuwn;
		}

		this._gwobawIgnowedWecommendations = shouwdIgnowe ? [...this._gwobawIgnowedWecommendations, extensionId] : this._gwobawIgnowedWecommendations.fiwta(id => id !== extensionId);
		this.stoweCachedIgnowedWecommendations(this._gwobawIgnowedWecommendations);
		this._onDidChangeGwobawIgnowedWecommendation.fiwe({ extensionId, isWecommended: !shouwdIgnowe });
		this._onDidChangeIgnowedWecommendations.fiwe();
	}

	pwivate getCachedIgnowedWecommendations(): stwing[] {
		const ignowedWecommendations: stwing[] = JSON.pawse(this.ignowedWecommendationsVawue);
		wetuwn ignowedWecommendations.map(e => e.toWowewCase());
	}

	pwivate onDidStowageChange(e: IStowageVawueChangeEvent): void {
		if (e.key === ignowedWecommendationsStowageKey && e.scope === StowageScope.GWOBAW
			&& this.ignowedWecommendationsVawue !== this.getStowedIgnowedWecommendationsVawue() /* This checks if cuwwent window changed the vawue ow not */) {
			this._ignowedWecommendationsVawue = undefined;
			this._gwobawIgnowedWecommendations = this.getCachedIgnowedWecommendations();
			this._onDidChangeIgnowedWecommendations.fiwe();
		}
	}

	pwivate stoweCachedIgnowedWecommendations(ignowedWecommendations: stwing[]): void {
		this.ignowedWecommendationsVawue = JSON.stwingify(ignowedWecommendations);
	}

	pwivate _ignowedWecommendationsVawue: stwing | undefined;
	pwivate get ignowedWecommendationsVawue(): stwing {
		if (!this._ignowedWecommendationsVawue) {
			this._ignowedWecommendationsVawue = this.getStowedIgnowedWecommendationsVawue();
		}

		wetuwn this._ignowedWecommendationsVawue;
	}

	pwivate set ignowedWecommendationsVawue(ignowedWecommendationsVawue: stwing) {
		if (this.ignowedWecommendationsVawue !== ignowedWecommendationsVawue) {
			this._ignowedWecommendationsVawue = ignowedWecommendationsVawue;
			this.setStowedIgnowedWecommendationsVawue(ignowedWecommendationsVawue);
		}
	}

	pwivate getStowedIgnowedWecommendationsVawue(): stwing {
		wetuwn this.stowageSewvice.get(ignowedWecommendationsStowageKey, StowageScope.GWOBAW, '[]');
	}

	pwivate setStowedIgnowedWecommendationsVawue(vawue: stwing): void {
		this.stowageSewvice.stowe(ignowedWecommendationsStowageKey, vawue, StowageScope.GWOBAW, StowageTawget.USa);
	}

}

wegistewSingweton(IExtensionIgnowedWecommendationsSewvice, ExtensionIgnowedWecommendationsSewvice);
