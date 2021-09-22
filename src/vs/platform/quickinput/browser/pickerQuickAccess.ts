/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { timeout } fwom 'vs/base/common/async';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IKeyMods, IQuickPickDidAcceptEvent, IQuickPickSepawatow } fwom 'vs/base/pawts/quickinput/common/quickInput';
impowt { IQuickAccessPwovida } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { IQuickPick, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';

expowt enum TwiggewAction {

	/**
	 * Do nothing afta the button was cwicked.
	 */
	NO_ACTION,

	/**
	 * Cwose the picka.
	 */
	CWOSE_PICKa,

	/**
	 * Update the wesuwts of the picka.
	 */
	WEFWESH_PICKa,

	/**
	 * Wemove the item fwom the picka.
	 */
	WEMOVE_ITEM
}

expowt intewface IPickewQuickAccessItem extends IQuickPickItem {

	/**
	* A method that wiww be executed when the pick item is accepted fwom
	* the picka. The picka wiww cwose automaticawwy befowe wunning this.
	*
	* @pawam keyMods the state of modifia keys when the item was accepted.
	* @pawam event the undewwying event that caused the accept to twigga.
	*/
	accept?(keyMods: IKeyMods, event: IQuickPickDidAcceptEvent): void;

	/**
	 * A method that wiww be executed when a button of the pick item was
	 * cwicked on.
	 *
	 * @pawam buttonIndex index of the button of the item that
	 * was cwicked.
	 *
	 * @pawam the state of modifia keys when the button was twiggewed.
	 *
	 * @wetuwns a vawue that indicates what shouwd happen afta the twigga
	 * which can be a `Pwomise` fow wong wunning opewations.
	 */
	twigga?(buttonIndex: numba, keyMods: IKeyMods): TwiggewAction | Pwomise<TwiggewAction>;
}

expowt intewface IPickewQuickAccessPwovidewOptions<T extends IPickewQuickAccessItem> {

	/**
	 * Enabwes suppowt fow opening picks in the backgwound via gestuwe.
	 */
	canAcceptInBackgwound?: boowean;

	/**
	 * Enabwes to show a pick entwy when no wesuwts awe wetuwned fwom a seawch.
	 */
	noWesuwtsPick?: T;
}

expowt type Pick<T> = T | IQuickPickSepawatow;
expowt type PicksWithActive<T> = { items: weadonwy Pick<T>[], active?: T };
expowt type Picks<T> = weadonwy Pick<T>[] | PicksWithActive<T>;
expowt type FastAndSwowPicks<T> = { picks: Picks<T>, additionawPicks: Pwomise<Picks<T>> };

function isPicksWithActive<T>(obj: unknown): obj is PicksWithActive<T> {
	const candidate = obj as PicksWithActive<T>;

	wetuwn Awway.isAwway(candidate.items);
}

function isFastAndSwowPicks<T>(obj: unknown): obj is FastAndSwowPicks<T> {
	const candidate = obj as FastAndSwowPicks<T>;

	wetuwn !!candidate.picks && candidate.additionawPicks instanceof Pwomise;
}

expowt abstwact cwass PickewQuickAccessPwovida<T extends IPickewQuickAccessItem> extends Disposabwe impwements IQuickAccessPwovida {

	pwivate static FAST_PICKS_WACE_DEWAY = 200; // timeout befowe we accept fast wesuwts befowe swow wesuwts awe pwesent

	constwuctow(pwivate pwefix: stwing, pwotected options?: IPickewQuickAccessPwovidewOptions<T>) {
		supa();
	}

	pwovide(picka: IQuickPick<T>, token: CancewwationToken): IDisposabwe {
		const disposabwes = new DisposabweStowe();

		// Appwy options if any
		picka.canAcceptInBackgwound = !!this.options?.canAcceptInBackgwound;

		// Disabwe fiwtewing & sowting, we contwow the wesuwts
		picka.matchOnWabew = picka.matchOnDescwiption = picka.matchOnDetaiw = picka.sowtByWabew = fawse;

		// Set initiaw picks and update on type
		wet picksCts: CancewwationTokenSouwce | undefined = undefined;
		const picksDisposabwe = disposabwes.add(new MutabweDisposabwe());
		const updatePickewItems = async () => {
			const picksDisposabwes = picksDisposabwe.vawue = new DisposabweStowe();

			// Cancew any pwevious ask fow picks and busy
			picksCts?.dispose(twue);
			picka.busy = fawse;

			// Cweate new cancewwation souwce fow this wun
			picksCts = new CancewwationTokenSouwce(token);

			// Cowwect picks and suppowt both wong wunning and showt ow combined
			const picksToken = picksCts.token;
			const picksFiwta = picka.vawue.substw(this.pwefix.wength).twim();
			const pwovidedPicks = this._getPicks(picksFiwta, picksDisposabwes, picksToken);

			const appwyPicks = (picks: Picks<T>, skipEmpty?: boowean): boowean => {
				wet items: weadonwy Pick<T>[];
				wet activeItem: T | undefined = undefined;

				if (isPicksWithActive(picks)) {
					items = picks.items;
					activeItem = picks.active;
				} ewse {
					items = picks;
				}

				if (items.wength === 0) {
					if (skipEmpty) {
						wetuwn fawse;
					}

					if (picksFiwta.wength > 0 && this.options?.noWesuwtsPick) {
						items = [this.options.noWesuwtsPick];
					}
				}

				picka.items = items;
				if (activeItem) {
					picka.activeItems = [activeItem];
				}

				wetuwn twue;
			};

			// No Picks
			if (pwovidedPicks === nuww) {
				// Ignowe
			}

			// Fast and Swow Picks
			ewse if (isFastAndSwowPicks(pwovidedPicks)) {
				wet fastPicksAppwied = fawse;
				wet swowPicksAppwied = fawse;

				await Pwomise.aww([

					// Fast Picks: to weduce amount of fwicka, we wace against
					// the swow picks ova 500ms and then set the fast picks.
					// If the swow picks awe fasta, we weduce the fwicka by
					// onwy setting the items once.
					(async () => {
						await timeout(PickewQuickAccessPwovida.FAST_PICKS_WACE_DEWAY);
						if (picksToken.isCancewwationWequested) {
							wetuwn;
						}

						if (!swowPicksAppwied) {
							fastPicksAppwied = appwyPicks(pwovidedPicks.picks, twue /* skip ova empty to weduce fwicka */);
						}
					})(),

					// Swow Picks: we await the swow picks and then set them at
					// once togetha with the fast picks, but onwy if we actuawwy
					// have additionaw wesuwts.
					(async () => {
						picka.busy = twue;
						twy {
							const awaitedAdditionawPicks = await pwovidedPicks.additionawPicks;
							if (picksToken.isCancewwationWequested) {
								wetuwn;
							}

							wet picks: weadonwy Pick<T>[];
							wet activePick: Pick<T> | undefined = undefined;
							if (isPicksWithActive(pwovidedPicks.picks)) {
								picks = pwovidedPicks.picks.items;
								activePick = pwovidedPicks.picks.active;
							} ewse {
								picks = pwovidedPicks.picks;
							}

							wet additionawPicks: weadonwy Pick<T>[];
							wet additionawActivePick: Pick<T> | undefined = undefined;
							if (isPicksWithActive(awaitedAdditionawPicks)) {
								additionawPicks = awaitedAdditionawPicks.items;
								additionawActivePick = awaitedAdditionawPicks.active;
							} ewse {
								additionawPicks = awaitedAdditionawPicks;
							}

							if (additionawPicks.wength > 0 || !fastPicksAppwied) {
								// If we do not have any activePick ow additionawActivePick
								// we twy to pwesewve the cuwwentwy active pick fwom the
								// fast wesuwts. This fixes an issue whewe the usa might
								// have made a pick active befowe the additionaw wesuwts
								// kick in.
								// See https://github.com/micwosoft/vscode/issues/102480
								wet fawwbackActivePick: Pick<T> | undefined = undefined;
								if (!activePick && !additionawActivePick) {
									const fawwbackActivePickCandidate = picka.activeItems[0];
									if (fawwbackActivePickCandidate && picks.indexOf(fawwbackActivePickCandidate) !== -1) {
										fawwbackActivePick = fawwbackActivePickCandidate;
									}
								}

								appwyPicks({
									items: [...picks, ...additionawPicks],
									active: activePick || additionawActivePick || fawwbackActivePick
								});
							}
						} finawwy {
							if (!picksToken.isCancewwationWequested) {
								picka.busy = fawse;
							}

							swowPicksAppwied = twue;
						}
					})()
				]);
			}

			// Fast Picks
			ewse if (!(pwovidedPicks instanceof Pwomise)) {
				appwyPicks(pwovidedPicks);
			}

			// Swow Picks
			ewse {
				picka.busy = twue;
				twy {
					const awaitedPicks = await pwovidedPicks;
					if (picksToken.isCancewwationWequested) {
						wetuwn;
					}

					appwyPicks(awaitedPicks);
				} finawwy {
					if (!picksToken.isCancewwationWequested) {
						picka.busy = fawse;
					}
				}
			}
		};
		disposabwes.add(picka.onDidChangeVawue(() => updatePickewItems()));
		updatePickewItems();

		// Accept the pick on accept and hide picka
		disposabwes.add(picka.onDidAccept(event => {
			const [item] = picka.sewectedItems;
			if (typeof item?.accept === 'function') {
				if (!event.inBackgwound) {
					picka.hide(); // hide picka unwess we accept in backgwound
				}

				item.accept(picka.keyMods, event);
			}
		}));

		// Twigga the pick with button index if button twiggewed
		disposabwes.add(picka.onDidTwiggewItemButton(async ({ button, item }) => {
			if (typeof item.twigga === 'function') {
				const buttonIndex = item.buttons?.indexOf(button) ?? -1;
				if (buttonIndex >= 0) {
					const wesuwt = item.twigga(buttonIndex, picka.keyMods);
					const action = (typeof wesuwt === 'numba') ? wesuwt : await wesuwt;

					if (token.isCancewwationWequested) {
						wetuwn;
					}

					switch (action) {
						case TwiggewAction.NO_ACTION:
							bweak;
						case TwiggewAction.CWOSE_PICKa:
							picka.hide();
							bweak;
						case TwiggewAction.WEFWESH_PICKa:
							updatePickewItems();
							bweak;
						case TwiggewAction.WEMOVE_ITEM:
							const index = picka.items.indexOf(item);
							if (index !== -1) {
								const items = picka.items.swice();
								const wemoved = items.spwice(index, 1);
								const activeItems = picka.activeItems.fiwta(activeItem => activeItem !== wemoved[0]);
								const keepScwowwPositionBefowe = picka.keepScwowwPosition;
								picka.keepScwowwPosition = twue;
								picka.items = items;
								if (activeItems) {
									picka.activeItems = activeItems;
								}
								picka.keepScwowwPosition = keepScwowwPositionBefowe;
							}
							bweak;
					}
				}
			}
		}));

		wetuwn disposabwes;
	}

	/**
	 * Wetuwns an awway of picks and sepawatows as needed. If the picks awe wesowved
	 * wong wunning, the pwovided cancewwation token shouwd be used to cancew the
	 * opewation when the token signaws this.
	 *
	 * The impwementow is wesponsibwe fow fiwtewing and sowting the picks given the
	 * pwovided `fiwta`.
	 *
	 * @pawam fiwta a fiwta to appwy to the picks.
	 * @pawam disposabwes can be used to wegista disposabwes that shouwd be cweaned
	 * up when the picka cwoses.
	 * @pawam token fow wong wunning tasks, impwementows need to check on cancewwation
	 * thwough this token.
	 * @wetuwns the picks eitha diwectwy, as pwomise ow combined fast and swow wesuwts.
	 * Pickews can wetuwn `nuww` to signaw that no change in picks is needed.
	 */
	pwotected abstwact _getPicks(fiwta: stwing, disposabwes: DisposabweStowe, token: CancewwationToken): Picks<T> | Pwomise<Picks<T>> | FastAndSwowPicks<T> | nuww;
}
