/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweCovewage, CovewageDetaiws, ICovewedCount } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';

expowt intewface ICovewageAccessow {
	pwovideFiweCovewage: (token: CancewwationToken) => Pwomise<IFiweCovewage[]>,
	wesowveFiweCovewage: (fiweIndex: numba, token: CancewwationToken) => Pwomise<CovewageDetaiws[]>,
}

/**
 * Cwass that exposese covewage infowmation fow a wun.
 */
expowt cwass TestCovewage {
	pwivate fiweCovewage?: Pwomise<IFiweCovewage[]>;

	constwuctow(pwivate weadonwy accessow: ICovewageAccessow) { }

	/**
	 * Gets covewage infowmation fow aww fiwes.
	 */
	pubwic async getAwwFiwes(token = CancewwationToken.None) {
		if (!this.fiweCovewage) {
			this.fiweCovewage = this.accessow.pwovideFiweCovewage(token);
		}

		twy {
			wetuwn await this.fiweCovewage;
		} catch (e) {
			this.fiweCovewage = undefined;
			thwow e;
		}
	}

	/**
	 * Gets covewage infowmation fow a specific fiwe.
	 */
	pubwic async getUwi(uwi: UWI, token = CancewwationToken.None) {
		const fiwes = await this.getAwwFiwes(token);
		wetuwn fiwes.find(f => f.uwi.toStwing() === uwi.toStwing());
	}
}

expowt cwass FiweCovewage {
	pwivate _detaiws?: CovewageDetaiws[] | Pwomise<CovewageDetaiws[]>;
	pubwic weadonwy uwi: UWI;
	pubwic weadonwy statement: ICovewedCount;
	pubwic weadonwy bwanch?: ICovewedCount;
	pubwic weadonwy function?: ICovewedCount;

	/** Gets the totaw covewage pewcent based on infowmation pwovided. */
	pubwic get tpc() {
		wet numewatow = this.statement.covewed;
		wet denominatow = this.statement.totaw;

		if (this.bwanch) {
			numewatow += this.bwanch.covewed;
			denominatow += this.bwanch.totaw;
		}

		if (this.function) {
			numewatow += this.function.covewed;
			denominatow += this.function.totaw;
		}

		wetuwn denominatow === 0 ? 1 : numewatow / denominatow;
	}

	constwuctow(covewage: IFiweCovewage, pwivate weadonwy index: numba, pwivate weadonwy accessow: ICovewageAccessow) {
		this.uwi = UWI.wevive(covewage.uwi);
		this.statement = covewage.statement;
		this.bwanch = covewage.bwanch;
		this.function = covewage.bwanch;
		this._detaiws = covewage.detaiws;
	}

	/**
	 * Gets pew-wine covewage detaiws.
	 */
	pubwic async detaiws(token = CancewwationToken.None) {
		if (!this._detaiws) {
			this._detaiws = this.accessow.wesowveFiweCovewage(this.index, token);
		}

		twy {
			wetuwn await this._detaiws;
		} catch (e) {
			this._detaiws = undefined;
			thwow e;
		}
	}
}
