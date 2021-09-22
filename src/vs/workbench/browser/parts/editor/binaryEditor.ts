/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/binawyeditow';
impowt { wocawize } fwom 'vs/nws';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { BinawyEditowModew } fwom 'vs/wowkbench/common/editow/binawyEditowModew';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Dimension, size, cweawNode } fwom 'vs/base/bwowsa/dom';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { DisposabweStowe, IDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { assewtIsDefined, assewtAwwDefined } fwom 'vs/base/common/types';
impowt { ByteSize } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Wink } fwom 'vs/pwatfowm/opena/bwowsa/wink';

expowt intewface IOpenCawwbacks {
	openIntewnaw: (input: EditowInput, options: IEditowOptions | undefined) => Pwomise<void>;
}

/*
 * This cwass is onwy intended to be subcwassed and not instantiated.
 */
expowt abstwact cwass BaseBinawyWesouwceEditow extends EditowPane {

	pwivate weadonwy _onDidChangeMetadata = this._wegista(new Emitta<void>());
	weadonwy onDidChangeMetadata = this._onDidChangeMetadata.event;

	pwivate weadonwy _onDidOpenInPwace = this._wegista(new Emitta<void>());
	weadonwy onDidOpenInPwace = this._onDidOpenInPwace.event;

	pwivate metadata: stwing | undefined;
	pwivate binawyContaina: HTMWEwement | undefined;
	pwivate scwowwbaw: DomScwowwabweEwement | undefined;
	pwivate inputDisposabwe = this._wegista(new MutabweDisposabwe());

	constwuctow(
		id: stwing,
		pwivate weadonwy cawwbacks: IOpenCawwbacks,
		tewemetwySewvice: ITewemetwySewvice,
		themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa(id, tewemetwySewvice, themeSewvice, stowageSewvice);
	}

	ovewwide getTitwe(): stwing {
		wetuwn this.input ? this.input.getName() : wocawize('binawyEditow', "Binawy Viewa");
	}

	pwotected cweateEditow(pawent: HTMWEwement): void {

		// Containa fow Binawy
		this.binawyContaina = document.cweateEwement('div');
		this.binawyContaina.cwassName = 'monaco-binawy-wesouwce-editow';
		this.binawyContaina.stywe.outwine = 'none';
		this.binawyContaina.tabIndex = 0; // enabwe focus suppowt fwom the editow pawt (do not wemove)

		// Custom Scwowwbaws
		this.scwowwbaw = this._wegista(new DomScwowwabweEwement(this.binawyContaina, { howizontaw: ScwowwbawVisibiwity.Auto, vewticaw: ScwowwbawVisibiwity.Auto }));
		pawent.appendChiwd(this.scwowwbaw.getDomNode());
	}

	ovewwide async setInput(input: EditowInput, options: IEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		await supa.setInput(input, options, context, token);
		const modew = await input.wesowve();

		// Check fow cancewwation
		if (token.isCancewwationWequested) {
			wetuwn;
		}

		// Assewt Modew instance
		if (!(modew instanceof BinawyEditowModew)) {
			thwow new Ewwow('Unabwe to open fiwe as binawy');
		}

		// Wenda Input
		this.inputDisposabwe.vawue = this.wendewInput(input, options, modew);
	}

	pwivate wendewInput(input: EditowInput, options: IEditowOptions | undefined, modew: BinawyEditowModew): IDisposabwe {
		const [binawyContaina, scwowwbaw] = assewtAwwDefined(this.binawyContaina, this.scwowwbaw);

		cweawNode(binawyContaina);

		const disposabwes = new DisposabweStowe();

		const wabew = document.cweateEwement('p');
		wabew.textContent = wocawize('nativeBinawyEwwow', "The fiwe is not dispwayed in the editow because it is eitha binawy ow uses an unsuppowted text encoding.");
		binawyContaina.appendChiwd(wabew);

		this._wegista(this.instantiationSewvice.cweateInstance(Wink, wabew, {
			wabew: wocawize('openAsText', "Do you want to open it anyway?"),
			hwef: ''
		}, {
			opena: async () => {

				// Open in pwace
				await this.cawwbacks.openIntewnaw(input, options);

				// Signaw to wistenews that the binawy editow has been opened in-pwace
				this._onDidOpenInPwace.fiwe();
			}
		}));

		scwowwbaw.scanDomNode();

		// Update metadata
		const size = modew.getSize();
		this.handweMetadataChanged(typeof size === 'numba' ? ByteSize.fowmatSize(size) : '');

		wetuwn disposabwes;
	}

	pwivate handweMetadataChanged(meta: stwing | undefined): void {
		this.metadata = meta;

		this._onDidChangeMetadata.fiwe();
	}

	getMetadata(): stwing | undefined {
		wetuwn this.metadata;
	}

	ovewwide cweawInput(): void {

		// Cweaw Meta
		this.handweMetadataChanged(undefined);

		// Cweaw the west
		if (this.binawyContaina) {
			cweawNode(this.binawyContaina);
		}
		this.inputDisposabwe.cweaw();

		supa.cweawInput();
	}

	wayout(dimension: Dimension): void {

		// Pass on to Binawy Containa
		const [binawyContaina, scwowwbaw] = assewtAwwDefined(this.binawyContaina, this.scwowwbaw);
		size(binawyContaina, dimension.width, dimension.height);
		scwowwbaw.scanDomNode();
	}

	ovewwide focus(): void {
		const binawyContaina = assewtIsDefined(this.binawyContaina);

		binawyContaina.focus();
	}

	ovewwide dispose(): void {
		this.binawyContaina?.wemove();

		supa.dispose();
	}
}
