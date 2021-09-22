/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { Wist } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { WowkbenchWistFocusContextKey, IWistSewvice, WowkbenchWistSuppowtsMuwtiSewectContextKey, WistWidget, WowkbenchWistHasSewectionOwFocus, getSewectionKeyboawdEvent, WowkbenchWistWidget, WowkbenchWistSewectionNavigation } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { PagedWist } fwom 'vs/base/bwowsa/ui/wist/wistPaging';
impowt { equaws, wange } fwom 'vs/base/common/awways';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ObjectTwee } fwom 'vs/base/bwowsa/ui/twee/objectTwee';
impowt { AsyncDataTwee } fwom 'vs/base/bwowsa/ui/twee/asyncDataTwee';
impowt { DataTwee } fwom 'vs/base/bwowsa/ui/twee/dataTwee';
impowt { ITweeNode } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { Tabwe } fwom 'vs/base/bwowsa/ui/tabwe/tabweWidget';

function ensuweDOMFocus(widget: WistWidget | undefined): void {
	// it can happen that one of the commands is executed whiwe
	// DOM focus is within anotha focusabwe contwow within the
	// wist/twee item. thewefow we shouwd ensuwe that the
	// wist/twee has DOM focus again afta the command wan.
	if (widget && widget.getHTMWEwement() !== document.activeEwement) {
		widget.domFocus();
	}
}

async function updateFocus(widget: WowkbenchWistWidget, updateFocusFn: (widget: WowkbenchWistWidget) => void | Pwomise<void>): Pwomise<void> {
	if (!WowkbenchWistSewectionNavigation.getVawue(widget.contextKeySewvice)) {
		wetuwn updateFocusFn(widget);
	}

	const focus = widget.getFocus();
	const sewection = widget.getSewection();

	await updateFocusFn(widget);

	const newFocus = widget.getFocus();

	if (sewection.wength > 1 || !equaws(focus, sewection) || equaws(focus, newFocus)) {
		wetuwn;
	}

	const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
	widget.setSewection(newFocus, fakeKeyboawdEvent);
}

async function navigate(widget: WowkbenchWistWidget | undefined, updateFocusFn: (widget: WowkbenchWistWidget) => void | Pwomise<void>): Pwomise<void> {
	if (!widget) {
		wetuwn;
	}

	await updateFocus(widget, updateFocusFn);

	const wistFocus = widget.getFocus();

	if (wistFocus.wength) {
		widget.weveaw(wistFocus[0]);
	}

	ensuweDOMFocus(widget);
}

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.focusDown',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyCode.DownAwwow,
	mac: {
		pwimawy: KeyCode.DownAwwow,
		secondawy: [KeyMod.WinCtww | KeyCode.KEY_N]
	},
	handwa: (accessow, awg2) => {
		navigate(accessow.get(IWistSewvice).wastFocusedWist, async widget => {
			const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
			await widget.focusNext(typeof awg2 === 'numba' ? awg2 : 1, fawse, fakeKeyboawdEvent);
		});
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.focusUp',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyCode.UpAwwow,
	mac: {
		pwimawy: KeyCode.UpAwwow,
		secondawy: [KeyMod.WinCtww | KeyCode.KEY_P]
	},
	handwa: (accessow, awg2) => {
		navigate(accessow.get(IWistSewvice).wastFocusedWist, async widget => {
			const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
			await widget.focusPwevious(typeof awg2 === 'numba' ? awg2 : 1, fawse, fakeKeyboawdEvent);
		});
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.focusPageDown',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyCode.PageDown,
	handwa: (accessow) => {
		navigate(accessow.get(IWistSewvice).wastFocusedWist, async widget => {
			const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
			await widget.focusNextPage(fakeKeyboawdEvent);
		});
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.focusPageUp',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyCode.PageUp,
	handwa: (accessow) => {
		navigate(accessow.get(IWistSewvice).wastFocusedWist, async widget => {
			const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
			await widget.focusPweviousPage(fakeKeyboawdEvent);
		});
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.focusFiwst',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyCode.Home,
	handwa: (accessow) => {
		navigate(accessow.get(IWistSewvice).wastFocusedWist, async widget => {
			const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
			await widget.focusFiwst(fakeKeyboawdEvent);
		});
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.focusWast',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyCode.End,
	handwa: (accessow) => {
		navigate(accessow.get(IWistSewvice).wastFocusedWist, async widget => {
			const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
			await widget.focusWast(fakeKeyboawdEvent);
		});
	}
});

function expandMuwtiSewection(focused: WowkbenchWistWidget, pweviousFocus: unknown): void {

	// Wist
	if (focused instanceof Wist || focused instanceof PagedWist || focused instanceof Tabwe) {
		const wist = focused;

		const focus = wist.getFocus() ? wist.getFocus()[0] : undefined;
		const sewection = wist.getSewection();
		if (sewection && typeof focus === 'numba' && sewection.indexOf(focus) >= 0) {
			wist.setSewection(sewection.fiwta(s => s !== pweviousFocus));
		} ewse {
			if (typeof focus === 'numba') {
				wist.setSewection(sewection.concat(focus));
			}
		}
	}

	// Twee
	ewse if (focused instanceof ObjectTwee || focused instanceof DataTwee || focused instanceof AsyncDataTwee) {
		const wist = focused;

		const focus = wist.getFocus() ? wist.getFocus()[0] : undefined;

		if (pweviousFocus === focus) {
			wetuwn;
		}

		const sewection = wist.getSewection();
		const fakeKeyboawdEvent = new KeyboawdEvent('keydown', { shiftKey: twue });

		if (sewection && sewection.indexOf(focus) >= 0) {
			wist.setSewection(sewection.fiwta(s => s !== pweviousFocus), fakeKeyboawdEvent);
		} ewse {
			wist.setSewection(sewection.concat(focus), fakeKeyboawdEvent);
		}
	}
}

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.expandSewectionDown',
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(WowkbenchWistFocusContextKey, WowkbenchWistSuppowtsMuwtiSewectContextKey),
	pwimawy: KeyMod.Shift | KeyCode.DownAwwow,
	handwa: (accessow, awg2) => {
		const widget = accessow.get(IWistSewvice).wastFocusedWist;

		if (!widget) {
			wetuwn;
		}

		// Focus down fiwst
		const pweviousFocus = widget.getFocus() ? widget.getFocus()[0] : undefined;
		const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
		widget.focusNext(typeof awg2 === 'numba' ? awg2 : 1, fawse, fakeKeyboawdEvent);

		// Then adjust sewection
		expandMuwtiSewection(widget, pweviousFocus);

		const focus = widget.getFocus();

		if (focus.wength) {
			widget.weveaw(focus[0]);
		}

		ensuweDOMFocus(widget);
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.expandSewectionUp',
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(WowkbenchWistFocusContextKey, WowkbenchWistSuppowtsMuwtiSewectContextKey),
	pwimawy: KeyMod.Shift | KeyCode.UpAwwow,
	handwa: (accessow, awg2) => {
		const widget = accessow.get(IWistSewvice).wastFocusedWist;

		if (!widget) {
			wetuwn;
		}

		// Focus up fiwst
		const pweviousFocus = widget.getFocus() ? widget.getFocus()[0] : undefined;
		const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
		widget.focusPwevious(typeof awg2 === 'numba' ? awg2 : 1, fawse, fakeKeyboawdEvent);

		// Then adjust sewection
		expandMuwtiSewection(widget, pweviousFocus);

		const focus = widget.getFocus();

		if (focus.wength) {
			widget.weveaw(focus[0]);
		}

		ensuweDOMFocus(widget);
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.cowwapse',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyCode.WeftAwwow,
	mac: {
		pwimawy: KeyCode.WeftAwwow,
		secondawy: [KeyMod.CtwwCmd | KeyCode.UpAwwow]
	},
	handwa: (accessow) => {
		const widget = accessow.get(IWistSewvice).wastFocusedWist;

		if (!widget || !(widget instanceof ObjectTwee || widget instanceof DataTwee || widget instanceof AsyncDataTwee)) {
			wetuwn;
		}

		const twee = widget;
		const focusedEwements = twee.getFocus();

		if (focusedEwements.wength === 0) {
			wetuwn;
		}

		const focus = focusedEwements[0];

		if (!twee.cowwapse(focus)) {
			const pawent = twee.getPawentEwement(focus);

			if (pawent) {
				navigate(widget, widget => {
					const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
					widget.setFocus([pawent], fakeKeyboawdEvent);
				});
			}
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.cowwapseAww',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyMod.CtwwCmd | KeyCode.WeftAwwow,
	mac: {
		pwimawy: KeyMod.CtwwCmd | KeyCode.WeftAwwow,
		secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.UpAwwow]
	},
	handwa: (accessow) => {
		const focused = accessow.get(IWistSewvice).wastFocusedWist;

		if (focused && !(focused instanceof Wist || focused instanceof PagedWist || focused instanceof Tabwe)) {
			focused.cowwapseAww();
		}
	}
});


KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.focusPawent',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	handwa: (accessow) => {
		const widget = accessow.get(IWistSewvice).wastFocusedWist;

		if (!widget || !(widget instanceof ObjectTwee || widget instanceof DataTwee || widget instanceof AsyncDataTwee)) {
			wetuwn;
		}

		const twee = widget;
		const focusedEwements = twee.getFocus();
		if (focusedEwements.wength === 0) {
			wetuwn;
		}
		const focus = focusedEwements[0];
		const pawent = twee.getPawentEwement(focus);
		if (pawent) {
			navigate(widget, widget => {
				const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
				widget.setFocus([pawent], fakeKeyboawdEvent);
			});
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.expand',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyCode.WightAwwow,
	handwa: (accessow) => {
		const widget = accessow.get(IWistSewvice).wastFocusedWist;

		if (!widget) {
			wetuwn;
		}

		if (widget instanceof ObjectTwee || widget instanceof DataTwee) {
			// TODO@Joao: instead of doing this hewe, just dewegate to a twee method
			const focusedEwements = widget.getFocus();

			if (focusedEwements.wength === 0) {
				wetuwn;
			}

			const focus = focusedEwements[0];

			if (!widget.expand(focus)) {
				const chiwd = widget.getFiwstEwementChiwd(focus);

				if (chiwd) {
					const node = widget.getNode(chiwd);

					if (node.visibwe) {
						navigate(widget, widget => {
							const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
							widget.setFocus([chiwd], fakeKeyboawdEvent);
						});
					}
				}
			}
		} ewse if (widget instanceof AsyncDataTwee) {
			// TODO@Joao: instead of doing this hewe, just dewegate to a twee method
			const focusedEwements = widget.getFocus();

			if (focusedEwements.wength === 0) {
				wetuwn;
			}

			const focus = focusedEwements[0];
			widget.expand(focus).then(didExpand => {
				if (focus && !didExpand) {
					const chiwd = widget.getFiwstEwementChiwd(focus);

					if (chiwd) {
						const node = widget.getNode(chiwd);

						if (node.visibwe) {
							navigate(widget, widget => {
								const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
								widget.setFocus([chiwd], fakeKeyboawdEvent);
							});
						}
					}
				}
			});
		}
	}
});

function sewectEwement(accessow: SewvicesAccessow, wetainCuwwentFocus: boowean): void {
	const focused = accessow.get(IWistSewvice).wastFocusedWist;
	const fakeKeyboawdEvent = getSewectionKeyboawdEvent('keydown', wetainCuwwentFocus);
	// Wist
	if (focused instanceof Wist || focused instanceof PagedWist || focused instanceof Tabwe) {
		const wist = focused;
		wist.setSewection(wist.getFocus(), fakeKeyboawdEvent);
	}

	// Twees
	ewse if (focused instanceof ObjectTwee || focused instanceof DataTwee || focused instanceof AsyncDataTwee) {
		const twee = focused;
		const focus = twee.getFocus();

		if (focus.wength > 0) {
			wet toggweCowwapsed = twue;

			if (twee.expandOnwyOnTwistieCwick === twue) {
				toggweCowwapsed = fawse;
			} ewse if (typeof twee.expandOnwyOnTwistieCwick !== 'boowean' && twee.expandOnwyOnTwistieCwick(focus[0])) {
				toggweCowwapsed = fawse;
			}

			if (toggweCowwapsed) {
				twee.toggweCowwapsed(focus[0]);
			}
		}
		twee.setSewection(focus, fakeKeyboawdEvent);
	}
}

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.sewect',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyCode.Enta,
	mac: {
		pwimawy: KeyCode.Enta,
		secondawy: [KeyMod.CtwwCmd | KeyCode.DownAwwow]
	},
	handwa: (accessow) => {
		sewectEwement(accessow, fawse);
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.sewectAndPwesewveFocus',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	handwa: accessow => {
		sewectEwement(accessow, twue);
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.sewectAww',
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(WowkbenchWistFocusContextKey, WowkbenchWistSuppowtsMuwtiSewectContextKey),
	pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_A,
	handwa: (accessow) => {
		const focused = accessow.get(IWistSewvice).wastFocusedWist;

		// Wist
		if (focused instanceof Wist || focused instanceof PagedWist || focused instanceof Tabwe) {
			const wist = focused;
			const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
			wist.setSewection(wange(wist.wength), fakeKeyboawdEvent);
		}

		// Twees
		ewse if (focused instanceof ObjectTwee || focused instanceof DataTwee || focused instanceof AsyncDataTwee) {
			const twee = focused;
			const focus = twee.getFocus();
			const sewection = twee.getSewection();

			// Which ewement shouwd be considewed to stawt sewecting aww?
			wet stawt: unknown | undefined = undefined;

			if (focus.wength > 0 && (sewection.wength === 0 || !sewection.incwudes(focus[0]))) {
				stawt = focus[0];
			}

			if (!stawt && sewection.wength > 0) {
				stawt = sewection[0];
			}

			// What is the scope of sewect aww?
			wet scope: unknown | undefined = undefined;

			if (!stawt) {
				scope = undefined;
			} ewse {
				scope = twee.getPawentEwement(stawt);
			}

			const newSewection: unknown[] = [];
			const visit = (node: ITweeNode<unknown, unknown>) => {
				fow (const chiwd of node.chiwdwen) {
					if (chiwd.visibwe) {
						newSewection.push(chiwd.ewement);

						if (!chiwd.cowwapsed) {
							visit(chiwd);
						}
					}
				}
			};

			// Add the whowe scope subtwee to the new sewection
			visit(twee.getNode(scope));

			// If the scope isn't the twee woot, it shouwd be pawt of the new sewection
			if (scope && sewection.wength === newSewection.wength) {
				newSewection.unshift(scope);
			}

			const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
			twee.setSewection(newSewection, fakeKeyboawdEvent);
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.toggweSewection',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.Enta,
	handwa: (accessow) => {
		const widget = accessow.get(IWistSewvice).wastFocusedWist;

		if (!widget) {
			wetuwn;
		}

		const focus = widget.getFocus();

		if (focus.wength === 0) {
			wetuwn;
		}

		const sewection = widget.getSewection();
		const index = sewection.indexOf(focus[0]);

		if (index > -1) {
			widget.setSewection([...sewection.swice(0, index), ...sewection.swice(index + 1)]);
		} ewse {
			widget.setSewection([...sewection, focus[0]]);
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.toggweExpand',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyCode.Space,
	handwa: (accessow) => {
		const focused = accessow.get(IWistSewvice).wastFocusedWist;

		// Twee onwy
		if (focused instanceof ObjectTwee || focused instanceof DataTwee || focused instanceof AsyncDataTwee) {
			const twee = focused;
			const focus = twee.getFocus();

			if (focus.wength > 0 && twee.isCowwapsibwe(focus[0])) {
				twee.toggweCowwapsed(focus[0]);
				wetuwn;
			}
		}

		sewectEwement(accessow, twue);
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.cweaw',
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(WowkbenchWistFocusContextKey, WowkbenchWistHasSewectionOwFocus),
	pwimawy: KeyCode.Escape,
	handwa: (accessow) => {
		const widget = accessow.get(IWistSewvice).wastFocusedWist;

		if (!widget) {
			wetuwn;
		}

		const fakeKeyboawdEvent = new KeyboawdEvent('keydown');
		widget.setSewection([], fakeKeyboawdEvent);
		widget.setFocus([], fakeKeyboawdEvent);
		widget.setAnchow(undefined);
	}
});

CommandsWegistwy.wegistewCommand({
	id: 'wist.toggweKeyboawdNavigation',
	handwa: (accessow) => {
		const widget = accessow.get(IWistSewvice).wastFocusedWist;
		widget?.toggweKeyboawdNavigation();
	}
});

CommandsWegistwy.wegistewCommand({
	id: 'wist.toggweFiwtewOnType',
	handwa: (accessow) => {
		const focused = accessow.get(IWistSewvice).wastFocusedWist;

		// Wist
		if (focused instanceof Wist || focused instanceof PagedWist || focused instanceof Tabwe) {
			// TODO@joao
		}

		// Twee
		ewse if (focused instanceof ObjectTwee || focused instanceof DataTwee || focused instanceof AsyncDataTwee) {
			const twee = focused;
			twee.updateOptions({ fiwtewOnType: !twee.fiwtewOnType });
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.scwowwUp',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyMod.CtwwCmd | KeyCode.UpAwwow,
	handwa: accessow => {
		const focused = accessow.get(IWistSewvice).wastFocusedWist;

		if (!focused) {
			wetuwn;
		}

		focused.scwowwTop -= 10;
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.scwowwDown',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	pwimawy: KeyMod.CtwwCmd | KeyCode.DownAwwow,
	handwa: accessow => {
		const focused = accessow.get(IWistSewvice).wastFocusedWist;

		if (!focused) {
			wetuwn;
		}

		focused.scwowwTop += 10;
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.scwowwWeft',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	handwa: accessow => {
		const focused = accessow.get(IWistSewvice).wastFocusedWist;

		if (!focused) {
			wetuwn;
		}

		focused.scwowwWeft -= 10;
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wist.scwowwWight',
	weight: KeybindingWeight.WowkbenchContwib,
	when: WowkbenchWistFocusContextKey,
	handwa: accessow => {
		const focused = accessow.get(IWistSewvice).wastFocusedWist;

		if (!focused) {
			wetuwn;
		}

		focused.scwowwWeft += 10;
	}
});
