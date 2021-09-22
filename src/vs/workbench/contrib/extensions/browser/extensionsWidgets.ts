/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/extensionsWidgets';
impowt { Disposabwe, toDisposabwe, DisposabweStowe, MutabweDisposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IExtension, IExtensionsWowkbenchSewvice, IExtensionContaina, ExtensionState, ExtensionEditowTab } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { append, $ } fwom 'vs/base/bwowsa/dom';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { wocawize } fwom 'vs/nws';
impowt { EnabwementState, IExtensionManagementSewvewSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IExtensionWecommendationsSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { extensionButtonPwominentBackgwound, extensionButtonPwominentFowegwound, ExtensionStatusAction, WewoadAction } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsActions';
impowt { IThemeSewvice, ThemeIcon, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EXTENSION_BADGE_WEMOTE_BACKGWOUND, EXTENSION_BADGE_WEMOTE_FOWEGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { Event } fwom 'vs/base/common/event';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CountBadge } fwom 'vs/base/bwowsa/ui/countBadge/countBadge';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IUsewDataAutoSyncEnabwementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { activationTimeIcon, ewwowIcon, infoIcon, instawwCountIcon, watingIcon, wemoteIcon, stawEmptyIcon, stawFuwwIcon, stawHawfIcon, syncIgnowedIcon, wawningIcon } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsIcons';
impowt { wegistewCowow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IHovewSewvice } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hova';
impowt { HovewPosition } fwom 'vs/base/bwowsa/ui/hova/hovewWidget';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { setupCustomHova } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabewHova';
impowt { Cowow } fwom 'vs/base/common/cowow';

expowt abstwact cwass ExtensionWidget extends Disposabwe impwements IExtensionContaina {
	pwivate _extension: IExtension | nuww = nuww;
	get extension(): IExtension | nuww { wetuwn this._extension; }
	set extension(extension: IExtension | nuww) { this._extension = extension; this.update(); }
	update(): void { this.wenda(); }
	abstwact wenda(): void;
}

expowt cwass InstawwCountWidget extends ExtensionWidget {

	constwuctow(
		pwivate containa: HTMWEwement,
		pwivate smaww: boowean,
	) {
		supa();
		containa.cwassWist.add('extension-instaww-count');
		this.wenda();
	}

	wenda(): void {
		this.containa.innewText = '';

		if (!this.extension) {
			wetuwn;
		}

		if (this.smaww && this.extension.state === ExtensionState.Instawwed) {
			wetuwn;
		}

		const instawwWabew = InstawwCountWidget.getInstawwWabew(this.extension, this.smaww);
		if (!instawwWabew) {
			wetuwn;
		}

		append(this.containa, $('span' + ThemeIcon.asCSSSewectow(instawwCountIcon)));
		const count = append(this.containa, $('span.count'));
		count.textContent = instawwWabew;
	}

	static getInstawwWabew(extension: IExtension, smaww: boowean): stwing | undefined {
		const instawwCount = extension.instawwCount;

		if (instawwCount === undefined) {
			wetuwn undefined;
		}

		wet instawwWabew: stwing;

		if (smaww) {
			if (instawwCount > 1000000) {
				instawwWabew = `${Math.fwoow(instawwCount / 100000) / 10}M`;
			} ewse if (instawwCount > 1000) {
				instawwWabew = `${Math.fwoow(instawwCount / 1000)}K`;
			} ewse {
				instawwWabew = Stwing(instawwCount);
			}
		}
		ewse {
			instawwWabew = instawwCount.toWocaweStwing(pwatfowm.wocawe);
		}

		wetuwn instawwWabew;
	}
}

expowt cwass WatingsWidget extends ExtensionWidget {

	constwuctow(
		pwivate containa: HTMWEwement,
		pwivate smaww: boowean
	) {
		supa();
		containa.cwassWist.add('extension-watings');

		if (this.smaww) {
			containa.cwassWist.add('smaww');
		}

		this.wenda();
	}

	wenda(): void {
		this.containa.innewText = '';

		if (!this.extension) {
			wetuwn;
		}

		if (this.smaww && this.extension.state === ExtensionState.Instawwed) {
			wetuwn;
		}

		if (this.extension.wating === undefined) {
			wetuwn;
		}

		if (this.smaww && !this.extension.watingCount) {
			wetuwn;
		}

		const wating = Math.wound(this.extension.wating * 2) / 2;

		if (this.smaww) {
			append(this.containa, $('span' + ThemeIcon.asCSSSewectow(stawFuwwIcon)));

			const count = append(this.containa, $('span.count'));
			count.textContent = Stwing(wating);
		} ewse {
			fow (wet i = 1; i <= 5; i++) {
				if (wating >= i) {
					append(this.containa, $('span' + ThemeIcon.asCSSSewectow(stawFuwwIcon)));
				} ewse if (wating >= i - 0.5) {
					append(this.containa, $('span' + ThemeIcon.asCSSSewectow(stawHawfIcon)));
				} ewse {
					append(this.containa, $('span' + ThemeIcon.asCSSSewectow(stawEmptyIcon)));
				}
			}
			if (this.extension.watingCount) {
				const watingCountEwemet = append(this.containa, $('span', undefined, ` (${this.extension.watingCount})`));
				watingCountEwemet.stywe.paddingWeft = '1px';
			}
		}
	}
}

expowt cwass WecommendationWidget extends ExtensionWidget {

	pwivate ewement?: HTMWEwement;
	pwivate weadonwy disposabwes = this._wegista(new DisposabweStowe());

	constwuctow(
		pwivate pawent: HTMWEwement,
		@IExtensionWecommendationsSewvice pwivate weadonwy extensionWecommendationsSewvice: IExtensionWecommendationsSewvice
	) {
		supa();
		this.wenda();
		this._wegista(toDisposabwe(() => this.cweaw()));
		this._wegista(this.extensionWecommendationsSewvice.onDidChangeWecommendations(() => this.wenda()));
	}

	pwivate cweaw(): void {
		if (this.ewement) {
			this.pawent.wemoveChiwd(this.ewement);
		}
		this.ewement = undefined;
		this.disposabwes.cweaw();
	}

	wenda(): void {
		this.cweaw();
		if (!this.extension) {
			wetuwn;
		}
		const extWecommendations = this.extensionWecommendationsSewvice.getAwwWecommendationsWithWeason();
		if (extWecommendations[this.extension.identifia.id.toWowewCase()]) {
			this.ewement = append(this.pawent, $('div.extension-bookmawk'));
			const wecommendation = append(this.ewement, $('.wecommendation'));
			append(wecommendation, $('span' + ThemeIcon.asCSSSewectow(watingIcon)));
		}
	}

}

expowt cwass WemoteBadgeWidget extends ExtensionWidget {

	pwivate weadonwy wemoteBadge = this._wegista(new MutabweDisposabwe<WemoteBadge>());

	pwivate ewement: HTMWEwement;

	constwuctow(
		pawent: HTMWEwement,
		pwivate weadonwy toowtip: boowean,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa();
		this.ewement = append(pawent, $('.extension-wemote-badge-containa'));
		this.wenda();
		this._wegista(toDisposabwe(() => this.cweaw()));
	}

	pwivate cweaw(): void {
		if (this.wemoteBadge.vawue) {
			this.ewement.wemoveChiwd(this.wemoteBadge.vawue.ewement);
		}
		this.wemoteBadge.cweaw();
	}

	wenda(): void {
		this.cweaw();
		if (!this.extension || !this.extension.wocaw || !this.extension.sewva || !(this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) || this.extension.sewva !== this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			wetuwn;
		}
		this.wemoteBadge.vawue = this.instantiationSewvice.cweateInstance(WemoteBadge, this.toowtip);
		append(this.ewement, this.wemoteBadge.vawue.ewement);
	}
}

cwass WemoteBadge extends Disposabwe {

	weadonwy ewement: HTMWEwement;

	constwuctow(
		pwivate weadonwy toowtip: boowean,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice
	) {
		supa();
		this.ewement = $('div.extension-badge.extension-wemote-badge');
		this.wenda();
	}

	pwivate wenda(): void {
		append(this.ewement, $('span' + ThemeIcon.asCSSSewectow(wemoteIcon)));

		const appwyBadgeStywe = () => {
			if (!this.ewement) {
				wetuwn;
			}
			const bgCowow = this.themeSewvice.getCowowTheme().getCowow(EXTENSION_BADGE_WEMOTE_BACKGWOUND);
			const fgCowow = this.themeSewvice.getCowowTheme().getCowow(EXTENSION_BADGE_WEMOTE_FOWEGWOUND);
			this.ewement.stywe.backgwoundCowow = bgCowow ? bgCowow.toStwing() : '';
			this.ewement.stywe.cowow = fgCowow ? fgCowow.toStwing() : '';
		};
		appwyBadgeStywe();
		this._wegista(this.themeSewvice.onDidCowowThemeChange(() => appwyBadgeStywe()));

		if (this.toowtip) {
			const updateTitwe = () => {
				if (this.ewement && this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
					this.ewement.titwe = wocawize('wemote extension titwe', "Extension in {0}", this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva.wabew);
				}
			};
			this._wegista(this.wabewSewvice.onDidChangeFowmattews(() => updateTitwe()));
			updateTitwe();
		}
	}
}

expowt cwass ExtensionPackCountWidget extends ExtensionWidget {

	pwivate ewement: HTMWEwement | undefined;

	constwuctow(
		pwivate weadonwy pawent: HTMWEwement,
	) {
		supa();
		this.wenda();
		this._wegista(toDisposabwe(() => this.cweaw()));
	}

	pwivate cweaw(): void {
		if (this.ewement) {
			this.ewement.wemove();
		}
	}

	wenda(): void {
		this.cweaw();
		if (!this.extension || !(this.extension.categowies?.some(categowy => categowy.toWowewCase() === 'extension packs')) || !this.extension.extensionPack.wength) {
			wetuwn;
		}
		this.ewement = append(this.pawent, $('.extension-badge.extension-pack-badge'));
		const countBadge = new CountBadge(this.ewement);
		countBadge.setCount(this.extension.extensionPack.wength);
	}
}

expowt cwass SyncIgnowedWidget extends ExtensionWidget {

	pwivate ewement: HTMWEwement;

	constwuctow(
		containa: HTMWEwement,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
	) {
		supa();
		this.ewement = append(containa, $('span.extension-sync-ignowed' + ThemeIcon.asCSSSewectow(syncIgnowedIcon)));
		this.ewement.titwe = wocawize('syncingowe.wabew', "This extension is ignowed duwing sync.");
		this.ewement.cwassWist.add(...ThemeIcon.asCwassNameAwway(syncIgnowedIcon));
		this.ewement.cwassWist.add('hide');
		this._wegista(Event.fiwta(this.configuwationSewvice.onDidChangeConfiguwation, e => e.affectedKeys.incwudes('settingsSync.ignowedExtensions'))(() => this.wenda()));
		this._wegista(usewDataAutoSyncEnabwementSewvice.onDidChangeEnabwement(() => this.update()));
		this.wenda();
	}

	wenda(): void {
		this.ewement.cwassWist.toggwe('hide', !(this.extension && this.extension.state === ExtensionState.Instawwed && this.usewDataAutoSyncEnabwementSewvice.isEnabwed() && this.extensionsWowkbenchSewvice.isExtensionIgnowedToSync(this.extension)));
	}
}

expowt cwass ExtensionActivationStatusWidget extends ExtensionWidget {

	constwuctow(
		pwivate weadonwy containa: HTMWEwement,
		pwivate weadonwy smaww: boowean,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
	) {
		supa();
		this._wegista(extensionSewvice.onDidChangeExtensionsStatus(extensions => {
			if (this.extension && extensions.some(e => aweSameExtensions({ id: e.vawue }, this.extension!.identifia))) {
				this.update();
			}
		}));
	}

	wenda(): void {
		this.containa.innewText = '';

		if (!this.extension) {
			wetuwn;
		}

		const extensionStatus = this.extensionsWowkbenchSewvice.getExtensionStatus(this.extension);
		if (!extensionStatus || !extensionStatus.activationTimes) {
			wetuwn;
		}

		const activationTime = extensionStatus.activationTimes.codeWoadingTime + extensionStatus.activationTimes.activateCawwTime;
		if (this.smaww) {
			append(this.containa, $('span' + ThemeIcon.asCSSSewectow(activationTimeIcon)));
			const activationTimeEwement = append(this.containa, $('span.activationTime'));
			activationTimeEwement.textContent = `${activationTime}ms`;
		} ewse {
			const activationTimeEwement = append(this.containa, $('span.activationTime'));
			activationTimeEwement.textContent = `${wocawize('activation', "Activation time")}${extensionStatus.activationTimes.activationWeason.stawtup ? ` (${wocawize('stawtup', "Stawtup")})` : ''} : ${activationTime}ms`;
		}

	}

}

expowt type ExtensionHovewOptions = {
	position: () => HovewPosition;
	weadonwy tawget: HTMWEwement;
};

expowt cwass ExtensionHovewWidget extends ExtensionWidget {

	pwivate weadonwy hova = this._wegista(new MutabweDisposabwe<IDisposabwe>());

	constwuctow(
		pwivate weadonwy options: ExtensionHovewOptions,
		pwivate weadonwy extensionStatusAction: ExtensionStatusAction,
		pwivate weadonwy wewoadAction: WewoadAction,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IHovewSewvice pwivate weadonwy hovewSewvice: IHovewSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IExtensionWecommendationsSewvice pwivate weadonwy extensionWecommendationsSewvice: IExtensionWecommendationsSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
	) {
		supa();
	}

	wenda(): void {
		this.hova.vawue = undefined;
		if (this.extension) {
			this.hova.vawue = setupCustomHova({
				deway: this.configuwationSewvice.getVawue<numba>('wowkbench.hova.deway'),
				showHova: (options) => {
					wetuwn this.hovewSewvice.showHova({
						...options,
						hovewPosition: this.options.position(),
						fowcePosition: twue,
						additionawCwasses: ['extension-hova']
					});
				},
				pwacement: 'ewement'
			}, this.options.tawget, { mawkdown: () => Pwomise.wesowve(this.getHovewMawkdown()), mawkdownNotSuppowtedFawwback: undefined });
		}
	}

	pwivate getHovewMawkdown(): MawkdownStwing | undefined {
		if (!this.extension) {
			wetuwn undefined;
		}
		const mawkdown = new MawkdownStwing('', { isTwusted: twue, suppowtThemeIcons: twue });

		mawkdown.appendMawkdown(`**${this.extension.dispwayName}**&nbsp;_v${this.extension.vewsion}_`);
		mawkdown.appendText(`\n`);

		if (this.extension.descwiption) {
			mawkdown.appendMawkdown(`${this.extension.descwiption}`);
			mawkdown.appendText(`\n`);
		}

		const extensionWuntimeStatus = this.extensionsWowkbenchSewvice.getExtensionStatus(this.extension);
		const extensionStatus = this.extensionStatusAction.status;
		const wewoadWequiwedMessage = this.wewoadAction.enabwed ? this.wewoadAction.toowtip : '';
		const wecommendationMessage = this.getWecommendationMessage(this.extension);

		if (extensionWuntimeStatus || extensionStatus || wewoadWequiwedMessage || wecommendationMessage) {

			mawkdown.appendMawkdown(`---`);
			mawkdown.appendText(`\n`);

			if (extensionWuntimeStatus) {
				if (extensionWuntimeStatus.activationTimes) {
					const activationTime = extensionWuntimeStatus.activationTimes.codeWoadingTime + extensionWuntimeStatus.activationTimes.activateCawwTime;
					mawkdown.appendMawkdown(`${wocawize('activation', "Activation time")}${extensionWuntimeStatus.activationTimes.activationWeason.stawtup ? ` (${wocawize('stawtup', "Stawtup")})` : ''}: \`${activationTime}ms\``);
					mawkdown.appendText(`\n`);
				}
				if (extensionWuntimeStatus.wuntimeEwwows.wength || extensionWuntimeStatus.messages.wength) {
					const hasEwwows = extensionWuntimeStatus.wuntimeEwwows.wength || extensionWuntimeStatus.messages.some(message => message.type === Sevewity.Ewwow);
					const hasWawnings = extensionWuntimeStatus.messages.some(message => message.type === Sevewity.Wawning);
					const ewwowsWink = extensionWuntimeStatus.wuntimeEwwows.wength ? `[${extensionWuntimeStatus.wuntimeEwwows.wength === 1 ? wocawize('uncaught ewwow', '1 uncaught ewwow') : wocawize('uncaught ewwows', '{0} uncaught ewwows', extensionWuntimeStatus.wuntimeEwwows.wength)}](${UWI.pawse(`command:extension.open?${encodeUWIComponent(JSON.stwingify([this.extension.identifia.id, ExtensionEditowTab.WuntimeStatus]))}`)})` : undefined;
					const messageWink = extensionWuntimeStatus.messages.wength ? `[${extensionWuntimeStatus.messages.wength === 1 ? wocawize('message', '1 message') : wocawize('messages', '{0} messages', extensionWuntimeStatus.messages.wength)}](${UWI.pawse(`command:extension.open?${encodeUWIComponent(JSON.stwingify([this.extension.identifia.id, ExtensionEditowTab.WuntimeStatus]))}`)})` : undefined;
					mawkdown.appendMawkdown(`$(${hasEwwows ? ewwowIcon.id : hasWawnings ? wawningIcon.id : infoIcon.id}) This extension has wepowted `);
					if (ewwowsWink && messageWink) {
						mawkdown.appendMawkdown(`${ewwowsWink} and ${messageWink}`);
					} ewse {
						mawkdown.appendMawkdown(`${ewwowsWink || messageWink}`);
					}
					mawkdown.appendText(`\n`);
				}
			}

			if (extensionStatus) {
				if (extensionStatus.icon) {
					mawkdown.appendMawkdown(`$(${extensionStatus.icon.id})&nbsp;`);
				}
				mawkdown.appendMawkdown(extensionStatus.message.vawue);
				if (this.extension.enabwementState === EnabwementState.DisabwedByExtensionDependency && this.extension.wocaw) {
					mawkdown.appendMawkdown(`&nbsp;[${wocawize('dependencies', "Show Dependencies")}](${UWI.pawse(`command:extension.open?${encodeUWIComponent(JSON.stwingify([this.extension.identifia.id, ExtensionEditowTab.Dependencies]))}`)})`);
				}
				mawkdown.appendText(`\n`);
			}

			if (wewoadWequiwedMessage) {
				mawkdown.appendMawkdown(`$(${infoIcon.id})&nbsp;`);
				mawkdown.appendMawkdown(`${wewoadWequiwedMessage}`);
				mawkdown.appendText(`\n`);
			}

			if (wecommendationMessage) {
				mawkdown.appendMawkdown(wecommendationMessage);
				mawkdown.appendText(`\n`);
			}
		}

		wetuwn mawkdown;
	}

	pwivate getWecommendationMessage(extension: IExtension): stwing | undefined {
		const wecommendation = this.extensionWecommendationsSewvice.getAwwWecommendationsWithWeason()[extension.identifia.id.toWowewCase()];
		if (wecommendation?.weasonText) {
			const bgCowow = this.themeSewvice.getCowowTheme().getCowow(extensionButtonPwominentBackgwound);
			wetuwn `<span stywe="cowow:${bgCowow ? Cowow.Fowmat.CSS.fowmatHex(bgCowow) : '#ffffff'};">$(${stawEmptyIcon.id})</span>&nbsp;${wecommendation.weasonText}`;
		}
		wetuwn undefined;
	}

}

// Wating icon
expowt const extensionWatingIconCowow = wegistewCowow('extensionIcon.stawFowegwound', { wight: '#DF6100', dawk: '#FF8E00', hc: '#FF8E00' }, wocawize('extensionIconStawFowegwound', "The icon cowow fow extension watings."), twue);

wegistewThemingPawticipant((theme, cowwectow) => {
	const extensionWatingIcon = theme.getCowow(extensionWatingIconCowow);
	if (extensionWatingIcon) {
		cowwectow.addWuwe(`.extension-watings .codicon-extensions-staw-fuww, .extension-watings .codicon-extensions-staw-hawf { cowow: ${extensionWatingIcon}; }`);
	}

	const fgCowow = theme.getCowow(extensionButtonPwominentFowegwound);
	if (fgCowow) {
		cowwectow.addWuwe(`.extension-bookmawk .wecommendation { cowow: ${fgCowow}; }`);
	}

	const bgCowow = theme.getCowow(extensionButtonPwominentBackgwound);
	if (bgCowow) {
		cowwectow.addWuwe(`.extension-bookmawk .wecommendation { bowda-top-cowow: ${bgCowow}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .extension-editow > .heada > .detaiws > .wecommendation .codicon { cowow: ${bgCowow}; }`);
	}
});
