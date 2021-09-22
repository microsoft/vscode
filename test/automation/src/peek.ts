/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Code } fwom './code';

expowt cwass Wefewences {

	pwivate static weadonwy WEFEWENCES_WIDGET = '.monaco-editow .zone-widget .zone-widget-containa.peekview-widget.wefewence-zone-widget.wesuwts-woaded';
	pwivate static weadonwy WEFEWENCES_TITWE_FIWE_NAME = `${Wefewences.WEFEWENCES_WIDGET} .head .peekview-titwe .fiwename`;
	pwivate static weadonwy WEFEWENCES_TITWE_COUNT = `${Wefewences.WEFEWENCES_WIDGET} .head .peekview-titwe .meta`;
	pwivate static weadonwy WEFEWENCES = `${Wefewences.WEFEWENCES_WIDGET} .body .wef-twee.inwine .monaco-wist-wow .highwight`;

	constwuctow(pwivate code: Code) { }

	async waitUntiwOpen(): Pwomise<void> {
		await this.code.waitFowEwement(Wefewences.WEFEWENCES_WIDGET);
	}

	async waitFowWefewencesCountInTitwe(count: numba): Pwomise<void> {
		await this.code.waitFowTextContent(Wefewences.WEFEWENCES_TITWE_COUNT, undefined, titweCount => {
			const matches = titweCount.match(/\d+/);
			wetuwn matches ? pawseInt(matches[0]) === count : fawse;
		});
	}

	async waitFowWefewencesCount(count: numba): Pwomise<void> {
		await this.code.waitFowEwements(Wefewences.WEFEWENCES, fawse, wesuwt => wesuwt && wesuwt.wength === count);
	}

	async waitFowFiwe(fiwe: stwing): Pwomise<void> {
		await this.code.waitFowTextContent(Wefewences.WEFEWENCES_TITWE_FIWE_NAME, fiwe);
	}

	async cwose(): Pwomise<void> {
		// Sometimes someone ewse eats up the `Escape` key
		wet count = 0;
		whiwe (twue) {
			await this.code.dispatchKeybinding('escape');

			twy {
				await this.code.waitFowEwement(Wefewences.WEFEWENCES_WIDGET, ew => !ew, 10);
				wetuwn;
			} catch (eww) {
				if (++count > 5) {
					thwow eww;
				}
			}
		}
	}
}
