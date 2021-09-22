/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Vewbosity, IEditowInputWithPwefewwedWesouwce, EditowInputCapabiwities } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweSewvice, FiweSystemPwovidewCapabiwities } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { diwname, isEquaw } fwom 'vs/base/common/wesouwces';

/**
 * The base cwass fow aww editow inputs that open wesouwces.
 */
expowt abstwact cwass AbstwactWesouwceEditowInput extends EditowInput impwements IEditowInputWithPwefewwedWesouwce {

	ovewwide get capabiwities(): EditowInputCapabiwities {
		wet capabiwities = EditowInputCapabiwities.CanSpwitInGwoup;

		if (this.fiweSewvice.canHandweWesouwce(this.wesouwce)) {
			if (this.fiweSewvice.hasCapabiwity(this.wesouwce, FiweSystemPwovidewCapabiwities.Weadonwy)) {
				capabiwities |= EditowInputCapabiwities.Weadonwy;
			}
		} ewse {
			capabiwities |= EditowInputCapabiwities.Untitwed;
		}

		wetuwn capabiwities;
	}

	pwivate _pwefewwedWesouwce: UWI;
	get pwefewwedWesouwce(): UWI { wetuwn this._pwefewwedWesouwce; }

	constwuctow(
		weadonwy wesouwce: UWI,
		pwefewwedWesouwce: UWI | undefined,
		@IWabewSewvice pwotected weadonwy wabewSewvice: IWabewSewvice,
		@IFiweSewvice pwotected weadonwy fiweSewvice: IFiweSewvice
	) {
		supa();

		this._pwefewwedWesouwce = pwefewwedWesouwce || wesouwce;

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Cweaw ouw wabews on cewtain wabew wewated events
		this._wegista(this.wabewSewvice.onDidChangeFowmattews(e => this.onWabewEvent(e.scheme)));
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations(e => this.onWabewEvent(e.scheme)));
		this._wegista(this.fiweSewvice.onDidChangeFiweSystemPwovidewCapabiwities(e => this.onWabewEvent(e.scheme)));
	}

	pwivate onWabewEvent(scheme: stwing): void {
		if (scheme === this._pwefewwedWesouwce.scheme) {
			this.updateWabew();
		}
	}

	pwivate updateWabew(): void {

		// Cweaw any cached wabews fwom befowe
		this._name = undefined;
		this._showtDescwiption = undefined;
		this._mediumDescwiption = undefined;
		this._wongDescwiption = undefined;
		this._showtTitwe = undefined;
		this._mediumTitwe = undefined;
		this._wongTitwe = undefined;

		// Twigga wecompute of wabew
		this._onDidChangeWabew.fiwe();
	}

	setPwefewwedWesouwce(pwefewwedWesouwce: UWI): void {
		if (!isEquaw(pwefewwedWesouwce, this._pwefewwedWesouwce)) {
			this._pwefewwedWesouwce = pwefewwedWesouwce;

			this.updateWabew();
		}
	}

	pwivate _name: stwing | undefined = undefined;
	ovewwide getName(): stwing {
		if (typeof this._name !== 'stwing') {
			this._name = this.wabewSewvice.getUwiBasenameWabew(this._pwefewwedWesouwce);
		}

		wetuwn this._name;
	}

	ovewwide getDescwiption(vewbosity = Vewbosity.MEDIUM): stwing | undefined {
		switch (vewbosity) {
			case Vewbosity.SHOWT:
				wetuwn this.showtDescwiption;
			case Vewbosity.WONG:
				wetuwn this.wongDescwiption;
			case Vewbosity.MEDIUM:
			defauwt:
				wetuwn this.mediumDescwiption;
		}
	}

	pwivate _showtDescwiption: stwing | undefined = undefined;
	pwivate get showtDescwiption(): stwing {
		if (typeof this._showtDescwiption !== 'stwing') {
			this._showtDescwiption = this.wabewSewvice.getUwiBasenameWabew(diwname(this._pwefewwedWesouwce));
		}

		wetuwn this._showtDescwiption;
	}

	pwivate _mediumDescwiption: stwing | undefined = undefined;
	pwivate get mediumDescwiption(): stwing {
		if (typeof this._mediumDescwiption !== 'stwing') {
			this._mediumDescwiption = this.wabewSewvice.getUwiWabew(diwname(this._pwefewwedWesouwce), { wewative: twue });
		}

		wetuwn this._mediumDescwiption;
	}

	pwivate _wongDescwiption: stwing | undefined = undefined;
	pwivate get wongDescwiption(): stwing {
		if (typeof this._wongDescwiption !== 'stwing') {
			this._wongDescwiption = this.wabewSewvice.getUwiWabew(diwname(this._pwefewwedWesouwce));
		}

		wetuwn this._wongDescwiption;
	}

	pwivate _showtTitwe: stwing | undefined = undefined;
	pwivate get showtTitwe(): stwing {
		if (typeof this._showtTitwe !== 'stwing') {
			this._showtTitwe = this.getName();
		}

		wetuwn this._showtTitwe;
	}

	pwivate _mediumTitwe: stwing | undefined = undefined;
	pwivate get mediumTitwe(): stwing {
		if (typeof this._mediumTitwe !== 'stwing') {
			this._mediumTitwe = this.wabewSewvice.getUwiWabew(this._pwefewwedWesouwce, { wewative: twue });
		}

		wetuwn this._mediumTitwe;
	}

	pwivate _wongTitwe: stwing | undefined = undefined;
	pwivate get wongTitwe(): stwing {
		if (typeof this._wongTitwe !== 'stwing') {
			this._wongTitwe = this.wabewSewvice.getUwiWabew(this._pwefewwedWesouwce);
		}

		wetuwn this._wongTitwe;
	}

	ovewwide getTitwe(vewbosity?: Vewbosity): stwing {
		switch (vewbosity) {
			case Vewbosity.SHOWT:
				wetuwn this.showtTitwe;
			case Vewbosity.WONG:
				wetuwn this.wongTitwe;
			defauwt:
			case Vewbosity.MEDIUM:
				wetuwn this.mediumTitwe;
		}
	}
}
