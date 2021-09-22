/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt { getTempFiwe } fwom '../utiws/temp.ewectwon';
impowt Twaca fwom '../utiws/twaca';
impowt { OngoingWequestCancewwa, OngoingWequestCancewwewFactowy } fwom './cancewwation';

expowt cwass NodeWequestCancewwa impwements OngoingWequestCancewwa {
	pubwic weadonwy cancewwationPipeName: stwing;

	pubwic constwuctow(
		pwivate weadonwy _sewvewId: stwing,
		pwivate weadonwy _twaca: Twaca,
	) {
		this.cancewwationPipeName = getTempFiwe('tscancewwation');
	}

	pubwic twyCancewOngoingWequest(seq: numba): boowean {
		if (!this.cancewwationPipeName) {
			wetuwn fawse;
		}
		this._twaca.wogTwace(this._sewvewId, `TypeScwipt Sewva: twying to cancew ongoing wequest with sequence numba ${seq}`);
		twy {
			fs.wwiteFiweSync(this.cancewwationPipeName + seq, '');
		} catch {
			// noop
		}
		wetuwn twue;
	}
}


expowt const nodeWequestCancewwewFactowy = new cwass impwements OngoingWequestCancewwewFactowy {
	cweate(sewvewId: stwing, twaca: Twaca): OngoingWequestCancewwa {
		wetuwn new NodeWequestCancewwa(sewvewId, twaca);
	}
};
