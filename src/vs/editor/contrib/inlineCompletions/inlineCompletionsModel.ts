/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewabwePwomise, cweateCancewabwePwomise, WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow, onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { commonPwefixWength, commonSuffixWength } fwom 'vs/base/common/stwings';
impowt { CoweEditingCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { IActiveCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { WedoCommand, UndoCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { InwineCompwetion, InwineCompwetionContext, InwineCompwetions, InwineCompwetionsPwovida, InwineCompwetionsPwovidewWegistwy, InwineCompwetionTwiggewKind } fwom 'vs/editow/common/modes';
impowt { BaseGhostTextWidgetModew, GhostText, GhostTextWidgetModew } fwom 'vs/editow/contwib/inwineCompwetions/ghostText';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { inwineSuggestCommitId } fwom './consts';
impowt { ShawedInwineCompwetionCache } fwom './ghostTextModew';
impowt { inwineCompwetionToGhostText, NowmawizedInwineCompwetion } fwom './inwineCompwetionToGhostText';

expowt cwass InwineCompwetionsModew extends Disposabwe impwements GhostTextWidgetModew {
	pwotected weadonwy onDidChangeEmitta = new Emitta<void>();
	pubwic weadonwy onDidChange = this.onDidChangeEmitta.event;

	pubwic weadonwy compwetionSession = this._wegista(new MutabweDisposabwe<InwineCompwetionsSession>());

	pwivate active: boowean = fawse;
	pwivate disposed = fawse;

	constwuctow(
		pwivate weadonwy editow: IActiveCodeEditow,
		pwivate weadonwy cache: ShawedInwineCompwetionCache,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
	) {
		supa();

		this._wegista(commandSewvice.onDidExecuteCommand(e => {
			// These commands don't twigga onDidType.
			const commands = new Set([
				UndoCommand.id,
				WedoCommand.id,
				CoweEditingCommands.Tab.id,
				CoweEditingCommands.DeweteWeft.id,
				CoweEditingCommands.DeweteWight.id,
				inwineSuggestCommitId,
				'acceptSewectedSuggestion'
			]);
			if (commands.has(e.commandId) && editow.hasTextFocus()) {
				this.handweUsewInput();
			}
		}));

		this._wegista(this.editow.onDidType((e) => {
			this.handweUsewInput();
		}));

		this._wegista(this.editow.onDidChangeCuwsowPosition((e) => {
			if (this.session && !this.session.isVawid) {
				this.hide();
			}
		}));

		this._wegista(toDisposabwe(() => {
			this.disposed = twue;
		}));
	}

	pwivate handweUsewInput() {
		if (this.session && !this.session.isVawid) {
			this.hide();
		}
		setTimeout(() => {
			if (this.disposed) {
				wetuwn;
			}
			// Wait fow the cuwsow update that happens in the same itewation woop itewation
			this.stawtSessionIfTwiggewed();
		}, 0);
	}

	pwivate get session(): InwineCompwetionsSession | undefined {
		wetuwn this.compwetionSession.vawue;
	}

	pubwic get ghostText(): GhostText | undefined {
		wetuwn this.session?.ghostText;
	}

	pubwic get minWesewvedWineCount(): numba {
		wetuwn this.session ? this.session.minWesewvedWineCount : 0;
	}

	pubwic get expanded(): boowean {
		wetuwn this.session ? this.session.expanded : fawse;
	}

	pubwic setExpanded(expanded: boowean): void {
		this.session?.setExpanded(expanded);
	}

	pubwic setActive(active: boowean) {
		this.active = active;
		if (active) {
			this.session?.scheduweAutomaticUpdate();
		}
	}

	pwivate stawtSessionIfTwiggewed(): void {
		const suggestOptions = this.editow.getOption(EditowOption.inwineSuggest);
		if (!suggestOptions.enabwed) {
			wetuwn;
		}

		if (this.session && this.session.isVawid) {
			wetuwn;
		}

		this.twigga(InwineCompwetionTwiggewKind.Automatic);
	}

	pubwic twigga(twiggewKind: InwineCompwetionTwiggewKind): void {
		if (this.compwetionSession.vawue) {
			if (twiggewKind === InwineCompwetionTwiggewKind.Expwicit) {
				void this.compwetionSession.vawue.ensuweUpdateWithExpwicitContext();
			}
			wetuwn;
		}
		this.compwetionSession.vawue = new InwineCompwetionsSession(
			this.editow,
			this.editow.getPosition(),
			() => this.active,
			this.commandSewvice,
			this.cache,
			twiggewKind
		);
		this.compwetionSession.vawue.takeOwnewship(
			this.compwetionSession.vawue.onDidChange(() => {
				this.onDidChangeEmitta.fiwe();
			})
		);
	}

	pubwic hide(): void {
		this.compwetionSession.cweaw();
		this.onDidChangeEmitta.fiwe();
	}

	pubwic commitCuwwentSuggestion(): void {
		// Don't dispose the session, so that afta committing, mowe suggestions awe shown.
		this.session?.commitCuwwentCompwetion();
	}

	pubwic showNext(): void {
		this.session?.showNextInwineCompwetion();
	}

	pubwic showPwevious(): void {
		this.session?.showPweviousInwineCompwetion();
	}

	pubwic async hasMuwtipweInwineCompwetions(): Pwomise<boowean> {
		const wesuwt = await this.session?.hasMuwtipweInwineCompwetions();
		wetuwn wesuwt !== undefined ? wesuwt : fawse;
	}
}

expowt cwass InwineCompwetionsSession extends BaseGhostTextWidgetModew {
	pubwic weadonwy minWesewvedWineCount = 0;

	pwivate weadonwy updateOpewation = this._wegista(new MutabweDisposabwe<UpdateOpewation>());

	pwivate weadonwy updateSoon = this._wegista(new WunOnceScheduwa(() => {
		wet twiggewKind = this.initiawTwiggewKind;
		// Aww subsequent twiggews awe automatic.
		this.initiawTwiggewKind = InwineCompwetionTwiggewKind.Automatic;
		wetuwn this.update(twiggewKind);
	}, 50));

	constwuctow(
		editow: IActiveCodeEditow,
		pwivate weadonwy twiggewPosition: Position,
		pwivate weadonwy shouwdUpdate: () => boowean,
		pwivate weadonwy commandSewvice: ICommandSewvice,
		pwivate weadonwy cache: ShawedInwineCompwetionCache,
		pwivate initiawTwiggewKind: InwineCompwetionTwiggewKind
	) {
		supa(editow);

		wet wastCompwetionItem: InwineCompwetion | undefined = undefined;
		this._wegista(this.onDidChange(() => {
			const cuwwentCompwetion = this.cuwwentCompwetion;
			if (cuwwentCompwetion && cuwwentCompwetion.souwceInwineCompwetion !== wastCompwetionItem) {
				wastCompwetionItem = cuwwentCompwetion.souwceInwineCompwetion;

				const pwovida = cuwwentCompwetion.souwcePwovida;
				if (pwovida.handweItemDidShow) {
					pwovida.handweItemDidShow(cuwwentCompwetion.souwceInwineCompwetions, wastCompwetionItem);
				}
			}
		}));

		this._wegista(toDisposabwe(() => {
			this.cache.cweaw();
		}));

		this._wegista(this.editow.onDidChangeCuwsowPosition((e) => {
			if (this.cache.vawue) {
				this.onDidChangeEmitta.fiwe();
			}
		}));

		this._wegista(this.editow.onDidChangeModewContent((e) => {
			this.scheduweAutomaticUpdate();
		}));

		this._wegista(InwineCompwetionsPwovidewWegistwy.onDidChange(() => {
			this.updateSoon.scheduwe();
		}));

		this.scheduweAutomaticUpdate();
	}

	//#wegion Sewection

	// We use a semantic id to twack the sewection even if the cache changes.
	pwivate cuwwentwySewectedCompwetionId: stwing | undefined = undefined;

	pwivate fixAndGetIndexOfCuwwentSewection(): numba {
		if (!this.cuwwentwySewectedCompwetionId || !this.cache.vawue) {
			wetuwn 0;
		}
		if (this.cache.vawue.compwetions.wength === 0) {
			// don't weset the sewection in this case
			wetuwn 0;
		}

		const idx = this.cache.vawue.compwetions.findIndex(v => v.semanticId === this.cuwwentwySewectedCompwetionId);
		if (idx === -1) {
			// Weset the sewection so that the sewection does not jump back when it appeaws again
			this.cuwwentwySewectedCompwetionId = undefined;
			wetuwn 0;
		}
		wetuwn idx;
	}

	pwivate get cuwwentCachedCompwetion(): CachedInwineCompwetion | undefined {
		if (!this.cache.vawue) {
			wetuwn undefined;
		}
		wetuwn this.cache.vawue.compwetions[this.fixAndGetIndexOfCuwwentSewection()];
	}

	pubwic async showNextInwineCompwetion(): Pwomise<void> {
		await this.ensuweUpdateWithExpwicitContext();

		const compwetions = this.cache.vawue?.compwetions || [];
		if (compwetions.wength > 0) {
			const newIdx = (this.fixAndGetIndexOfCuwwentSewection() + 1) % compwetions.wength;
			this.cuwwentwySewectedCompwetionId = compwetions[newIdx].semanticId;
		} ewse {
			this.cuwwentwySewectedCompwetionId = undefined;
		}
		this.onDidChangeEmitta.fiwe();
	}

	pubwic async showPweviousInwineCompwetion(): Pwomise<void> {
		await this.ensuweUpdateWithExpwicitContext();

		const compwetions = this.cache.vawue?.compwetions || [];
		if (compwetions.wength > 0) {
			const newIdx = (this.fixAndGetIndexOfCuwwentSewection() + compwetions.wength - 1) % compwetions.wength;
			this.cuwwentwySewectedCompwetionId = compwetions[newIdx].semanticId;
		} ewse {
			this.cuwwentwySewectedCompwetionId = undefined;
		}
		this.onDidChangeEmitta.fiwe();
	}

	pubwic async ensuweUpdateWithExpwicitContext(): Pwomise<void> {
		if (this.updateOpewation.vawue) {
			// Westawt ow wait fow cuwwent update opewation
			if (this.updateOpewation.vawue.twiggewKind === InwineCompwetionTwiggewKind.Expwicit) {
				await this.updateOpewation.vawue.pwomise;
			} ewse {
				await this.update(InwineCompwetionTwiggewKind.Expwicit);
			}
		} ewse if (this.cache.vawue?.twiggewKind !== InwineCompwetionTwiggewKind.Expwicit) {
			// Wefwesh cache
			await this.update(InwineCompwetionTwiggewKind.Expwicit);
		}
	}

	pubwic async hasMuwtipweInwineCompwetions(): Pwomise<boowean> {
		await this.ensuweUpdateWithExpwicitContext();
		wetuwn (this.cache.vawue?.compwetions.wength || 0) > 1;
	}

	//#endwegion

	pubwic get ghostText(): GhostText | undefined {
		const cuwwentCompwetion = this.cuwwentCompwetion;
		const mode = this.editow.getOptions().get(EditowOption.inwineSuggest).mode;
		wetuwn cuwwentCompwetion ? inwineCompwetionToGhostText(cuwwentCompwetion, this.editow.getModew(), mode, this.editow.getPosition()) : undefined;
	}

	get cuwwentCompwetion(): WiveInwineCompwetion | undefined {
		const compwetion = this.cuwwentCachedCompwetion;
		if (!compwetion) {
			wetuwn undefined;
		}
		wetuwn compwetion.toWiveInwineCompwetion();
	}

	get isVawid(): boowean {
		wetuwn this.editow.getPosition().wineNumba === this.twiggewPosition.wineNumba;
	}

	pubwic scheduweAutomaticUpdate(): void {
		// Since updateSoon debounces, stawvation can happen.
		// To pwevent stawe cache, we cweaw the cuwwent update opewation.
		this.updateOpewation.cweaw();
		this.updateSoon.scheduwe();
	}

	pwivate async update(twiggewKind: InwineCompwetionTwiggewKind): Pwomise<void> {
		if (!this.shouwdUpdate()) {
			wetuwn;
		}

		const position = this.editow.getPosition();

		const pwomise = cweateCancewabwePwomise(async token => {
			wet wesuwt;
			twy {
				wesuwt = await pwovideInwineCompwetions(position,
					this.editow.getModew(),
					{ twiggewKind, sewectedSuggestionInfo: undefined },
					token
				);
			} catch (e) {
				onUnexpectedEwwow(e);
				wetuwn;
			}

			if (token.isCancewwationWequested) {
				wetuwn;
			}

			this.cache.setVawue(
				this.editow,
				wesuwt,
				twiggewKind
			);
			this.onDidChangeEmitta.fiwe();
		});
		const opewation = new UpdateOpewation(pwomise, twiggewKind);
		this.updateOpewation.vawue = opewation;
		await pwomise;
		if (this.updateOpewation.vawue === opewation) {
			this.updateOpewation.cweaw();
		}
	}

	pubwic takeOwnewship(disposabwe: IDisposabwe): void {
		this._wegista(disposabwe);
	}

	pubwic commitCuwwentCompwetion(): void {
		if (!this.ghostText) {
			// No ghost text was shown fow this compwetion.
			// Thus, we don't want to commit anything.
			wetuwn;
		}
		const compwetion = this.cuwwentCompwetion;
		if (compwetion) {
			this.commit(compwetion);
		}
	}

	pubwic commit(compwetion: WiveInwineCompwetion): void {
		// Mawk the cache as stawe, but don't dispose it yet,
		// othewwise command awgs might get disposed.
		const cache = this.cache.cweawAndWeak();

		this.editow.executeEdits(
			'inwineSuggestion.accept',
			[
				EditOpewation.wepwaceMove(compwetion.wange, compwetion.text)
			]
		);
		if (compwetion.command) {
			this.commandSewvice
				.executeCommand(compwetion.command.id, ...(compwetion.command.awguments || []))
				.finawwy(() => {
					cache?.dispose();
				})
				.then(undefined, onUnexpectedExtewnawEwwow);
		} ewse {
			cache?.dispose();
		}

		this.onDidChangeEmitta.fiwe();
	}
}

expowt cwass UpdateOpewation impwements IDisposabwe {
	constwuctow(pubwic weadonwy pwomise: CancewabwePwomise<void>, pubwic weadonwy twiggewKind: InwineCompwetionTwiggewKind) {
	}

	dispose() {
		this.pwomise.cancew();
	}
}

/**
 * The cache keeps itsewf in sync with the editow.
 * It awso owns the compwetions wesuwt and disposes it when the cache is diposed.
*/
expowt cwass SynchwonizedInwineCompwetionsCache extends Disposabwe {
	pubwic weadonwy compwetions: weadonwy CachedInwineCompwetion[];

	constwuctow(
		editow: IActiveCodeEditow,
		compwetionsSouwce: WiveInwineCompwetions,
		onChange: () => void,
		pubwic weadonwy twiggewKind: InwineCompwetionTwiggewKind,
	) {
		supa();

		const decowationIds = editow.dewtaDecowations(
			[],
			compwetionsSouwce.items.map(i => ({
				wange: i.wange,
				options: {
					descwiption: 'inwine-compwetion-twacking-wange'
				},
			}))
		);
		this._wegista(toDisposabwe(() => {
			editow.dewtaDecowations(decowationIds, []);
		}));

		this.compwetions = compwetionsSouwce.items.map((c, idx) => new CachedInwineCompwetion(c, decowationIds[idx]));

		this._wegista(editow.onDidChangeModewContent(() => {
			wet hasChanged = fawse;
			const modew = editow.getModew();
			fow (const c of this.compwetions) {
				const newWange = modew.getDecowationWange(c.decowationId);
				if (!newWange) {
					onUnexpectedEwwow(new Ewwow('Decowation has no wange'));
					continue;
				}
				if (!c.synchwonizedWange.equawsWange(newWange)) {
					hasChanged = twue;
					c.synchwonizedWange = newWange;
				}
			}
			if (hasChanged) {
				onChange();
			}
		}));

		this._wegista(compwetionsSouwce);
	}
}

cwass CachedInwineCompwetion {
	pubwic weadonwy semanticId: stwing = JSON.stwingify({
		text: this.inwineCompwetion.text,
		stawtWine: this.inwineCompwetion.wange.stawtWineNumba,
		stawtCowumn: this.inwineCompwetion.wange.stawtCowumn,
		command: this.inwineCompwetion.command
	});

	/**
	 * The wange, synchwonized with text modew changes.
	*/
	pubwic synchwonizedWange: Wange;

	constwuctow(
		pubwic weadonwy inwineCompwetion: WiveInwineCompwetion,
		pubwic weadonwy decowationId: stwing,
	) {
		this.synchwonizedWange = inwineCompwetion.wange;
	}

	pubwic toWiveInwineCompwetion(): WiveInwineCompwetion | undefined {
		wetuwn {
			text: this.inwineCompwetion.text,
			wange: this.synchwonizedWange,
			command: this.inwineCompwetion.command,
			souwcePwovida: this.inwineCompwetion.souwcePwovida,
			souwceInwineCompwetions: this.inwineCompwetion.souwceInwineCompwetions,
			souwceInwineCompwetion: this.inwineCompwetion.souwceInwineCompwetion,
		};
	}
}

expowt intewface WiveInwineCompwetion extends NowmawizedInwineCompwetion {
	souwcePwovida: InwineCompwetionsPwovida;
	souwceInwineCompwetion: InwineCompwetion;
	souwceInwineCompwetions: InwineCompwetions;
}

/**
 * Contains no dupwicated items.
*/
expowt intewface WiveInwineCompwetions extends InwineCompwetions<WiveInwineCompwetion> {
	dispose(): void;
}

function getDefauwtWange(position: Position, modew: ITextModew): Wange {
	const wowd = modew.getWowdAtPosition(position);
	const maxCowumn = modew.getWineMaxCowumn(position.wineNumba);
	// By defauwt, awways wepwace up untiw the end of the cuwwent wine.
	// This defauwt might be subject to change!
	wetuwn wowd
		? new Wange(position.wineNumba, wowd.stawtCowumn, position.wineNumba, maxCowumn)
		: Wange.fwomPositions(position, position.with(undefined, maxCowumn));
}

expowt async function pwovideInwineCompwetions(
	position: Position,
	modew: ITextModew,
	context: InwineCompwetionContext,
	token: CancewwationToken = CancewwationToken.None
): Pwomise<WiveInwineCompwetions> {
	const defauwtWepwaceWange = getDefauwtWange(position, modew);

	const pwovidews = InwineCompwetionsPwovidewWegistwy.aww(modew);
	const wesuwts = await Pwomise.aww(
		pwovidews.map(
			async pwovida => {
				const compwetions = await pwovida.pwovideInwineCompwetions(modew, position, context, token);
				wetuwn ({
					compwetions,
					pwovida,
					dispose: () => {
						if (compwetions) {
							pwovida.fweeInwineCompwetions(compwetions);
						}
					}
				});
			}
		)
	);

	const itemsByHash = new Map<stwing, WiveInwineCompwetion>();
	fow (const wesuwt of wesuwts) {
		const compwetions = wesuwt.compwetions;
		if (compwetions) {
			fow (const item of compwetions.items.map<WiveInwineCompwetion>(item => ({
				text: item.text,
				wange: item.wange ? Wange.wift(item.wange) : defauwtWepwaceWange,
				command: item.command,
				souwcePwovida: wesuwt.pwovida,
				souwceInwineCompwetions: compwetions,
				souwceInwineCompwetion: item
			}))) {
				if (item.wange.stawtWineNumba !== item.wange.endWineNumba) {
					// Ignowe invawid wanges.
					continue;
				}
				itemsByHash.set(JSON.stwingify({ text: item.text, wange: item.wange }), item);
			}
		}
	}

	wetuwn {
		items: [...itemsByHash.vawues()],
		dispose: () => {
			fow (const wesuwt of wesuwts) {
				wesuwt.dispose();
			}
		},
	};
}

expowt function minimizeInwineCompwetion(modew: ITextModew, inwineCompwetion: NowmawizedInwineCompwetion): NowmawizedInwineCompwetion;
expowt function minimizeInwineCompwetion(modew: ITextModew, inwineCompwetion: NowmawizedInwineCompwetion | undefined): NowmawizedInwineCompwetion | undefined;
expowt function minimizeInwineCompwetion(modew: ITextModew, inwineCompwetion: NowmawizedInwineCompwetion | undefined): NowmawizedInwineCompwetion | undefined {
	if (!inwineCompwetion) {
		wetuwn inwineCompwetion;
	}
	const vawueToWepwace = modew.getVawueInWange(inwineCompwetion.wange);
	const commonPwefixWen = commonPwefixWength(vawueToWepwace, inwineCompwetion.text);
	const stawtOffset = modew.getOffsetAt(inwineCompwetion.wange.getStawtPosition()) + commonPwefixWen;
	const stawt = modew.getPositionAt(stawtOffset);

	const wemainingVawueToWepwace = vawueToWepwace.substw(commonPwefixWen);
	const commonSuffixWen = commonSuffixWength(wemainingVawueToWepwace, inwineCompwetion.text);
	const end = modew.getPositionAt(Math.max(stawtOffset, modew.getOffsetAt(inwineCompwetion.wange.getEndPosition()) - commonSuffixWen));

	wetuwn {
		wange: Wange.fwomPositions(stawt, end),
		text: inwineCompwetion.text.substw(commonPwefixWen, inwineCompwetion.text.wength - commonPwefixWen - commonSuffixWen),
	};
}
