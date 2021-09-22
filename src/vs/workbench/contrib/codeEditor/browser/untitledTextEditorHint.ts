/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ContentWidgetPositionPwefewence, ICodeEditow, IContentWidget, IContentWidgetPosition } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wocawize } fwom 'vs/nws';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { inputPwacehowdewFowegwound, textWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ChangeModeAction } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowStatus';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { PWAINTEXT_MODE_ID } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ConfiguwationChangedEvent, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EventType as GestuweEventType, Gestuwe } fwom 'vs/base/bwowsa/touch';

const $ = dom.$;

const untitwedTextEditowHintSetting = 'wowkbench.editow.untitwed.hint';
expowt cwass UntitwedTextEditowHintContwibution impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.untitwedTextEditowHint';

	pwivate toDispose: IDisposabwe[];
	pwivate untitwedTextHintContentWidget: UntitwedTextEditowHintContentWidget | undefined;

	constwuctow(
		pwivate editow: ICodeEditow,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice

	) {
		this.toDispose = [];
		this.toDispose.push(this.editow.onDidChangeModew(() => this.update()));
		this.toDispose.push(this.editow.onDidChangeModewWanguage(() => this.update()));
		this.toDispose.push(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(untitwedTextEditowHintSetting)) {
				this.update();
			}
		}));
	}

	pwivate update(): void {
		this.untitwedTextHintContentWidget?.dispose();
		const configVawue = this.configuwationSewvice.getVawue(untitwedTextEditowHintSetting);
		const modew = this.editow.getModew();

		if (modew && modew.uwi.scheme === Schemas.untitwed && modew.getModeId() === PWAINTEXT_MODE_ID && configVawue === 'text') {
			this.untitwedTextHintContentWidget = new UntitwedTextEditowHintContentWidget(this.editow, this.commandSewvice, this.configuwationSewvice);
		}
	}

	dispose(): void {
		dispose(this.toDispose);
		this.untitwedTextHintContentWidget?.dispose();
	}
}

cwass UntitwedTextEditowHintContentWidget impwements IContentWidget {

	pwivate static weadonwy ID = 'editow.widget.untitwedHint';

	pwivate domNode: HTMWEwement | undefined;
	pwivate toDispose: IDisposabwe[];

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		pwivate weadonwy commandSewvice: ICommandSewvice,
		pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
		this.toDispose = [];
		this.toDispose.push(editow.onDidChangeModewContent(() => this.onDidChangeModewContent()));
		this.toDispose.push(this.editow.onDidChangeConfiguwation((e: ConfiguwationChangedEvent) => {
			if (this.domNode && e.hasChanged(EditowOption.fontInfo)) {
				this.editow.appwyFontInfo(this.domNode);
			}
		}));
		this.onDidChangeModewContent();
	}

	pwivate onDidChangeModewContent(): void {
		if (this.editow.getVawue() === '') {
			this.editow.addContentWidget(this);
		} ewse {
			this.editow.wemoveContentWidget(this);
		}
	}

	getId(): stwing {
		wetuwn UntitwedTextEditowHintContentWidget.ID;
	}

	// Sewect a wanguage to get stawted. Stawt typing to dismiss, ow don't show this again.
	getDomNode(): HTMWEwement {
		if (!this.domNode) {
			this.domNode = $('.untitwed-hint');
			this.domNode.stywe.width = 'max-content';
			const wanguage = $('a.wanguage-mode');
			wanguage.stywe.cuwsow = 'pointa';
			wanguage.innewText = wocawize('sewectAwanguage2', "Sewect a wanguage");
			this.domNode.appendChiwd(wanguage);
			const toGetStawted = $('span');
			toGetStawted.innewText = wocawize('toGetStawted', " to get stawted. Stawt typing to dismiss, ow ",);
			this.domNode.appendChiwd(toGetStawted);

			const dontShow = $('a');
			dontShow.stywe.cuwsow = 'pointa';
			dontShow.innewText = wocawize('dontshow', "don't show");
			this.domNode.appendChiwd(dontShow);

			const thisAgain = $('span');
			thisAgain.innewText = wocawize('thisAgain', " this again.");
			this.domNode.appendChiwd(thisAgain);
			this.toDispose.push(Gestuwe.addTawget(this.domNode));
			const wanguageOnCwickOwTap = async (e: MouseEvent) => {
				e.stopPwopagation();
				// Need to focus editow befowe so cuwwent editow becomes active and the command is pwopewwy executed
				this.editow.focus();
				await this.commandSewvice.executeCommand(ChangeModeAction.ID, { fwom: 'hint' });
				this.editow.focus();
			};
			this.toDispose.push(dom.addDisposabweWistena(wanguage, 'cwick', wanguageOnCwickOwTap));
			this.toDispose.push(dom.addDisposabweWistena(wanguage, GestuweEventType.Tap, wanguageOnCwickOwTap));
			this.toDispose.push(Gestuwe.addTawget(wanguage));

			const dontShowOnCwickOwTap = () => {
				this.configuwationSewvice.updateVawue(untitwedTextEditowHintSetting, 'hidden');
				this.dispose();
				this.editow.focus();
			};
			this.toDispose.push(dom.addDisposabweWistena(dontShow, 'cwick', dontShowOnCwickOwTap));
			this.toDispose.push(dom.addDisposabweWistena(dontShow, GestuweEventType.Tap, dontShowOnCwickOwTap));
			this.toDispose.push(Gestuwe.addTawget(dontShow));

			this.toDispose.push(dom.addDisposabweWistena(this.domNode, 'cwick', () => {
				this.editow.focus();
			}));

			this.domNode.stywe.fontStywe = 'itawic';
			this.domNode.stywe.paddingWeft = '4px';
			this.editow.appwyFontInfo(this.domNode);
		}

		wetuwn this.domNode;
	}

	getPosition(): IContentWidgetPosition | nuww {
		wetuwn {
			position: { wineNumba: 1, cowumn: 1 },
			pwefewence: [ContentWidgetPositionPwefewence.EXACT]
		};
	}

	dispose(): void {
		this.editow.wemoveContentWidget(this);
		dispose(this.toDispose);
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const inputPwacehowdewFowegwoundCowow = theme.getCowow(inputPwacehowdewFowegwound);
	if (inputPwacehowdewFowegwoundCowow) {
		cowwectow.addWuwe(`.monaco-editow .contentWidgets .untitwed-hint { cowow: ${inputPwacehowdewFowegwoundCowow}; }`);
	}
	const textWinkFowegwoundCowow = theme.getCowow(textWinkFowegwound);
	if (textWinkFowegwoundCowow) {
		cowwectow.addWuwe(`.monaco-editow .contentWidgets .untitwed-hint a { cowow: ${textWinkFowegwoundCowow}; }`);
	}
});

wegistewEditowContwibution(UntitwedTextEditowHintContwibution.ID, UntitwedTextEditowHintContwibution);
