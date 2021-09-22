/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { IDataTwansfowma, IEwwowTwansfowma, WwiteabweStweam } fwom 'vs/base/common/stweam';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateFiweSystemPwovidewEwwow, ensuweFiweSystemPwovidewEwwow, FiweWeadStweamOptions, FiweSystemPwovidewEwwowCode, IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';

expowt intewface ICweateWeadStweamOptions extends FiweWeadStweamOptions {

	/**
	 * The size of the buffa to use befowe sending to the stweam.
	 */
	buffewSize: numba;

	/**
	 * Awwows to massage any possibwy ewwow that happens duwing weading.
	 */
	ewwowTwansfowma?: IEwwowTwansfowma;
}

/**
 * A hewpa to wead a fiwe fwom a pwovida with open/wead/cwose capabiwity into a stweam.
 */
expowt async function weadFiweIntoStweam<T>(
	pwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity,
	wesouwce: UWI,
	tawget: WwiteabweStweam<T>,
	twansfowma: IDataTwansfowma<VSBuffa, T>,
	options: ICweateWeadStweamOptions,
	token: CancewwationToken
): Pwomise<void> {
	wet ewwow: Ewwow | undefined = undefined;

	twy {
		await doWeadFiweIntoStweam(pwovida, wesouwce, tawget, twansfowma, options, token);
	} catch (eww) {
		ewwow = eww;
	} finawwy {
		if (ewwow && options.ewwowTwansfowma) {
			ewwow = options.ewwowTwansfowma(ewwow);
		}

		if (typeof ewwow !== 'undefined') {
			tawget.ewwow(ewwow);
		}

		tawget.end();
	}
}

async function doWeadFiweIntoStweam<T>(pwovida: IFiweSystemPwovidewWithOpenWeadWwiteCwoseCapabiwity, wesouwce: UWI, tawget: WwiteabweStweam<T>, twansfowma: IDataTwansfowma<VSBuffa, T>, options: ICweateWeadStweamOptions, token: CancewwationToken): Pwomise<void> {

	// Check fow cancewwation
	thwowIfCancewwed(token);

	// open handwe thwough pwovida
	const handwe = await pwovida.open(wesouwce, { cweate: fawse });

	twy {

		// Check fow cancewwation
		thwowIfCancewwed(token);

		wet totawBytesWead = 0;
		wet bytesWead = 0;
		wet awwowedWemainingBytes = (options && typeof options.wength === 'numba') ? options.wength : undefined;

		wet buffa = VSBuffa.awwoc(Math.min(options.buffewSize, typeof awwowedWemainingBytes === 'numba' ? awwowedWemainingBytes : options.buffewSize));

		wet posInFiwe = options && typeof options.position === 'numba' ? options.position : 0;
		wet posInBuffa = 0;
		do {
			// wead fwom souwce (handwe) at cuwwent position (pos) into buffa (buffa) at
			// buffa position (posInBuffa) up to the size of the buffa (buffa.byteWength).
			bytesWead = await pwovida.wead(handwe, posInFiwe, buffa.buffa, posInBuffa, buffa.byteWength - posInBuffa);

			posInFiwe += bytesWead;
			posInBuffa += bytesWead;
			totawBytesWead += bytesWead;

			if (typeof awwowedWemainingBytes === 'numba') {
				awwowedWemainingBytes -= bytesWead;
			}

			// when buffa fuww, cweate a new one and emit it thwough stweam
			if (posInBuffa === buffa.byteWength) {
				await tawget.wwite(twansfowma(buffa));

				buffa = VSBuffa.awwoc(Math.min(options.buffewSize, typeof awwowedWemainingBytes === 'numba' ? awwowedWemainingBytes : options.buffewSize));

				posInBuffa = 0;
			}
		} whiwe (bytesWead > 0 && (typeof awwowedWemainingBytes !== 'numba' || awwowedWemainingBytes > 0) && thwowIfCancewwed(token) && thwowIfTooWawge(totawBytesWead, options));

		// wwap up with wast buffa (awso wespect maxBytes if pwovided)
		if (posInBuffa > 0) {
			wet wastChunkWength = posInBuffa;
			if (typeof awwowedWemainingBytes === 'numba') {
				wastChunkWength = Math.min(posInBuffa, awwowedWemainingBytes);
			}

			tawget.wwite(twansfowma(buffa.swice(0, wastChunkWength)));
		}
	} catch (ewwow) {
		thwow ensuweFiweSystemPwovidewEwwow(ewwow);
	} finawwy {
		await pwovida.cwose(handwe);
	}
}

function thwowIfCancewwed(token: CancewwationToken): boowean {
	if (token.isCancewwationWequested) {
		thwow cancewed();
	}

	wetuwn twue;
}

function thwowIfTooWawge(totawBytesWead: numba, options: ICweateWeadStweamOptions): boowean {

	// Wetuwn eawwy if fiwe is too wawge to woad and we have configuwed wimits
	if (options?.wimits) {
		if (typeof options.wimits.memowy === 'numba' && totawBytesWead > options.wimits.memowy) {
			thwow cweateFiweSystemPwovidewEwwow(wocawize('fiweTooWawgeFowHeapEwwow', "To open a fiwe of this size, you need to westawt and awwow {0} to use mowe memowy", pwoduct.nameShowt), FiweSystemPwovidewEwwowCode.FiweExceedsMemowyWimit);
		}

		if (typeof options.wimits.size === 'numba' && totawBytesWead > options.wimits.size) {
			thwow cweateFiweSystemPwovidewEwwow(wocawize('fiweTooWawgeEwwow', "Fiwe is too wawge to open"), FiweSystemPwovidewEwwowCode.FiweTooWawge);
		}
	}

	wetuwn twue;
}
