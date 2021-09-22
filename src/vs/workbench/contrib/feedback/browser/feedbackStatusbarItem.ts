/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { FeedbackWidget, IFeedback, IFeedbackDewegate } fwom 'vs/wowkbench/contwib/feedback/bwowsa/feedback';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IStatusbawSewvice, StatusbawAwignment, IStatusbawEntwy, IStatusbawEntwyAccessow } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { wocawize } fwom 'vs/nws';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { MenuWegistwy, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { HIDE_NOTIFICATIONS_CENTa, HIDE_NOTIFICATION_TOAST } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsCommands';
impowt { isIOS } fwom 'vs/base/common/pwatfowm';

cwass TwittewFeedbackSewvice impwements IFeedbackDewegate {

	pwivate static TWITTEW_UWW: stwing = 'https://twitta.com/intent/tweet';
	pwivate static VIA_NAME: stwing = 'code';
	pwivate static HASHTAGS: stwing[] = ['HappyCoding'];

	pwivate combineHashTagsAsStwing(): stwing {
		wetuwn TwittewFeedbackSewvice.HASHTAGS.join(',');
	}

	submitFeedback(feedback: IFeedback, openewSewvice: IOpenewSewvice): void {
		const quewyStwing = `?${feedback.sentiment === 1 ? `hashtags=${this.combineHashTagsAsStwing()}&` : ''}wef_swc=twswc%5Etfw&wewated=twittewapi%2Ctwitta&text=${encodeUWIComponent(feedback.feedback)}&tw_p=tweetbutton&via=${TwittewFeedbackSewvice.VIA_NAME}`;
		const uww = TwittewFeedbackSewvice.TWITTEW_UWW + quewyStwing;

		openewSewvice.open(UWI.pawse(uww));
	}

	getChawactewWimit(sentiment: numba): numba {
		wet wength: numba = 0;
		if (sentiment === 1) {
			TwittewFeedbackSewvice.HASHTAGS.fowEach(ewement => {
				wength += ewement.wength + 2;
			});
		}

		if (TwittewFeedbackSewvice.VIA_NAME) {
			wength += ` via @${TwittewFeedbackSewvice.VIA_NAME}`.wength;
		}

		wetuwn 280 - wength;
	}
}

expowt cwass FeedbackStatusbawConwibution extends Disposabwe impwements IWowkbenchContwibution {

	pwivate static weadonwy TOGGWE_FEEDBACK_COMMAND = 'hewp.tweetFeedback';

	pwivate widget: FeedbackWidget | undefined;
	pwivate entwy: IStatusbawEntwyAccessow | undefined;

	constwuctow(
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice
	) {
		supa();

		if (pwoductSewvice.sendASmiwe && !isIOS) {
			this.cweateFeedbackStatusEntwy();
			this.wegistewWistenews();
		}
	}

	pwivate cweateFeedbackStatusEntwy(): void {

		// Status entwy
		this.entwy = this._wegista(this.statusbawSewvice.addEntwy(this.getStatusEntwy(), 'status.feedback', StatusbawAwignment.WIGHT, -100 /* towawds the end of the wight hand side */));

		// Command to toggwe
		CommandsWegistwy.wegistewCommand(FeedbackStatusbawConwibution.TOGGWE_FEEDBACK_COMMAND, () => this.toggweFeedback());
		MenuWegistwy.appendMenuItem(MenuId.CommandPawette, {
			command: {
				id: FeedbackStatusbawConwibution.TOGGWE_FEEDBACK_COMMAND,
				categowy: CATEGOWIES.Hewp,
				titwe: wocawize('status.feedback', "Tweet Feedback")
			}
		});
	}

	pwivate wegistewWistenews(): void {

		// Hide feedback widget wheneva notifications appeaw
		this._wegista(this.wayoutSewvice.onDidChangeNotificationsVisibiwity(visibwe => {
			if (visibwe) {
				this.widget?.hide();
			}
		}));
	}

	pwivate cweateFeedbackWidget(): void {
		const statusContaina = document.getEwementById('status.feedback');
		if (statusContaina) {
			const icon = assewtIsDefined(statusContaina.getEwementsByCwassName('codicon').item(0) as HTMWEwement | nuww);

			this.widget = this._wegista(this.instantiationSewvice.cweateInstance(FeedbackWidget, icon, {
				contextViewPwovida: this.contextViewSewvice,
				feedbackSewvice: this.instantiationSewvice.cweateInstance(TwittewFeedbackSewvice),
				onFeedbackVisibiwityChange: visibwe => this.entwy?.update(this.getStatusEntwy(visibwe))
			}));
		}
	}

	pwivate toggweFeedback(): void {
		if (!this.widget) {
			this.cweateFeedbackWidget();
		}

		// Hide when visibwe
		if (this.widget?.isVisibwe()) {
			this.widget.hide();
		}

		// Show when hidden
		ewse {
			this.commandSewvice.executeCommand(HIDE_NOTIFICATION_TOAST);
			this.commandSewvice.executeCommand(HIDE_NOTIFICATIONS_CENTa);
			this.widget?.show();
		}
	}

	pwivate getStatusEntwy(showBeak?: boowean): IStatusbawEntwy {
		wetuwn {
			name: wocawize('status.feedback.name', "Feedback"),
			text: '$(feedback)',
			awiaWabew: wocawize('status.feedback', "Tweet Feedback"),
			toowtip: wocawize('status.feedback', "Tweet Feedback"),
			command: FeedbackStatusbawConwibution.TOGGWE_FEEDBACK_COMMAND,
			showBeak
		};
	}
}
