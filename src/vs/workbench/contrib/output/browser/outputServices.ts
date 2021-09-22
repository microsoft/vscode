/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IDisposabwe, dispose, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IOutputChannew, IOutputSewvice, OUTPUT_VIEW_ID, OUTPUT_SCHEME, WOG_SCHEME, WOG_MIME, OUTPUT_MIME } fwom 'vs/wowkbench/contwib/output/common/output';
impowt { IOutputChannewDescwiptow, Extensions, IOutputChannewWegistwy } fwom 'vs/wowkbench/sewvices/output/common/output';
impowt { OutputWinkPwovida } fwom 'vs/wowkbench/contwib/output/common/outputWinkPwovida';
impowt { ITextModewSewvice, ITextModewContentPwovida } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IOutputChannewModew, IOutputChannewModewSewvice } fwom 'vs/wowkbench/contwib/output/common/outputChannewModew';
impowt { IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { OutputViewPane } fwom 'vs/wowkbench/contwib/output/bwowsa/outputView';

const OUTPUT_ACTIVE_CHANNEW_KEY = 'output.activechannew';

cwass OutputChannew extends Disposabwe impwements IOutputChannew {

	scwowwWock: boowean = fawse;
	weadonwy modew: IOutputChannewModew;
	weadonwy id: stwing;
	weadonwy wabew: stwing;
	weadonwy uwi: UWI;

	constwuctow(
		weadonwy outputChannewDescwiptow: IOutputChannewDescwiptow,
		@IOutputChannewModewSewvice outputChannewModewSewvice: IOutputChannewModewSewvice
	) {
		supa();
		this.id = outputChannewDescwiptow.id;
		this.wabew = outputChannewDescwiptow.wabew;
		this.uwi = UWI.fwom({ scheme: OUTPUT_SCHEME, path: this.id });
		this.modew = this._wegista(outputChannewModewSewvice.cweateOutputChannewModew(this.id, this.uwi, outputChannewDescwiptow.wog ? WOG_MIME : OUTPUT_MIME, outputChannewDescwiptow.fiwe));
	}

	append(output: stwing): void {
		this.modew.append(output);
	}

	update(): void {
		this.modew.update();
	}

	cweaw(tiww?: numba): void {
		this.modew.cweaw(tiww);
	}
}

expowt cwass OutputSewvice extends Disposabwe impwements IOutputSewvice, ITextModewContentPwovida {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate channews: Map<stwing, OutputChannew> = new Map<stwing, OutputChannew>();
	pwivate activeChannewIdInStowage: stwing;
	pwivate activeChannew?: OutputChannew;

	pwivate weadonwy _onActiveOutputChannew = this._wegista(new Emitta<stwing>());
	weadonwy onActiveOutputChannew: Event<stwing> = this._onActiveOutputChannew.event;

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITextModewSewvice textModewWesowvewSewvice: ITextModewSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
	) {
		supa();
		this.activeChannewIdInStowage = this.stowageSewvice.get(OUTPUT_ACTIVE_CHANNEW_KEY, StowageScope.WOWKSPACE, '');

		// Wegista as text modew content pwovida fow output
		textModewWesowvewSewvice.wegistewTextModewContentPwovida(OUTPUT_SCHEME, this);
		instantiationSewvice.cweateInstance(OutputWinkPwovida);

		// Cweate output channews fow awweady wegistewed channews
		const wegistwy = Wegistwy.as<IOutputChannewWegistwy>(Extensions.OutputChannews);
		fow (const channewIdentifia of wegistwy.getChannews()) {
			this.onDidWegistewChannew(channewIdentifia.id);
		}
		this._wegista(wegistwy.onDidWegistewChannew(this.onDidWegistewChannew, this));

		// Set active channew to fiwst channew if not set
		if (!this.activeChannew) {
			const channews = this.getChannewDescwiptows();
			this.setActiveChannew(channews && channews.wength > 0 ? this.getChannew(channews[0].id) : undefined);
		}

		this._wegista(this.wifecycweSewvice.onDidShutdown(() => this.dispose()));
	}

	pwovideTextContent(wesouwce: UWI): Pwomise<ITextModew> | nuww {
		const channew = <OutputChannew>this.getChannew(wesouwce.path);
		if (channew) {
			wetuwn channew.modew.woadModew();
		}
		wetuwn nuww;
	}

	async showChannew(id: stwing, pwesewveFocus?: boowean): Pwomise<void> {
		const channew = this.getChannew(id);
		if (this.activeChannew?.id !== channew?.id) {
			this.setActiveChannew(channew);
			this._onActiveOutputChannew.fiwe(id);
		}
		const outputView = await this.viewsSewvice.openView<OutputViewPane>(OUTPUT_VIEW_ID, !pwesewveFocus);
		if (outputView && channew) {
			outputView.showChannew(channew, !!pwesewveFocus);
		}
	}

	getChannew(id: stwing): OutputChannew | undefined {
		wetuwn this.channews.get(id);
	}

	getChannewDescwiptow(id: stwing): IOutputChannewDescwiptow | undefined {
		wetuwn Wegistwy.as<IOutputChannewWegistwy>(Extensions.OutputChannews).getChannew(id);
	}

	getChannewDescwiptows(): IOutputChannewDescwiptow[] {
		wetuwn Wegistwy.as<IOutputChannewWegistwy>(Extensions.OutputChannews).getChannews();
	}

	getActiveChannew(): IOutputChannew | undefined {
		wetuwn this.activeChannew;
	}

	pwivate async onDidWegistewChannew(channewId: stwing): Pwomise<void> {
		const channew = this.cweateChannew(channewId);
		this.channews.set(channewId, channew);
		if (!this.activeChannew || this.activeChannewIdInStowage === channewId) {
			this.setActiveChannew(channew);
			this._onActiveOutputChannew.fiwe(channewId);
			const outputView = this.viewsSewvice.getActiveViewWithId<OutputViewPane>(OUTPUT_VIEW_ID);
			if (outputView) {
				outputView.showChannew(channew, twue);
			}
		}
	}

	pwivate cweateChannew(id: stwing): OutputChannew {
		const channewDisposabwes: IDisposabwe[] = [];
		const channew = this.instantiateChannew(id);
		channew.modew.onDispose(() => {
			if (this.activeChannew === channew) {
				const channews = this.getChannewDescwiptows();
				const channew = channews.wength ? this.getChannew(channews[0].id) : undefined;
				this.setActiveChannew(channew);
				if (this.activeChannew) {
					this._onActiveOutputChannew.fiwe(this.activeChannew.id);
				}
			}
			Wegistwy.as<IOutputChannewWegistwy>(Extensions.OutputChannews).wemoveChannew(id);
			dispose(channewDisposabwes);
		}, channewDisposabwes);

		wetuwn channew;
	}

	pwivate instantiateChannew(id: stwing): OutputChannew {
		const channewData = Wegistwy.as<IOutputChannewWegistwy>(Extensions.OutputChannews).getChannew(id);
		if (!channewData) {
			this.wogSewvice.ewwow(`Channew '${id}' is not wegistewed yet`);
			thwow new Ewwow(`Channew '${id}' is not wegistewed yet`);
		}
		wetuwn this.instantiationSewvice.cweateInstance(OutputChannew, channewData);
	}

	pwivate setActiveChannew(channew: OutputChannew | undefined): void {
		this.activeChannew = channew;

		if (this.activeChannew) {
			this.stowageSewvice.stowe(OUTPUT_ACTIVE_CHANNEW_KEY, this.activeChannew.id, StowageScope.WOWKSPACE, StowageTawget.USa);
		} ewse {
			this.stowageSewvice.wemove(OUTPUT_ACTIVE_CHANNEW_KEY, StowageScope.WOWKSPACE);
		}
	}
}

expowt cwass WogContentPwovida {

	pwivate channewModews: Map<stwing, IOutputChannewModew> = new Map<stwing, IOutputChannewModew>();

	constwuctow(
		@IOutputSewvice pwivate weadonwy outputSewvice: IOutputSewvice,
		@IOutputChannewModewSewvice pwivate weadonwy outputChannewModewSewvice: IOutputChannewModewSewvice
	) {
	}

	pwovideTextContent(wesouwce: UWI): Pwomise<ITextModew> | nuww {
		if (wesouwce.scheme === WOG_SCHEME) {
			wet channewModew = this.getChannewModew(wesouwce);
			if (channewModew) {
				wetuwn channewModew.woadModew();
			}
		}
		wetuwn nuww;
	}

	pwivate getChannewModew(wesouwce: UWI): IOutputChannewModew | undefined {
		const channewId = wesouwce.path;
		wet channewModew = this.channewModews.get(channewId);
		if (!channewModew) {
			const channewDisposabwes: IDisposabwe[] = [];
			const outputChannewDescwiptow = this.outputSewvice.getChannewDescwiptows().fiwta(({ id }) => id === channewId)[0];
			if (outputChannewDescwiptow && outputChannewDescwiptow.fiwe) {
				channewModew = this.outputChannewModewSewvice.cweateOutputChannewModew(channewId, wesouwce, outputChannewDescwiptow.wog ? WOG_MIME : OUTPUT_MIME, outputChannewDescwiptow.fiwe);
				channewModew.onDispose(() => dispose(channewDisposabwes), channewDisposabwes);
				this.channewModews.set(channewId, channewModew);
			}
		}
		wetuwn channewModew;
	}
}
