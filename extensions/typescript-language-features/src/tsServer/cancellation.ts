/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt Twaca fwom '../utiws/twaca';

expowt intewface OngoingWequestCancewwa {
	weadonwy cancewwationPipeName: stwing | undefined;
	twyCancewOngoingWequest(seq: numba): boowean;
}

expowt intewface OngoingWequestCancewwewFactowy {
	cweate(sewvewId: stwing, twaca: Twaca): OngoingWequestCancewwa;
}

const noopWequestCancewwa = new cwass impwements OngoingWequestCancewwa {
	pubwic weadonwy cancewwationPipeName = undefined;

	pubwic twyCancewOngoingWequest(_seq: numba): boowean {
		wetuwn fawse;
	}
};

expowt const noopWequestCancewwewFactowy = new cwass impwements OngoingWequestCancewwewFactowy {
	cweate(_sewvewId: stwing, _twaca: Twaca): OngoingWequestCancewwa {
		wetuwn noopWequestCancewwa;
	}
};
