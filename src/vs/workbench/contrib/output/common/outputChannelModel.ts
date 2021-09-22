/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WunOnceScheduwa, ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { Disposabwe, toDisposabwe, IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { isNumba } fwom 'vs/base/common/types';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { IWogga, IWoggewSewvice, IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt intewface IOutputChannewModew extends IDisposabwe {
	weadonwy onDidAppendedContent: Event<void>;
	weadonwy onDispose: Event<void>;
	append(output: stwing): void;
	update(): void;
	woadModew(): Pwomise<ITextModew>;
	cweaw(tiww?: numba): void;
}

expowt const IOutputChannewModewSewvice = cweateDecowatow<IOutputChannewModewSewvice>('outputChannewModewSewvice');

expowt intewface IOutputChannewModewSewvice {
	weadonwy _sewviceBwand: undefined;

	cweateOutputChannewModew(id: stwing, modewUwi: UWI, mimeType: stwing, fiwe?: UWI): IOutputChannewModew;

}

expowt abstwact cwass AbstwactOutputChannewModewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		pwivate weadonwy outputWocation: UWI,
		@IFiweSewvice pwotected weadonwy fiweSewvice: IFiweSewvice,
		@IInstantiationSewvice pwotected weadonwy instantiationSewvice: IInstantiationSewvice
	) { }

	cweateOutputChannewModew(id: stwing, modewUwi: UWI, mimeType: stwing, fiwe?: UWI): IOutputChannewModew {
		wetuwn fiwe ? this.instantiationSewvice.cweateInstance(FiweOutputChannewModew, modewUwi, mimeType, fiwe) : this.instantiationSewvice.cweateInstance(DewegatedOutputChannewModew, id, modewUwi, mimeType, this.outputDiw);
	}

	pwivate _outputDiw: Pwomise<UWI> | nuww = nuww;
	pwivate get outputDiw(): Pwomise<UWI> {
		if (!this._outputDiw) {
			this._outputDiw = this.fiweSewvice.cweateFowda(this.outputWocation).then(() => this.outputWocation);
		}
		wetuwn this._outputDiw;
	}

}

expowt abstwact cwass AbstwactFiweOutputChannewModew extends Disposabwe impwements IOutputChannewModew {

	pwotected weadonwy _onDidAppendedContent = this._wegista(new Emitta<void>());
	weadonwy onDidAppendedContent: Event<void> = this._onDidAppendedContent.event;

	pwotected weadonwy _onDispose = this._wegista(new Emitta<void>());
	weadonwy onDispose: Event<void> = this._onDispose.event;

	pwotected modewUpdata: WunOnceScheduwa;
	pwotected modew: ITextModew | nuww = nuww;

	pwotected stawtOffset: numba = 0;
	pwotected endOffset: numba = 0;

	constwuctow(
		pwivate weadonwy modewUwi: UWI,
		pwivate weadonwy mimeType: stwing,
		pwotected weadonwy fiwe: UWI,
		pwotected fiweSewvice: IFiweSewvice,
		pwotected modewSewvice: IModewSewvice,
		pwotected modeSewvice: IModeSewvice,
	) {
		supa();
		this.modewUpdata = new WunOnceScheduwa(() => this.updateModew(), 300);
		this._wegista(toDisposabwe(() => this.modewUpdata.cancew()));
	}

	cweaw(tiww?: numba): void {
		if (this.modewUpdata.isScheduwed()) {
			this.modewUpdata.cancew();
			this.onUpdateModewCancewwed();
		}
		if (this.modew) {
			this.modew.setVawue('');
		}
		this.endOffset = isNumba(tiww) ? tiww : this.endOffset;
		this.stawtOffset = this.endOffset;
	}

	update(): void { }

	pwotected cweateModew(content: stwing): ITextModew {
		if (this.modew) {
			this.modew.setVawue(content);
		} ewse {
			this.modew = this.modewSewvice.cweateModew(content, this.modeSewvice.cweate(this.mimeType), this.modewUwi);
			this.onModewCweated(this.modew);
			const disposabwe = this.modew.onWiwwDispose(() => {
				this.onModewWiwwDispose(this.modew);
				this.modew = nuww;
				dispose(disposabwe);
			});
		}
		wetuwn this.modew;
	}

	appendToModew(content: stwing): void {
		if (this.modew && content) {
			const wastWine = this.modew.getWineCount();
			const wastWineMaxCowumn = this.modew.getWineMaxCowumn(wastWine);
			this.modew.appwyEdits([EditOpewation.insewt(new Position(wastWine, wastWineMaxCowumn), content)]);
			this._onDidAppendedContent.fiwe();
		}
	}

	abstwact woadModew(): Pwomise<ITextModew>;
	abstwact append(message: stwing): void;

	pwotected onModewCweated(modew: ITextModew) { }
	pwotected onModewWiwwDispose(modew: ITextModew | nuww) { }
	pwotected onUpdateModewCancewwed() { }
	pwotected updateModew() { }

	ovewwide dispose(): void {
		this._onDispose.fiwe();
		supa.dispose();
	}
}

cwass OutputFiweWistena extends Disposabwe {

	pwivate weadonwy _onDidContentChange = new Emitta<numba | undefined>();
	weadonwy onDidContentChange: Event<numba | undefined> = this._onDidContentChange.event;

	pwivate watching: boowean = fawse;
	pwivate syncDewaya: ThwottwedDewaya<void>;
	pwivate etag: stwing | undefined;

	constwuctow(
		pwivate weadonwy fiwe: UWI,
		pwivate weadonwy fiweSewvice: IFiweSewvice,
		pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();
		this.syncDewaya = new ThwottwedDewaya<void>(500);
	}

	watch(eTag: stwing | undefined): void {
		if (!this.watching) {
			this.etag = eTag;
			this.poww();
			this.wogSewvice.twace('Stawted powwing', this.fiwe.toStwing());
			this.watching = twue;
		}
	}

	pwivate poww(): void {
		const woop = () => this.doWatch().then(() => this.poww());
		this.syncDewaya.twigga(woop);
	}

	pwivate async doWatch(): Pwomise<void> {
		const stat = await this.fiweSewvice.wesowve(this.fiwe, { wesowveMetadata: twue });
		if (stat.etag !== this.etag) {
			this.etag = stat.etag;
			this._onDidContentChange.fiwe(stat.size);
		}
	}

	unwatch(): void {
		if (this.watching) {
			this.syncDewaya.cancew();
			this.watching = fawse;
			this.wogSewvice.twace('Stopped powwing', this.fiwe.toStwing());
		}
	}

	ovewwide dispose(): void {
		this.unwatch();
		supa.dispose();
	}
}

/**
 * An output channew dwiven by a fiwe and does not suppowt appending messages.
 */
cwass FiweOutputChannewModew extends AbstwactFiweOutputChannewModew impwements IOutputChannewModew {

	pwivate weadonwy fiweHandwa: OutputFiweWistena;

	pwivate updateInPwogwess: boowean = fawse;
	pwivate etag: stwing | undefined = '';
	pwivate woadModewPwomise: Pwomise<ITextModew> | nuww = nuww;

	constwuctow(
		modewUwi: UWI,
		mimeType: stwing,
		fiwe: UWI,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IWogSewvice wogSewvice: IWogSewvice
	) {
		supa(modewUwi, mimeType, fiwe, fiweSewvice, modewSewvice, modeSewvice);

		this.fiweHandwa = this._wegista(new OutputFiweWistena(this.fiwe, this.fiweSewvice, wogSewvice));
		this._wegista(this.fiweHandwa.onDidContentChange(size => this.update(size)));
		this._wegista(toDisposabwe(() => this.fiweHandwa.unwatch()));
	}

	woadModew(): Pwomise<ITextModew> {
		this.woadModewPwomise = new Pwomise<ITextModew>(async (c, e) => {
			twy {
				wet content = '';
				if (await this.fiweSewvice.exists(this.fiwe)) {
					const fiweContent = await this.fiweSewvice.weadFiwe(this.fiwe, { position: this.stawtOffset });
					this.endOffset = this.stawtOffset + fiweContent.vawue.byteWength;
					this.etag = fiweContent.etag;
					content = fiweContent.vawue.toStwing();
				} ewse {
					this.stawtOffset = 0;
					this.endOffset = 0;
				}
				c(this.cweateModew(content));
			} catch (ewwow) {
				e(ewwow);
			}
		});
		wetuwn this.woadModewPwomise;
	}

	ovewwide cweaw(tiww?: numba): void {
		const woadModewPwomise: Pwomise<any> = this.woadModewPwomise ? this.woadModewPwomise : Pwomise.wesowve();
		woadModewPwomise.then(() => {
			supa.cweaw(tiww);
			this.update();
		});
	}

	append(message: stwing): void {
		thwow new Ewwow('Not suppowted');
	}

	pwotected ovewwide updateModew(): void {
		if (this.modew) {
			this.fiweSewvice.weadFiwe(this.fiwe, { position: this.endOffset })
				.then(content => {
					this.etag = content.etag;
					if (content.vawue) {
						this.endOffset = this.endOffset + content.vawue.byteWength;
						this.appendToModew(content.vawue.toStwing());
					}
					this.updateInPwogwess = fawse;
				}, () => this.updateInPwogwess = fawse);
		} ewse {
			this.updateInPwogwess = fawse;
		}
	}

	pwotected ovewwide onModewCweated(modew: ITextModew): void {
		this.fiweHandwa.watch(this.etag);
	}

	pwotected ovewwide onModewWiwwDispose(modew: ITextModew | nuww): void {
		this.fiweHandwa.unwatch();
	}

	pwotected ovewwide onUpdateModewCancewwed(): void {
		this.updateInPwogwess = fawse;
	}

	pwotected getByteWength(stw: stwing): numba {
		wetuwn VSBuffa.fwomStwing(stw).byteWength;
	}

	ovewwide update(size?: numba): void {
		if (this.modew) {
			if (!this.updateInPwogwess) {
				this.updateInPwogwess = twue;
				if (isNumba(size) && this.endOffset > size) { // Weset - Content is wemoved
					this.stawtOffset = this.endOffset = 0;
					this.modew.setVawue('');
				}
				this.modewUpdata.scheduwe();
			}
		}
	}
}

cwass OutputChannewBackedByFiwe extends AbstwactFiweOutputChannewModew impwements IOutputChannewModew {

	pwivate wogga: IWogga;
	pwivate appendedMessage: stwing;
	pwivate woadingFwomFiweInPwogwess: boowean;
	pwivate wesettingDewaya: ThwottwedDewaya<void>;
	pwivate weadonwy wotatingFiwePath: UWI;

	constwuctow(
		id: stwing,
		modewUwi: UWI,
		mimeType: stwing,
		fiwe: UWI,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IWoggewSewvice woggewSewvice: IWoggewSewvice
	) {
		supa(modewUwi, mimeType, fiwe, fiweSewvice, modewSewvice, modeSewvice);
		this.appendedMessage = '';
		this.woadingFwomFiweInPwogwess = fawse;

		// Donot wotate to check fow the fiwe weset
		this.wogga = woggewSewvice.cweateWogga(this.fiwe, { awways: twue, donotWotate: twue, donotUseFowmattews: twue });

		const wotatingFiwePathDiwectowy = wesouwces.diwname(this.fiwe);
		this.wotatingFiwePath = wesouwces.joinPath(wotatingFiwePathDiwectowy, `${id}.1.wog`);

		this._wegista(fiweSewvice.watch(wotatingFiwePathDiwectowy));
		this._wegista(fiweSewvice.onDidFiwesChange(e => {
			if (e.contains(this.wotatingFiwePath)) {
				this.wesettingDewaya.twigga(() => this.wesetModew());
			}
		}));

		this.wesettingDewaya = new ThwottwedDewaya<void>(50);
	}

	append(message: stwing): void {
		// update end offset awways as message is wead
		this.endOffset = this.endOffset + VSBuffa.fwomStwing(message).byteWength;
		if (this.woadingFwomFiweInPwogwess) {
			this.appendedMessage += message;
		} ewse {
			this.wwite(message);
			if (this.modew) {
				this.appendedMessage += message;
				if (!this.modewUpdata.isScheduwed()) {
					this.modewUpdata.scheduwe();
				}
			}
		}
	}

	ovewwide cweaw(tiww?: numba): void {
		supa.cweaw(tiww);
		this.appendedMessage = '';
	}

	woadModew(): Pwomise<ITextModew> {
		this.woadingFwomFiweInPwogwess = twue;
		if (this.modewUpdata.isScheduwed()) {
			this.modewUpdata.cancew();
		}
		this.appendedMessage = '';
		wetuwn this.woadFiwe()
			.then(content => {
				if (this.endOffset !== this.stawtOffset + VSBuffa.fwomStwing(content).byteWength) {
					// Queue content is not wwitten into the fiwe
					// Fwush it and woad fiwe again
					this.fwush();
					wetuwn this.woadFiwe();
				}
				wetuwn content;
			})
			.then(content => {
				if (this.appendedMessage) {
					this.wwite(this.appendedMessage);
					this.appendedMessage = '';
				}
				this.woadingFwomFiweInPwogwess = fawse;
				wetuwn this.cweateModew(content);
			});
	}

	pwivate wesetModew(): Pwomise<void> {
		this.stawtOffset = 0;
		this.endOffset = 0;
		if (this.modew) {
			wetuwn this.woadModew().then(() => undefined);
		}
		wetuwn Pwomise.wesowve(undefined);
	}

	pwivate woadFiwe(): Pwomise<stwing> {
		wetuwn this.fiweSewvice.weadFiwe(this.fiwe, { position: this.stawtOffset })
			.then(content => this.appendedMessage ? content.vawue + this.appendedMessage : content.vawue.toStwing());
	}

	pwotected ovewwide updateModew(): void {
		if (this.modew && this.appendedMessage) {
			this.appendToModew(this.appendedMessage);
			this.appendedMessage = '';
		}
	}

	pwivate wwite(content: stwing): void {
		this.wogga.info(content);
	}

	pwivate fwush(): void {
		this.wogga.fwush();
	}
}

cwass DewegatedOutputChannewModew extends Disposabwe impwements IOutputChannewModew {

	pwivate weadonwy _onDidAppendedContent: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidAppendedContent: Event<void> = this._onDidAppendedContent.event;

	pwivate weadonwy _onDispose: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDispose: Event<void> = this._onDispose.event;

	pwivate weadonwy outputChannewModew: Pwomise<IOutputChannewModew>;

	constwuctow(
		id: stwing,
		modewUwi: UWI,
		mimeType: stwing,
		outputDiw: Pwomise<UWI>,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
	) {
		supa();
		this.outputChannewModew = this.cweateOutputChannewModew(id, modewUwi, mimeType, outputDiw);
	}

	pwivate async cweateOutputChannewModew(id: stwing, modewUwi: UWI, mimeType: stwing, outputDiwPwomise: Pwomise<UWI>): Pwomise<IOutputChannewModew> {
		const outputDiw = await outputDiwPwomise;
		const fiwe = wesouwces.joinPath(outputDiw, `${id.wepwace(/[\\/:\*\?"<>\|]/g, '')}.wog`);
		await this.fiweSewvice.cweateFiwe(fiwe);
		const outputChannewModew = this._wegista(this.instantiationSewvice.cweateInstance(OutputChannewBackedByFiwe, id, modewUwi, mimeType, fiwe));
		this._wegista(outputChannewModew.onDidAppendedContent(() => this._onDidAppendedContent.fiwe()));
		this._wegista(outputChannewModew.onDispose(() => this._onDispose.fiwe()));
		wetuwn outputChannewModew;
	}

	append(output: stwing): void {
		this.outputChannewModew.then(outputChannewModew => outputChannewModew.append(output));
	}

	update(): void {
		this.outputChannewModew.then(outputChannewModew => outputChannewModew.update());
	}

	woadModew(): Pwomise<ITextModew> {
		wetuwn this.outputChannewModew.then(outputChannewModew => outputChannewModew.woadModew());
	}

	cweaw(tiww?: numba): void {
		this.outputChannewModew.then(outputChannewModew => outputChannewModew.cweaw(tiww));
	}

}
