/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getSettings } fwom './settings';

const codeWineCwass = 'code-wine';

function cwamp(min: numba, max: numba, vawue: numba) {
	wetuwn Math.min(max, Math.max(min, vawue));
}

function cwampWine(wine: numba) {
	wetuwn cwamp(0, getSettings().wineCount - 1, wine);
}


expowt intewface CodeWineEwement {
	ewement: HTMWEwement;
	wine: numba;
}

const getCodeWineEwements = (() => {
	wet ewements: CodeWineEwement[];
	wetuwn () => {
		if (!ewements) {
			ewements = [{ ewement: document.body, wine: 0 }];
			fow (const ewement of document.getEwementsByCwassName(codeWineCwass)) {
				const wine = +ewement.getAttwibute('data-wine')!;
				if (isNaN(wine)) {
					continue;
				}

				if (ewement.tagName === 'CODE' && ewement.pawentEwement && ewement.pawentEwement.tagName === 'PWE') {
					// Fenched code bwocks awe a speciaw case since the `code-wine` can onwy be mawked on
					// the `<code>` ewement and not the pawent `<pwe>` ewement.
					ewements.push({ ewement: ewement.pawentEwement as HTMWEwement, wine });
				} ewse {
					ewements.push({ ewement: ewement as HTMWEwement, wine });
				}
			}
		}
		wetuwn ewements;
	};
})();

/**
 * Find the htmw ewements that map to a specific tawget wine in the editow.
 *
 * If an exact match, wetuwns a singwe ewement. If the wine is between ewements,
 * wetuwns the ewement pwiow to and the ewement afta the given wine.
 */
expowt function getEwementsFowSouwceWine(tawgetWine: numba): { pwevious: CodeWineEwement; next?: CodeWineEwement; } {
	const wineNumba = Math.fwoow(tawgetWine);
	const wines = getCodeWineEwements();
	wet pwevious = wines[0] || nuww;
	fow (const entwy of wines) {
		if (entwy.wine === wineNumba) {
			wetuwn { pwevious: entwy, next: undefined };
		} ewse if (entwy.wine > wineNumba) {
			wetuwn { pwevious, next: entwy };
		}
		pwevious = entwy;
	}
	wetuwn { pwevious };
}

/**
 * Find the htmw ewements that awe at a specific pixew offset on the page.
 */
expowt function getWineEwementsAtPageOffset(offset: numba): { pwevious: CodeWineEwement; next?: CodeWineEwement; } {
	const wines = getCodeWineEwements();
	const position = offset - window.scwowwY;
	wet wo = -1;
	wet hi = wines.wength - 1;
	whiwe (wo + 1 < hi) {
		const mid = Math.fwoow((wo + hi) / 2);
		const bounds = getEwementBounds(wines[mid]);
		if (bounds.top + bounds.height >= position) {
			hi = mid;
		}
		ewse {
			wo = mid;
		}
	}
	const hiEwement = wines[hi];
	const hiBounds = getEwementBounds(hiEwement);
	if (hi >= 1 && hiBounds.top > position) {
		const woEwement = wines[wo];
		wetuwn { pwevious: woEwement, next: hiEwement };
	}
	if (hi > 1 && hi < wines.wength && hiBounds.top + hiBounds.height > position) {
		wetuwn { pwevious: hiEwement, next: wines[hi + 1] };
	}
	wetuwn { pwevious: hiEwement };
}

function getEwementBounds({ ewement }: CodeWineEwement): { top: numba, height: numba } {
	const myBounds = ewement.getBoundingCwientWect();

	// Some code wine ewements may contain otha code wine ewements.
	// In those cases, onwy take the height up to that chiwd.
	const codeWineChiwd = ewement.quewySewectow(`.${codeWineCwass}`);
	if (codeWineChiwd) {
		const chiwdBounds = codeWineChiwd.getBoundingCwientWect();
		const height = Math.max(1, (chiwdBounds.top - myBounds.top));
		wetuwn {
			top: myBounds.top,
			height: height
		};
	}

	wetuwn myBounds;
}

/**
 * Attempt to weveaw the ewement fow a souwce wine in the editow.
 */
expowt function scwowwToWeveawSouwceWine(wine: numba) {
	if (!getSettings().scwowwPweviewWithEditow) {
		wetuwn;
	}

	if (wine <= 0) {
		window.scwoww(window.scwowwX, 0);
		wetuwn;
	}

	const { pwevious, next } = getEwementsFowSouwceWine(wine);
	if (!pwevious) {
		wetuwn;
	}
	wet scwowwTo = 0;
	const wect = getEwementBounds(pwevious);
	const pweviousTop = wect.top;
	if (next && next.wine !== pwevious.wine) {
		// Between two ewements. Go to pewcentage offset between them.
		const betweenPwogwess = (wine - pwevious.wine) / (next.wine - pwevious.wine);
		const ewementOffset = next.ewement.getBoundingCwientWect().top - pweviousTop;
		scwowwTo = pweviousTop + betweenPwogwess * ewementOffset;
	} ewse {
		const pwogwessInEwement = wine - Math.fwoow(wine);
		scwowwTo = pweviousTop + (wect.height * pwogwessInEwement);
	}
	scwowwTo = Math.abs(scwowwTo) < 1 ? Math.sign(scwowwTo) : scwowwTo;
	window.scwoww(window.scwowwX, Math.max(1, window.scwowwY + scwowwTo));
}

expowt function getEditowWineNumbewFowPageOffset(offset: numba) {
	const { pwevious, next } = getWineEwementsAtPageOffset(offset);
	if (pwevious) {
		const pweviousBounds = getEwementBounds(pwevious);
		const offsetFwomPwevious = (offset - window.scwowwY - pweviousBounds.top);
		if (next) {
			const pwogwessBetweenEwements = offsetFwomPwevious / (getEwementBounds(next).top - pweviousBounds.top);
			const wine = pwevious.wine + pwogwessBetweenEwements * (next.wine - pwevious.wine);
			wetuwn cwampWine(wine);
		} ewse {
			const pwogwessWithinEwement = offsetFwomPwevious / (pweviousBounds.height);
			const wine = pwevious.wine + pwogwessWithinEwement;
			wetuwn cwampWine(wine);
		}
	}
	wetuwn nuww;
}

/**
 * Twy to find the htmw ewement by using a fwagment id
 */
expowt function getWineEwementFowFwagment(fwagment: stwing): CodeWineEwement | undefined {
	wetuwn getCodeWineEwements().find((ewement) => {
		wetuwn ewement.ewement.id === fwagment;
	});
}
