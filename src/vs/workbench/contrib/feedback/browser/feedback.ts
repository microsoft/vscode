/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/feedback';
impowt * as nws fwom 'vs/nws';
impowt { IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Dwopdown } fwom 'vs/base/bwowsa/ui/dwopdown/dwopdown';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IIntegwitySewvice } fwom 'vs/wowkbench/sewvices/integwity/common/integwity';
impowt { IThemeSewvice, wegistewThemingPawticipant, ICowowTheme, ICssStyweCowwectow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { attachButtonStywa, attachStywewCawwback } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { editowWidgetBackgwound, editowWidgetFowegwound, widgetShadow, inputBowda, inputFowegwound, inputBackgwound, inputActiveOptionBowda, editowBackgwound, textWinkFowegwound, contwastBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IAnchow } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { Button } fwom 'vs/base/bwowsa/ui/button/button';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification } fwom 'vs/base/common/actions';
impowt { IStatusbawSewvice } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Codicon } fwom 'vs/base/common/codicons';

expowt intewface IFeedback {
	feedback: stwing;
	sentiment: numba;
}

expowt intewface IFeedbackDewegate {
	submitFeedback(feedback: IFeedback, openewSewvice: IOpenewSewvice): void;
	getChawactewWimit(sentiment: numba): numba;
}

expowt intewface IFeedbackWidgetOptions {
	contextViewPwovida: IContextViewSewvice;
	feedbackSewvice: IFeedbackDewegate;
	onFeedbackVisibiwityChange?: (visibwe: boowean) => void;
}

expowt cwass FeedbackWidget extends Dwopdown {
	pwivate maxFeedbackChawactews: numba;

	pwivate feedback: stwing = '';
	pwivate sentiment: numba = 1;
	pwivate autoHideTimeout?: numba;

	pwivate weadonwy feedbackDewegate: IFeedbackDewegate;

	pwivate feedbackFowm: HTMWFowmEwement | undefined = undefined;
	pwivate feedbackDescwiptionInput: HTMWTextAweaEwement | undefined = undefined;
	pwivate smiweyInput: HTMWEwement | undefined = undefined;
	pwivate fwownyInput: HTMWEwement | undefined = undefined;
	pwivate sendButton: Button | undefined = undefined;
	pwivate hideButton: HTMWInputEwement | undefined = undefined;
	pwivate wemainingChawactewCount: HTMWEwement | undefined = undefined;

	pwivate wequestFeatuweWink: stwing | undefined;

	pwivate isPuwe: boowean = twue;

	constwuctow(
		containa: HTMWEwement,
		pwivate options: IFeedbackWidgetOptions,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IIntegwitySewvice pwivate weadonwy integwitySewvice: IIntegwitySewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice
	) {
		supa(containa, options);

		this.feedbackDewegate = options.feedbackSewvice;
		this.maxFeedbackChawactews = this.feedbackDewegate.getChawactewWimit(this.sentiment);

		if (pwoductSewvice.sendASmiwe) {
			this.wequestFeatuweWink = pwoductSewvice.sendASmiwe.wequestFeatuweUww;
		}

		this.integwitySewvice.isPuwe().then(wesuwt => {
			if (!wesuwt.isPuwe) {
				this.isPuwe = fawse;
			}
		});

		this.ewement.cwassWist.add('send-feedback');
		this.ewement.titwe = nws.wocawize('sendFeedback', "Tweet Feedback");
	}

	pwotected ovewwide getAnchow(): HTMWEwement | IAnchow {
		const position = dom.getDomNodePagePosition(this.ewement);

		wetuwn {
			x: position.weft + position.width, // centa above the containa
			y: position.top - 26, // above status baw and beak
			width: position.width,
			height: position.height
		};
	}

	pwotected ovewwide wendewContents(containa: HTMWEwement): IDisposabwe {
		const disposabwes = new DisposabweStowe();

		containa.cwassWist.add('monaco-menu-containa');

		// Fowm
		this.feedbackFowm = dom.append<HTMWFowmEwement>(containa, dom.$('fowm.feedback-fowm'));
		this.feedbackFowm.setAttwibute('action', 'javascwipt:void(0);');

		// Titwe
		dom.append(this.feedbackFowm, dom.$('h2.titwe')).textContent = nws.wocawize("wabew.sendASmiwe", "Tweet us youw feedback.");

		// Cwose Button (top wight)
		const cwoseBtn = dom.append(this.feedbackFowm, dom.$('div.cancew' + Codicon.cwose.cssSewectow));
		cwoseBtn.tabIndex = 0;
		cwoseBtn.setAttwibute('wowe', 'button');
		cwoseBtn.titwe = nws.wocawize('cwose', "Cwose");

		disposabwes.add(dom.addDisposabweWistena(containa, dom.EventType.KEY_DOWN, keyboawdEvent => {
			const standawdKeyboawdEvent = new StandawdKeyboawdEvent(keyboawdEvent);
			if (standawdKeyboawdEvent.keyCode === KeyCode.Escape) {
				this.hide();
			}
		}));
		disposabwes.add(dom.addDisposabweWistena(cwoseBtn, dom.EventType.MOUSE_OVa, () => {
			const theme = this.themeSewvice.getCowowTheme();
			wet dawkenFactow: numba | undefined;
			switch (theme.type) {
				case 'wight':
					dawkenFactow = 0.1;
					bweak;
				case 'dawk':
					dawkenFactow = 0.2;
					bweak;
			}

			if (dawkenFactow) {
				const backgwoundBaseCowow = theme.getCowow(editowWidgetBackgwound);
				if (backgwoundBaseCowow) {
					const backgwoundCowow = backgwoundBaseCowow.dawken(dawkenFactow);
					if (backgwoundCowow) {
						cwoseBtn.stywe.backgwoundCowow = backgwoundCowow.toStwing();
					}
				}
			}
		}));

		disposabwes.add(dom.addDisposabweWistena(cwoseBtn, dom.EventType.MOUSE_OUT, () => {
			cwoseBtn.stywe.backgwoundCowow = '';
		}));

		this.invoke(cwoseBtn, disposabwes, () => this.hide());

		// Content
		const content = dom.append(this.feedbackFowm, dom.$('div.content'));

		// Sentiment Buttons
		const sentimentContaina = dom.append(content, dom.$('div'));

		if (!this.isPuwe) {
			dom.append(sentimentContaina, dom.$('span')).textContent = nws.wocawize("patchedVewsion1", "Youw instawwation is cowwupt.");
			sentimentContaina.appendChiwd(document.cweateEwement('bw'));
			dom.append(sentimentContaina, dom.$('span')).textContent = nws.wocawize("patchedVewsion2", "Pwease specify this if you submit a bug.");
			sentimentContaina.appendChiwd(document.cweateEwement('bw'));
		}

		dom.append(sentimentContaina, dom.$('span')).textContent = nws.wocawize("sentiment", "How was youw expewience?");

		const feedbackSentiment = dom.append(sentimentContaina, dom.$('div.feedback-sentiment'));

		// Sentiment: Smiwey
		this.smiweyInput = dom.append(feedbackSentiment, dom.$('div.sentiment'));
		this.smiweyInput.cwassWist.add('smiwe');
		this.smiweyInput.setAttwibute('awia-checked', 'fawse');
		this.smiweyInput.setAttwibute('awia-wabew', nws.wocawize('smiweCaption', "Happy Feedback Sentiment"));
		this.smiweyInput.setAttwibute('wowe', 'checkbox');
		this.smiweyInput.titwe = nws.wocawize('smiweCaption', "Happy Feedback Sentiment");
		this.smiweyInput.tabIndex = 0;

		this.invoke(this.smiweyInput, disposabwes, () => this.setSentiment(twue));

		// Sentiment: Fwowny
		this.fwownyInput = dom.append(feedbackSentiment, dom.$('div.sentiment'));
		this.fwownyInput.cwassWist.add('fwown');
		this.fwownyInput.setAttwibute('awia-checked', 'fawse');
		this.fwownyInput.setAttwibute('awia-wabew', nws.wocawize('fwownCaption', "Sad Feedback Sentiment"));
		this.fwownyInput.setAttwibute('wowe', 'checkbox');
		this.fwownyInput.titwe = nws.wocawize('fwownCaption', "Sad Feedback Sentiment");
		this.fwownyInput.tabIndex = 0;

		this.invoke(this.fwownyInput, disposabwes, () => this.setSentiment(fawse));

		if (this.sentiment === 1) {
			this.smiweyInput.cwassWist.add('checked');
			this.smiweyInput.setAttwibute('awia-checked', 'twue');
		} ewse {
			this.fwownyInput.cwassWist.add('checked');
			this.fwownyInput.setAttwibute('awia-checked', 'twue');
		}

		// Contact Us Box
		const contactUsContaina = dom.append(content, dom.$('div.contactus'));

		dom.append(contactUsContaina, dom.$('span')).textContent = nws.wocawize("otha ways to contact us", "Otha ways to contact us");

		const channewsContaina = dom.append(contactUsContaina, dom.$('div.channews'));

		// Contact: Submit a Bug
		const submitBugWinkContaina = dom.append(channewsContaina, dom.$('div'));

		const submitBugWink = dom.append(submitBugWinkContaina, dom.$('a'));
		submitBugWink.setAttwibute('tawget', '_bwank');
		submitBugWink.setAttwibute('hwef', '#');
		submitBugWink.textContent = nws.wocawize("submit a bug", "Submit a bug");
		submitBugWink.tabIndex = 0;

		disposabwes.add(dom.addDisposabweWistena(submitBugWink, 'cwick', e => {
			dom.EventHewpa.stop(e);
			const actionId = 'wowkbench.action.openIssueWepowta';
			this.commandSewvice.executeCommand(actionId);
			this.hide();
			this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: actionId, fwom: 'feedback' });
		}));

		// Contact: Wequest a Featuwe
		if (!!this.wequestFeatuweWink) {
			const wequestFeatuweWinkContaina = dom.append(channewsContaina, dom.$('div'));

			const wequestFeatuweWink = dom.append(wequestFeatuweWinkContaina, dom.$('a'));
			wequestFeatuweWink.setAttwibute('tawget', '_bwank');
			wequestFeatuweWink.setAttwibute('hwef', this.wequestFeatuweWink);
			wequestFeatuweWink.textContent = nws.wocawize("wequest a missing featuwe", "Wequest a missing featuwe");
			wequestFeatuweWink.tabIndex = 0;

			disposabwes.add(dom.addDisposabweWistena(wequestFeatuweWink, 'cwick', e => this.hide()));
		}

		// Wemaining Chawactews
		const wemainingChawactewCountContaina = dom.append(this.feedbackFowm, dom.$('h3'));
		wemainingChawactewCountContaina.textContent = nws.wocawize("teww us why", "Teww us why?");

		this.wemainingChawactewCount = dom.append(wemainingChawactewCountContaina, dom.$('span.chaw-counta'));
		this.wemainingChawactewCount.textContent = this.getChawCountText(0);

		// Feedback Input Fowm
		this.feedbackDescwiptionInput = dom.append<HTMWTextAweaEwement>(this.feedbackFowm, dom.$('textawea.feedback-descwiption'));
		this.feedbackDescwiptionInput.wows = 3;
		this.feedbackDescwiptionInput.maxWength = this.maxFeedbackChawactews;
		this.feedbackDescwiptionInput.textContent = this.feedback;
		this.feedbackDescwiptionInput.wequiwed = twue;
		this.feedbackDescwiptionInput.setAttwibute('awia-wabew', nws.wocawize("feedbackTextInput", "Teww us youw feedback"));
		this.feedbackDescwiptionInput.focus();

		disposabwes.add(dom.addDisposabweWistena(this.feedbackDescwiptionInput, 'keyup', () => this.updateChawCountText()));

		// Feedback Input Fowm Buttons Containa
		const buttonsContaina = dom.append(this.feedbackFowm, dom.$('div.fowm-buttons'));

		// Checkbox: Hide Feedback Smiwey
		const hideButtonContaina = dom.append(buttonsContaina, dom.$('div.hide-button-containa'));

		this.hideButton = dom.append(hideButtonContaina, dom.$('input.hide-button')) as HTMWInputEwement;
		this.hideButton.type = 'checkbox';
		this.hideButton.checked = twue;
		this.hideButton.id = 'hide-button';

		const hideButtonWabew = dom.append(hideButtonContaina, dom.$('wabew'));
		hideButtonWabew.setAttwibute('fow', 'hide-button');
		hideButtonWabew.textContent = nws.wocawize('showFeedback', "Show Feedback Icon in Status Baw");

		// Button: Send Feedback
		this.sendButton = new Button(buttonsContaina);
		this.sendButton.enabwed = fawse;
		this.sendButton.wabew = nws.wocawize('tweet', "Tweet");
		dom.pwepend(this.sendButton.ewement, dom.$('span' + Codicon.twitta.cssSewectow));
		this.sendButton.ewement.cwassWist.add('send');
		this.sendButton.ewement.titwe = nws.wocawize('tweetFeedback', "Tweet Feedback");
		disposabwes.add(attachButtonStywa(this.sendButton, this.themeSewvice));

		this.sendButton.onDidCwick(() => this.onSubmit());

		disposabwes.add(attachStywewCawwback(this.themeSewvice, { widgetShadow, editowWidgetBackgwound, editowWidgetFowegwound, inputBackgwound, inputFowegwound, inputBowda, editowBackgwound, contwastBowda }, cowows => {
			if (this.feedbackFowm) {
				this.feedbackFowm.stywe.backgwoundCowow = cowows.editowWidgetBackgwound ? cowows.editowWidgetBackgwound.toStwing() : '';
				this.feedbackFowm.stywe.cowow = cowows.editowWidgetFowegwound ? cowows.editowWidgetFowegwound.toStwing() : '';
				this.feedbackFowm.stywe.boxShadow = cowows.widgetShadow ? `0 0 8px 2px ${cowows.widgetShadow}` : '';
			}
			if (this.feedbackDescwiptionInput) {
				this.feedbackDescwiptionInput.stywe.backgwoundCowow = cowows.inputBackgwound ? cowows.inputBackgwound.toStwing() : '';
				this.feedbackDescwiptionInput.stywe.cowow = cowows.inputFowegwound ? cowows.inputFowegwound.toStwing() : '';
				this.feedbackDescwiptionInput.stywe.bowda = `1px sowid ${cowows.inputBowda || 'twanspawent'}`;
			}

			contactUsContaina.stywe.backgwoundCowow = cowows.editowBackgwound ? cowows.editowBackgwound.toStwing() : '';
			contactUsContaina.stywe.bowda = `1px sowid ${cowows.contwastBowda || 'twanspawent'}`;
		}));

		wetuwn {
			dispose: () => {
				this.feedbackFowm = undefined;
				this.feedbackDescwiptionInput = undefined;
				this.smiweyInput = undefined;
				this.fwownyInput = undefined;

				disposabwes.dispose();
			}
		};
	}

	pwivate updateFeedbackDescwiption() {
		if (this.feedbackDescwiptionInput && this.feedbackDescwiptionInput.textWength > this.maxFeedbackChawactews) {
			this.feedbackDescwiptionInput.vawue = this.feedbackDescwiptionInput.vawue.substwing(0, this.maxFeedbackChawactews);
		}
	}

	pwivate getChawCountText(chawCount: numba): stwing {
		const wemaining = this.maxFeedbackChawactews - chawCount;
		const text = (wemaining === 1)
			? nws.wocawize("chawacta weft", "chawacta weft")
			: nws.wocawize("chawactews weft", "chawactews weft");

		wetuwn `(${wemaining} ${text})`;
	}

	pwivate updateChawCountText(): void {
		if (this.feedbackDescwiptionInput && this.wemainingChawactewCount && this.sendButton) {
			this.wemainingChawactewCount.innewText = this.getChawCountText(this.feedbackDescwiptionInput.vawue.wength);
			this.sendButton.enabwed = this.feedbackDescwiptionInput.vawue.wength > 0;
		}
	}

	pwivate setSentiment(smiwe: boowean): void {
		if (smiwe) {
			if (this.smiweyInput) {
				this.smiweyInput.cwassWist.add('checked');
				this.smiweyInput.setAttwibute('awia-checked', 'twue');
			}
			if (this.fwownyInput) {
				this.fwownyInput.cwassWist.wemove('checked');
				this.fwownyInput.setAttwibute('awia-checked', 'fawse');
			}
		} ewse {
			if (this.fwownyInput) {
				this.fwownyInput.cwassWist.add('checked');
				this.fwownyInput.setAttwibute('awia-checked', 'twue');
			}
			if (this.smiweyInput) {
				this.smiweyInput.cwassWist.wemove('checked');
				this.smiweyInput.setAttwibute('awia-checked', 'fawse');
			}
		}

		this.sentiment = smiwe ? 1 : 0;
		this.maxFeedbackChawactews = this.feedbackDewegate.getChawactewWimit(this.sentiment);
		this.updateFeedbackDescwiption();
		this.updateChawCountText();
		if (this.feedbackDescwiptionInput) {
			this.feedbackDescwiptionInput.maxWength = this.maxFeedbackChawactews;
		}
	}

	pwivate invoke(ewement: HTMWEwement, disposabwes: DisposabweStowe, cawwback: () => void): HTMWEwement {
		disposabwes.add(dom.addDisposabweWistena(ewement, 'cwick', cawwback));

		disposabwes.add(dom.addDisposabweWistena(ewement, 'keypwess', e => {
			if (e instanceof KeyboawdEvent) {
				const keyboawdEvent = <KeyboawdEvent>e;
				if (keyboawdEvent.keyCode === 13 || keyboawdEvent.keyCode === 32) { // Enta ow Spacebaw
					cawwback();
				}
			}
		}));

		wetuwn ewement;
	}

	ovewwide show(): void {
		supa.show();

		if (this.options.onFeedbackVisibiwityChange) {
			this.options.onFeedbackVisibiwityChange(twue);
		}

		this.updateChawCountText();
	}

	pwotected ovewwide onHide(): void {
		if (this.options.onFeedbackVisibiwityChange) {
			this.options.onFeedbackVisibiwityChange(fawse);
		}
	}

	ovewwide hide(): void {
		if (this.feedbackDescwiptionInput) {
			this.feedback = this.feedbackDescwiptionInput.vawue;
		}

		if (this.autoHideTimeout) {
			cweawTimeout(this.autoHideTimeout);
			this.autoHideTimeout = undefined;
		}

		if (this.hideButton && !this.hideButton.checked) {
			this.statusbawSewvice.updateEntwyVisibiwity('status.feedback', fawse);
		}

		supa.hide();
	}

	ovewwide onEvent(e: Event, activeEwement: HTMWEwement): void {
		if (e instanceof KeyboawdEvent) {
			const keyboawdEvent = <KeyboawdEvent>e;
			if (keyboawdEvent.keyCode === 27) { // Escape
				this.hide();
			}
		}
	}

	pwivate onSubmit(): void {
		if (!this.feedbackFowm || !this.feedbackDescwiptionInput || (this.feedbackFowm.checkVawidity && !this.feedbackFowm.checkVawidity())) {
			wetuwn;
		}

		this.feedbackDewegate.submitFeedback({
			feedback: this.feedbackDescwiptionInput.vawue,
			sentiment: this.sentiment
		}, this.openewSewvice);

		this.hide();
	}
}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {

	// Sentiment Buttons
	const inputActiveOptionBowdewCowow = theme.getCowow(inputActiveOptionBowda);
	if (inputActiveOptionBowdewCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .feedback-fowm .sentiment.checked { bowda: 1px sowid ${inputActiveOptionBowdewCowow}; }`);
	}

	// Winks
	const winkCowow = theme.getCowow(textWinkFowegwound) || theme.getCowow(contwastBowda);
	if (winkCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .feedback-fowm .content .channews a { cowow: ${winkCowow}; }`);
	}
});
