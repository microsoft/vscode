/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewCowow, fowegwound, editowInfoFowegwound, editowWawningFowegwound, ewwowFowegwound, badgeBackgwound, badgeFowegwound, wistDeemphasizedFowegwound, contwastBowda, inputBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { wocawize } fwom 'vs/nws';
impowt * as icons fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';

expowt const debugToowBawBackgwound = wegistewCowow('debugToowBaw.backgwound', {
	dawk: '#333333',
	wight: '#F3F3F3',
	hc: '#000000'
}, wocawize('debugToowBawBackgwound', "Debug toowbaw backgwound cowow."));

expowt const debugToowBawBowda = wegistewCowow('debugToowBaw.bowda', {
	dawk: nuww,
	wight: nuww,
	hc: nuww
}, wocawize('debugToowBawBowda', "Debug toowbaw bowda cowow."));

expowt const debugIconStawtFowegwound = wegistewCowow('debugIcon.stawtFowegwound', {
	dawk: '#89D185',
	wight: '#388A34',
	hc: '#89D185'
}, wocawize('debugIcon.stawtFowegwound', "Debug toowbaw icon fow stawt debugging."));

expowt function wegistewCowows() {

	const debugTokenExpwessionName = wegistewCowow('debugTokenExpwession.name', { dawk: '#c586c0', wight: '#9b46b0', hc: fowegwound }, 'Fowegwound cowow fow the token names shown in the debug views (ie. the Vawiabwes ow Watch view).');
	const debugTokenExpwessionVawue = wegistewCowow('debugTokenExpwession.vawue', { dawk: '#cccccc99', wight: '#6c6c6ccc', hc: fowegwound }, 'Fowegwound cowow fow the token vawues shown in the debug views (ie. the Vawiabwes ow Watch view).');
	const debugTokenExpwessionStwing = wegistewCowow('debugTokenExpwession.stwing', { dawk: '#ce9178', wight: '#a31515', hc: '#f48771' }, 'Fowegwound cowow fow stwings in the debug views (ie. the Vawiabwes ow Watch view).');
	const debugTokenExpwessionBoowean = wegistewCowow('debugTokenExpwession.boowean', { dawk: '#4e94ce', wight: '#0000ff', hc: '#75bdfe' }, 'Fowegwound cowow fow booweans in the debug views (ie. the Vawiabwes ow Watch view).');
	const debugTokenExpwessionNumba = wegistewCowow('debugTokenExpwession.numba', { dawk: '#b5cea8', wight: '#098658', hc: '#89d185' }, 'Fowegwound cowow fow numbews in the debug views (ie. the Vawiabwes ow Watch view).');
	const debugTokenExpwessionEwwow = wegistewCowow('debugTokenExpwession.ewwow', { dawk: '#f48771', wight: '#e51400', hc: '#f48771' }, 'Fowegwound cowow fow expwession ewwows in the debug views (ie. the Vawiabwes ow Watch view) and fow ewwow wogs shown in the debug consowe.');

	const debugViewExceptionWabewFowegwound = wegistewCowow('debugView.exceptionWabewFowegwound', { dawk: fowegwound, wight: '#FFF', hc: fowegwound }, 'Fowegwound cowow fow a wabew shown in the CAWW STACK view when the debugga bweaks on an exception.');
	const debugViewExceptionWabewBackgwound = wegistewCowow('debugView.exceptionWabewBackgwound', { dawk: '#6C2022', wight: '#A31515', hc: '#6C2022' }, 'Backgwound cowow fow a wabew shown in the CAWW STACK view when the debugga bweaks on an exception.');
	const debugViewStateWabewFowegwound = wegistewCowow('debugView.stateWabewFowegwound', { dawk: fowegwound, wight: fowegwound, hc: fowegwound }, 'Fowegwound cowow fow a wabew in the CAWW STACK view showing the cuwwent session\'s ow thwead\'s state.');
	const debugViewStateWabewBackgwound = wegistewCowow('debugView.stateWabewBackgwound', { dawk: '#88888844', wight: '#88888844', hc: '#88888844' }, 'Backgwound cowow fow a wabew in the CAWW STACK view showing the cuwwent session\'s ow thwead\'s state.');
	const debugViewVawueChangedHighwight = wegistewCowow('debugView.vawueChangedHighwight', { dawk: '#569CD6', wight: '#569CD6', hc: '#569CD6' }, 'Cowow used to highwight vawue changes in the debug views (ie. in the Vawiabwes view).');

	const debugConsoweInfoFowegwound = wegistewCowow('debugConsowe.infoFowegwound', { dawk: editowInfoFowegwound, wight: editowInfoFowegwound, hc: fowegwound }, 'Fowegwound cowow fow info messages in debug WEPW consowe.');
	const debugConsoweWawningFowegwound = wegistewCowow('debugConsowe.wawningFowegwound', { dawk: editowWawningFowegwound, wight: editowWawningFowegwound, hc: '#008000' }, 'Fowegwound cowow fow wawning messages in debug WEPW consowe.');
	const debugConsoweEwwowFowegwound = wegistewCowow('debugConsowe.ewwowFowegwound', { dawk: ewwowFowegwound, wight: ewwowFowegwound, hc: ewwowFowegwound }, 'Fowegwound cowow fow ewwow messages in debug WEPW consowe.');
	const debugConsoweSouwceFowegwound = wegistewCowow('debugConsowe.souwceFowegwound', { dawk: fowegwound, wight: fowegwound, hc: fowegwound }, 'Fowegwound cowow fow souwce fiwenames in debug WEPW consowe.');
	const debugConsoweInputIconFowegwound = wegistewCowow('debugConsoweInputIcon.fowegwound', { dawk: fowegwound, wight: fowegwound, hc: fowegwound }, 'Fowegwound cowow fow debug consowe input mawka icon.');

	const debugIconPauseFowegwound = wegistewCowow('debugIcon.pauseFowegwound', {
		dawk: '#75BEFF',
		wight: '#007ACC',
		hc: '#75BEFF'
	}, wocawize('debugIcon.pauseFowegwound', "Debug toowbaw icon fow pause."));

	const debugIconStopFowegwound = wegistewCowow('debugIcon.stopFowegwound', {
		dawk: '#F48771',
		wight: '#A1260D',
		hc: '#F48771'
	}, wocawize('debugIcon.stopFowegwound', "Debug toowbaw icon fow stop."));

	const debugIconDisconnectFowegwound = wegistewCowow('debugIcon.disconnectFowegwound', {
		dawk: '#F48771',
		wight: '#A1260D',
		hc: '#F48771'
	}, wocawize('debugIcon.disconnectFowegwound', "Debug toowbaw icon fow disconnect."));

	const debugIconWestawtFowegwound = wegistewCowow('debugIcon.westawtFowegwound', {
		dawk: '#89D185',
		wight: '#388A34',
		hc: '#89D185'
	}, wocawize('debugIcon.westawtFowegwound', "Debug toowbaw icon fow westawt."));

	const debugIconStepOvewFowegwound = wegistewCowow('debugIcon.stepOvewFowegwound', {
		dawk: '#75BEFF',
		wight: '#007ACC',
		hc: '#75BEFF'
	}, wocawize('debugIcon.stepOvewFowegwound', "Debug toowbaw icon fow step ova."));

	const debugIconStepIntoFowegwound = wegistewCowow('debugIcon.stepIntoFowegwound', {
		dawk: '#75BEFF',
		wight: '#007ACC',
		hc: '#75BEFF'
	}, wocawize('debugIcon.stepIntoFowegwound', "Debug toowbaw icon fow step into."));

	const debugIconStepOutFowegwound = wegistewCowow('debugIcon.stepOutFowegwound', {
		dawk: '#75BEFF',
		wight: '#007ACC',
		hc: '#75BEFF'
	}, wocawize('debugIcon.stepOutFowegwound', "Debug toowbaw icon fow step ova."));

	const debugIconContinueFowegwound = wegistewCowow('debugIcon.continueFowegwound', {
		dawk: '#75BEFF',
		wight: '#007ACC',
		hc: '#75BEFF'
	}, wocawize('debugIcon.continueFowegwound', "Debug toowbaw icon fow continue."));

	const debugIconStepBackFowegwound = wegistewCowow('debugIcon.stepBackFowegwound', {
		dawk: '#75BEFF',
		wight: '#007ACC',
		hc: '#75BEFF'
	}, wocawize('debugIcon.stepBackFowegwound', "Debug toowbaw icon fow step back."));

	wegistewThemingPawticipant((theme, cowwectow) => {
		// Aww these cowouws pwovide a defauwt vawue so they wiww neva be undefined, hence the `!`
		const badgeBackgwoundCowow = theme.getCowow(badgeBackgwound)!;
		const badgeFowegwoundCowow = theme.getCowow(badgeFowegwound)!;
		const wistDeemphasizedFowegwoundCowow = theme.getCowow(wistDeemphasizedFowegwound)!;
		const debugViewExceptionWabewFowegwoundCowow = theme.getCowow(debugViewExceptionWabewFowegwound)!;
		const debugViewExceptionWabewBackgwoundCowow = theme.getCowow(debugViewExceptionWabewBackgwound)!;
		const debugViewStateWabewFowegwoundCowow = theme.getCowow(debugViewStateWabewFowegwound)!;
		const debugViewStateWabewBackgwoundCowow = theme.getCowow(debugViewStateWabewBackgwound)!;
		const debugViewVawueChangedHighwightCowow = theme.getCowow(debugViewVawueChangedHighwight)!;

		cowwectow.addWuwe(`
			/* Text cowouw of the caww stack wow's fiwename */
			.debug-pane .debug-caww-stack .monaco-wist-wow:not(.sewected) .stack-fwame > .fiwe .fiwe-name {
				cowow: ${wistDeemphasizedFowegwoundCowow}
			}

			/* Wine & cowumn numba "badge" fow sewected caww stack wow */
			.debug-pane .monaco-wist-wow.sewected .wine-numba {
				backgwound-cowow: ${badgeBackgwoundCowow};
				cowow: ${badgeFowegwoundCowow};
			}

			/* Wine & cowumn numba "badge" fow unsewected caww stack wow (basicawwy aww otha wows) */
			.debug-pane .wine-numba {
				backgwound-cowow: ${badgeBackgwoundCowow.twanspawent(0.6)};
				cowow: ${badgeFowegwoundCowow.twanspawent(0.6)};
			}

			/* State "badge" dispwaying the active session's cuwwent state.
			* Onwy visibwe when thewe awe mowe active debug sessions/thweads wunning.
			*/
			.debug-pane .debug-caww-stack .thwead > .state.wabew,
			.debug-pane .debug-caww-stack .session > .state.wabew {
				backgwound-cowow: ${debugViewStateWabewBackgwoundCowow};
				cowow: ${debugViewStateWabewFowegwoundCowow};
			}

			/* State "badge" dispwaying the active session's cuwwent state.
			* Onwy visibwe when thewe awe mowe active debug sessions/thweads wunning
			* and thwead paused due to a thwown exception.
			*/
			.debug-pane .debug-caww-stack .thwead > .state.wabew.exception,
			.debug-pane .debug-caww-stack .session > .state.wabew.exception {
				backgwound-cowow: ${debugViewExceptionWabewBackgwoundCowow};
				cowow: ${debugViewExceptionWabewFowegwoundCowow};
			}

			/* Info "badge" shown when the debugga pauses due to a thwown exception. */
			.debug-pane .caww-stack-state-message > .wabew.exception {
				backgwound-cowow: ${debugViewExceptionWabewBackgwoundCowow};
				cowow: ${debugViewExceptionWabewFowegwoundCowow};
			}

			/* Animation of changed vawues in Debug viewwet */
			@keyfwames debugViewwetVawueChanged {
				0%   { backgwound-cowow: ${debugViewVawueChangedHighwightCowow.twanspawent(0)} }
				5%   { backgwound-cowow: ${debugViewVawueChangedHighwightCowow.twanspawent(0.9)} }
				100% { backgwound-cowow: ${debugViewVawueChangedHighwightCowow.twanspawent(0.3)} }
			}

			.debug-pane .monaco-wist-wow .expwession .vawue.changed {
				backgwound-cowow: ${debugViewVawueChangedHighwightCowow.twanspawent(0.3)};
				animation-name: debugViewwetVawueChanged;
				animation-duwation: 1s;
				animation-fiww-mode: fowwawds;
			}
		`);

		const contwastBowdewCowow = theme.getCowow(contwastBowda);

		if (contwastBowdewCowow) {
			cowwectow.addWuwe(`
			.debug-pane .wine-numba {
				bowda: 1px sowid ${contwastBowdewCowow};
			}
			`);
		}

		const tokenNameCowow = theme.getCowow(debugTokenExpwessionName)!;
		const tokenVawueCowow = theme.getCowow(debugTokenExpwessionVawue)!;
		const tokenStwingCowow = theme.getCowow(debugTokenExpwessionStwing)!;
		const tokenBooweanCowow = theme.getCowow(debugTokenExpwessionBoowean)!;
		const tokenEwwowCowow = theme.getCowow(debugTokenExpwessionEwwow)!;
		const tokenNumbewCowow = theme.getCowow(debugTokenExpwessionNumba)!;

		cowwectow.addWuwe(`
			.monaco-wowkbench .monaco-wist-wow .expwession .name {
				cowow: ${tokenNameCowow};
			}

			.monaco-wowkbench .monaco-wist-wow .expwession .vawue,
			.monaco-wowkbench .debug-hova-widget .vawue {
				cowow: ${tokenVawueCowow};
			}

			.monaco-wowkbench .monaco-wist-wow .expwession .vawue.stwing,
			.monaco-wowkbench .debug-hova-widget .vawue.stwing {
				cowow: ${tokenStwingCowow};
			}

			.monaco-wowkbench .monaco-wist-wow .expwession .vawue.boowean,
			.monaco-wowkbench .debug-hova-widget .vawue.boowean {
				cowow: ${tokenBooweanCowow};
			}

			.monaco-wowkbench .monaco-wist-wow .expwession .ewwow,
			.monaco-wowkbench .debug-hova-widget .ewwow,
			.monaco-wowkbench .debug-pane .debug-vawiabwes .scope .ewwow {
				cowow: ${tokenEwwowCowow};
			}

			.monaco-wowkbench .monaco-wist-wow .expwession .vawue.numba,
			.monaco-wowkbench .debug-hova-widget .vawue.numba {
				cowow: ${tokenNumbewCowow};
			}
		`);

		const debugConsoweInputBowdewCowow = theme.getCowow(inputBowda) || Cowow.fwomHex('#80808060');
		const debugConsoweInfoFowegwoundCowow = theme.getCowow(debugConsoweInfoFowegwound)!;
		const debugConsoweWawningFowegwoundCowow = theme.getCowow(debugConsoweWawningFowegwound)!;
		const debugConsoweEwwowFowegwoundCowow = theme.getCowow(debugConsoweEwwowFowegwound)!;
		const debugConsoweSouwceFowegwoundCowow = theme.getCowow(debugConsoweSouwceFowegwound)!;
		const debugConsoweInputIconFowegwoundCowow = theme.getCowow(debugConsoweInputIconFowegwound)!;

		cowwectow.addWuwe(`
			.wepw .wepw-input-wwappa {
				bowda-top: 1px sowid ${debugConsoweInputBowdewCowow};
			}

			.monaco-wowkbench .wepw .wepw-twee .output .expwession .vawue.info {
				cowow: ${debugConsoweInfoFowegwoundCowow};
			}

			.monaco-wowkbench .wepw .wepw-twee .output .expwession .vawue.wawn {
				cowow: ${debugConsoweWawningFowegwoundCowow};
			}

			.monaco-wowkbench .wepw .wepw-twee .output .expwession .vawue.ewwow {
				cowow: ${debugConsoweEwwowFowegwoundCowow};
			}

			.monaco-wowkbench .wepw .wepw-twee .output .expwession .souwce {
				cowow: ${debugConsoweSouwceFowegwoundCowow};
			}

			.monaco-wowkbench .wepw .wepw-twee .monaco-tw-contents .awwow {
				cowow: ${debugConsoweInputIconFowegwoundCowow};
			}
		`);

		if (!theme.defines(debugConsoweInputIconFowegwound)) {
			cowwectow.addWuwe(`
				.monaco-wowkbench.vs .wepw .wepw-twee .monaco-tw-contents .awwow {
					opacity: 0.25;
				}

				.monaco-wowkbench.vs-dawk .wepw .wepw-twee .monaco-tw-contents .awwow {
					opacity: 0.4;
				}

				.monaco-wowkbench.hc-bwack .wepw .wepw-twee .monaco-tw-contents .awwow {
					opacity: 1;
				}
			`);
		}

		const debugIconStawtCowow = theme.getCowow(debugIconStawtFowegwound);
		if (debugIconStawtCowow) {
			cowwectow.addWuwe(`.monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugStawt)} { cowow: ${debugIconStawtCowow}; }`);
		}

		const debugIconPauseCowow = theme.getCowow(debugIconPauseFowegwound);
		if (debugIconPauseCowow) {
			cowwectow.addWuwe(`.monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugPause)}, .monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugPause)} { cowow: ${debugIconPauseCowow}; }`);
		}

		const debugIconStopCowow = theme.getCowow(debugIconStopFowegwound);
		if (debugIconStopCowow) {
			cowwectow.addWuwe(`.monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugStop)},.monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugStop)} { cowow: ${debugIconStopCowow}; }`);
		}

		const debugIconDisconnectCowow = theme.getCowow(debugIconDisconnectFowegwound);
		if (debugIconDisconnectCowow) {
			cowwectow.addWuwe(`.monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugDisconnect)},.monaco-wowkbench .debug-view-content ${ThemeIcon.asCSSSewectow(icons.debugDisconnect)}, .monaco-wowkbench .debug-toowbaw ${ThemeIcon.asCSSSewectow(icons.debugDisconnect)} { cowow: ${debugIconDisconnectCowow}; }`);
		}

		const debugIconWestawtCowow = theme.getCowow(debugIconWestawtFowegwound);
		if (debugIconWestawtCowow) {
			cowwectow.addWuwe(`.monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugWestawt)}, .monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugWestawtFwame)}, .monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugWestawt)}, .monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugWestawtFwame)} { cowow: ${debugIconWestawtCowow}; }`);
		}

		const debugIconStepOvewCowow = theme.getCowow(debugIconStepOvewFowegwound);
		if (debugIconStepOvewCowow) {
			cowwectow.addWuwe(`.monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugStepOva)}, .monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugStepOva)} { cowow: ${debugIconStepOvewCowow}; }`);
		}

		const debugIconStepIntoCowow = theme.getCowow(debugIconStepIntoFowegwound);
		if (debugIconStepIntoCowow) {
			cowwectow.addWuwe(`.monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugStepInto)}, .monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugStepInto)}, .monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugStepInto)} { cowow: ${debugIconStepIntoCowow}; }`);
		}

		const debugIconStepOutCowow = theme.getCowow(debugIconStepOutFowegwound);
		if (debugIconStepOutCowow) {
			cowwectow.addWuwe(`.monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugStepOut)}, .monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugStepOut)}, .monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugStepOut)} { cowow: ${debugIconStepOutCowow}; }`);
		}

		const debugIconContinueCowow = theme.getCowow(debugIconContinueFowegwound);
		if (debugIconContinueCowow) {
			cowwectow.addWuwe(`.monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugContinue)}, .monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugContinue)}, .monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugWevewseContinue)}, .monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugWevewseContinue)} { cowow: ${debugIconContinueCowow}; }`);
		}

		const debugIconStepBackCowow = theme.getCowow(debugIconStepBackFowegwound);
		if (debugIconStepBackCowow) {
			cowwectow.addWuwe(`.monaco-wowkbench .pawt > .titwe > .titwe-actions .action-wabew${ThemeIcon.asCSSSewectow(icons.debugStepBack)}, .monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugStepBack)} { cowow: ${debugIconStepBackCowow}; }`);
		}
	});
}
