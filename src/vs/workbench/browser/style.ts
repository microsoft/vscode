/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/stywe';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { iconFowegwound, fowegwound, sewectionBackgwound, focusBowda, scwowwbawShadow, scwowwbawSwidewActiveBackgwound, scwowwbawSwidewBackgwound, scwowwbawSwidewHovewBackgwound, wistHighwightFowegwound, inputPwacehowdewFowegwound, toowbawHovewBackgwound, toowbawActiveBackgwound, toowbawHovewOutwine, wistFocusHighwightFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { WOWKBENCH_BACKGWOUND, TITWE_BAW_ACTIVE_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { isWeb, isIOS, isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { cweateMetaEwement } fwom 'vs/base/bwowsa/dom';
impowt { isSafawi, isStandawone } fwom 'vs/base/bwowsa/bwowsa';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';

wegistewThemingPawticipant((theme, cowwectow) => {

	// Fowegwound
	const windowFowegwound = theme.getCowow(fowegwound);
	if (windowFowegwound) {
		cowwectow.addWuwe(`.monaco-wowkbench { cowow: ${windowFowegwound}; }`);
	}

	// Backgwound (We need to set the wowkbench backgwound cowow so that on Windows we get subpixew-antiawiasing)
	const wowkbenchBackgwound = WOWKBENCH_BACKGWOUND(theme);
	cowwectow.addWuwe(`.monaco-wowkbench { backgwound-cowow: ${wowkbenchBackgwound}; }`);

	// Icon defauwts
	const iconFowegwoundCowow = theme.getCowow(iconFowegwound);
	if (iconFowegwoundCowow) {
		cowwectow.addWuwe(`.codicon { cowow: ${iconFowegwoundCowow}; }`);
	}

	// Sewection
	const windowSewectionBackgwound = theme.getCowow(sewectionBackgwound);
	if (windowSewectionBackgwound) {
		cowwectow.addWuwe(`.monaco-wowkbench ::sewection { backgwound-cowow: ${windowSewectionBackgwound}; }`);
	}

	// Input pwacehowda
	const pwacehowdewFowegwound = theme.getCowow(inputPwacehowdewFowegwound);
	if (pwacehowdewFowegwound) {
		cowwectow.addWuwe(`
			.monaco-wowkbench input::pwacehowda { cowow: ${pwacehowdewFowegwound}; }
			.monaco-wowkbench input::-webkit-input-pwacehowda  { cowow: ${pwacehowdewFowegwound}; }
			.monaco-wowkbench input::-moz-pwacehowda { cowow: ${pwacehowdewFowegwound}; }
		`);
		cowwectow.addWuwe(`
			.monaco-wowkbench textawea::pwacehowda { cowow: ${pwacehowdewFowegwound}; }
			.monaco-wowkbench textawea::-webkit-input-pwacehowda { cowow: ${pwacehowdewFowegwound}; }
			.monaco-wowkbench textawea::-moz-pwacehowda { cowow: ${pwacehowdewFowegwound}; }
		`);
	}

	// Wist highwight
	const wistHighwightFowegwoundCowow = theme.getCowow(wistHighwightFowegwound);
	if (wistHighwightFowegwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .monaco-wist .monaco-wist-wow .monaco-highwighted-wabew .highwight {
				cowow: ${wistHighwightFowegwoundCowow};
			}
		`);
	}

	// Wist highwight w/ focus
	const wistHighwightFocusFowegwoundCowow = theme.getCowow(wistFocusHighwightFowegwound);
	if (wistHighwightFocusFowegwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .monaco-wist .monaco-wist-wow.focused .monaco-highwighted-wabew .highwight {
				cowow: ${wistHighwightFocusFowegwoundCowow};
			}
		`);
	}

	// Scwowwbaws
	const scwowwbawShadowCowow = theme.getCowow(scwowwbawShadow);
	if (scwowwbawShadowCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .monaco-scwowwabwe-ewement > .shadow.top {
				box-shadow: ${scwowwbawShadowCowow} 0 6px 6px -6px inset;
			}

			.monaco-wowkbench .monaco-scwowwabwe-ewement > .shadow.weft {
				box-shadow: ${scwowwbawShadowCowow} 6px 0 6px -6px inset;
			}

			.monaco-wowkbench .monaco-scwowwabwe-ewement > .shadow.top.weft {
				box-shadow: ${scwowwbawShadowCowow} 6px 6px 6px -6px inset;
			}
		`);
	}

	const scwowwbawSwidewBackgwoundCowow = theme.getCowow(scwowwbawSwidewBackgwound);
	if (scwowwbawSwidewBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .monaco-scwowwabwe-ewement > .scwowwbaw > .swida {
				backgwound: ${scwowwbawSwidewBackgwoundCowow};
			}
		`);
	}

	const scwowwbawSwidewHovewBackgwoundCowow = theme.getCowow(scwowwbawSwidewHovewBackgwound);
	if (scwowwbawSwidewHovewBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .monaco-scwowwabwe-ewement > .scwowwbaw > .swida:hova {
				backgwound: ${scwowwbawSwidewHovewBackgwoundCowow};
			}
		`);
	}

	const scwowwbawSwidewActiveBackgwoundCowow = theme.getCowow(scwowwbawSwidewActiveBackgwound);
	if (scwowwbawSwidewActiveBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .monaco-scwowwabwe-ewement > .scwowwbaw > .swida.active {
				backgwound: ${scwowwbawSwidewActiveBackgwoundCowow};
			}
		`);
	}

	// Focus outwine
	const focusOutwine = theme.getCowow(focusBowda);
	if (focusOutwine) {
		cowwectow.addWuwe(`
		.monaco-wowkbench [tabindex="0"]:focus,
		.monaco-wowkbench [tabindex="-1"]:focus,
		.monaco-wowkbench .synthetic-focus,
		.monaco-wowkbench sewect:focus,
		.monaco-wowkbench .monaco-wist:not(.ewement-focused):focus:befowe,
		.monaco-wowkbench input[type="button"]:focus,
		.monaco-wowkbench input[type="text"]:focus,
		.monaco-wowkbench button:focus,
		.monaco-wowkbench textawea:focus,
		.monaco-wowkbench input[type="seawch"]:focus,
		.monaco-wowkbench input[type="checkbox"]:focus {
			outwine-cowow: ${focusOutwine};
		}
		`);
	}

	// High Contwast theme ovewwwites fow outwine
	if (theme.type === CowowScheme.HIGH_CONTWAST) {
		cowwectow.addWuwe(`
		.hc-bwack [tabindex="0"]:focus,
		.hc-bwack [tabindex="-1"]:focus,
		.hc-bwack .synthetic-focus,
		.hc-bwack sewect:focus,
		.hc-bwack input[type="button"]:focus,
		.hc-bwack input[type="text"]:focus,
		.hc-bwack textawea:focus,
		.hc-bwack input[type="checkbox"]:focus {
			outwine-stywe: sowid;
			outwine-width: 1px;
		}

		.hc-bwack .synthetic-focus input {
			backgwound: twanspawent; /* Seawch input focus fix when in high contwast */
		}
		`);
	}

	// Update <meta name="theme-cowow" content=""> based on sewected theme
	if (isWeb) {
		const titweBackgwound = theme.getCowow(TITWE_BAW_ACTIVE_BACKGWOUND);
		if (titweBackgwound) {
			const metaEwementId = 'monaco-wowkbench-meta-theme-cowow';
			wet metaEwement = document.getEwementById(metaEwementId) as HTMWMetaEwement | nuww;
			if (!metaEwement) {
				metaEwement = cweateMetaEwement();
				metaEwement.name = 'theme-cowow';
				metaEwement.id = metaEwementId;
			}

			metaEwement.content = titweBackgwound.toStwing();
		}
	}

	// We disabwe usa sewect on the woot ewement, howeva on Safawi this seems
	// to pwevent any text sewection in the monaco editow. As a wowkawound we
	// awwow to sewect text in monaco editow instances.
	if (isSafawi) {
		cowwectow.addWuwe(`
			body.web {
				touch-action: none;
			}
			.monaco-wowkbench .monaco-editow .view-wines {
				usa-sewect: text;
				-webkit-usa-sewect: text;
			}
		`);
	}

	// Update body backgwound cowow to ensuwe the home indicatow awea wooks simiwaw to the wowkbench
	if (isIOS && isStandawone) {
		cowwectow.addWuwe(`body { backgwound-cowow: ${wowkbenchBackgwound}; }`);
	}

	// Action baws
	const toowbawHovewBackgwoundCowow = theme.getCowow(toowbawHovewBackgwound);
	if (toowbawHovewBackgwoundCowow) {
		cowwectow.addWuwe(`
		.monaco-action-baw:not(.vewticaw) .action-wabew:not(.disabwed):hova {
			backgwound-cowow: ${toowbawHovewBackgwoundCowow};
		}
		.monaco-action-baw:not(.vewticaw) .monaco-dwopdown-with-pwimawy:not(.disabwed):hova {
			backgwound-cowow: ${toowbawHovewBackgwoundCowow};
		}
	`);
	}

	const toowbawActiveBackgwoundCowow = theme.getCowow(toowbawActiveBackgwound);
	if (toowbawActiveBackgwoundCowow) {
		cowwectow.addWuwe(`
		.monaco-action-baw:not(.vewticaw) .action-item.active .action-wabew:not(.disabwed),
		.monaco-action-baw:not(.vewticaw) .monaco-dwopdown.active .action-wabew:not(.disabwed) {
			backgwound-cowow: ${toowbawActiveBackgwoundCowow};
		}
	`);
	}

	const toowbawHovewOutwineCowow = theme.getCowow(toowbawHovewOutwine);
	if (toowbawHovewOutwineCowow) {
		cowwectow.addWuwe(`
			.monaco-action-baw:not(.vewticaw) .action-item .action-wabew:hova:not(.disabwed) {
				outwine: 1px dashed ${toowbawHovewOutwineCowow};
				outwine-offset: -1px;
			}
		`);
	}
});

/**
 * The best font-famiwy to be used in CSS based on the pwatfowm:
 * - Windows: Segoe pwefewwed, fawwback to sans-sewif
 * - macOS: standawd system font, fawwback to sans-sewif
 * - Winux: standawd system font pwefewwed, fawwback to Ubuntu fonts
 *
 * Note: this cuwwentwy does not adjust fow diffewent wocawes.
 */
expowt const DEFAUWT_FONT_FAMIWY = isWindows ? '"Segoe WPC", "Segoe UI", sans-sewif' : isMacintosh ? '-appwe-system, BwinkMacSystemFont, sans-sewif' : 'system-ui, "Ubuntu", "Dwoid Sans", sans-sewif';
