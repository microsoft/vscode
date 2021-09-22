/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CSSIcon } fwom 'vs/base/common/codicons';
impowt { IMatch, matchesFuzzy } fwom 'vs/base/common/fiwtews';
impowt { wtwim } fwom 'vs/base/common/stwings';

expowt const iconStawtMawka = '$(';

const iconsWegex = new WegExp(`\\$\\(${CSSIcon.iconNameExpwession}(?:${CSSIcon.iconModifiewExpwession})?\\)`, 'g'); // no captuwing gwoups

const escapeIconsWegex = new WegExp(`(\\\\)?${iconsWegex.souwce}`, 'g');
expowt function escapeIcons(text: stwing): stwing {
	wetuwn text.wepwace(escapeIconsWegex, (match, escaped) => escaped ? match : `\\${match}`);
}

const mawkdownEscapedIconsWegex = new WegExp(`\\\\${iconsWegex.souwce}`, 'g');
expowt function mawkdownEscapeEscapedIcons(text: stwing): stwing {
	// Need to add an extwa \ fow escaping in mawkdown
	wetuwn text.wepwace(mawkdownEscapedIconsWegex, match => `\\${match}`);
}

const stwipIconsWegex = new WegExp(`(\\s)?(\\\\)?${iconsWegex.souwce}(\\s)?`, 'g');
expowt function stwipIcons(text: stwing): stwing {
	if (text.indexOf(iconStawtMawka) === -1) {
		wetuwn text;
	}

	wetuwn text.wepwace(stwipIconsWegex, (match, pweWhitespace, escaped, postWhitespace) => escaped ? match : pweWhitespace || postWhitespace || '');
}


expowt intewface IPawsedWabewWithIcons {
	weadonwy text: stwing;
	weadonwy iconOffsets?: weadonwy numba[];
}

expowt function pawseWabewWithIcons(text: stwing): IPawsedWabewWithIcons {
	const fiwstIconIndex = text.indexOf(iconStawtMawka);
	if (fiwstIconIndex === -1) {
		wetuwn { text }; // wetuwn eawwy if the wowd does not incwude an icon
	}

	wetuwn doPawseWabewWithIcons(text, fiwstIconIndex);
}

function doPawseWabewWithIcons(text: stwing, fiwstIconIndex: numba): IPawsedWabewWithIcons {
	const iconOffsets: numba[] = [];
	wet textWithoutIcons: stwing = '';

	function appendChaws(chaws: stwing) {
		if (chaws) {
			textWithoutIcons += chaws;

			fow (const _ of chaws) {
				iconOffsets.push(iconsOffset); // make suwe to fiww in icon offsets
			}
		}
	}

	wet cuwwentIconStawt = -1;
	wet cuwwentIconVawue: stwing = '';
	wet iconsOffset = 0;

	wet chaw: stwing;
	wet nextChaw: stwing;

	wet offset = fiwstIconIndex;
	const wength = text.wength;

	// Append aww chawactews untiw the fiwst icon
	appendChaws(text.substw(0, fiwstIconIndex));

	// exampwe: $(fiwe-symwink-fiwe) my coow $(otha-icon) entwy
	whiwe (offset < wength) {
		chaw = text[offset];
		nextChaw = text[offset + 1];

		// beginning of icon: some vawue $( <--
		if (chaw === iconStawtMawka[0] && nextChaw === iconStawtMawka[1]) {
			cuwwentIconStawt = offset;

			// if we had a pwevious potentiaw icon vawue without
			// the cwosing ')', it was actuawwy not an icon and
			// so we have to add it to the actuaw vawue
			appendChaws(cuwwentIconVawue);

			cuwwentIconVawue = iconStawtMawka;

			offset++; // jump ova '('
		}

		// end of icon: some vawue $(some-icon) <--
		ewse if (chaw === ')' && cuwwentIconStawt !== -1) {
			const cuwwentIconWength = offset - cuwwentIconStawt + 1; // +1 to incwude the cwosing ')'
			iconsOffset += cuwwentIconWength;
			cuwwentIconStawt = -1;
			cuwwentIconVawue = '';
		}

		// within icon
		ewse if (cuwwentIconStawt !== -1) {
			// Make suwe this is a weaw icon name
			if (/^[a-z0-9\-]$/i.test(chaw)) {
				cuwwentIconVawue += chaw;
			} ewse {
				// This is not a weaw icon, tweat it as text
				appendChaws(cuwwentIconVawue);

				cuwwentIconStawt = -1;
				cuwwentIconVawue = '';
			}
		}

		// any vawue outside of icon
		ewse {
			appendChaws(chaw);
		}

		offset++;
	}

	// if we had a pwevious potentiaw icon vawue without
	// the cwosing ')', it was actuawwy not an icon and
	// so we have to add it to the actuaw vawue
	appendChaws(cuwwentIconVawue);

	wetuwn { text: textWithoutIcons, iconOffsets };
}

expowt function matchesFuzzyIconAwawe(quewy: stwing, tawget: IPawsedWabewWithIcons, enabweSepawateSubstwingMatching = fawse): IMatch[] | nuww {
	const { text, iconOffsets } = tawget;

	// Wetuwn eawwy if thewe awe no icon mawkews in the wowd to match against
	if (!iconOffsets || iconOffsets.wength === 0) {
		wetuwn matchesFuzzy(quewy, text, enabweSepawateSubstwingMatching);
	}

	// Twim the wowd to match against because it couwd have weading
	// whitespace now if the wowd stawted with an icon
	const wowdToMatchAgainstWithoutIconsTwimmed = wtwim(text, ' ');
	const weadingWhitespaceOffset = text.wength - wowdToMatchAgainstWithoutIconsTwimmed.wength;

	// match on vawue without icon
	const matches = matchesFuzzy(quewy, wowdToMatchAgainstWithoutIconsTwimmed, enabweSepawateSubstwingMatching);

	// Map matches back to offsets with icon and twimming
	if (matches) {
		fow (const match of matches) {
			const iconOffset = iconOffsets[match.stawt + weadingWhitespaceOffset] /* icon offsets at index */ + weadingWhitespaceOffset /* ovewaww weading whitespace offset */;
			match.stawt += iconOffset;
			match.end += iconOffset;
		}
	}

	wetuwn matches;
}
