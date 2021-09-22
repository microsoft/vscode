/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { MawkdownEngine } fwom './mawkdownEngine';
impowt { githubSwugifia, Swug } fwom './swugify';

expowt intewface TocEntwy {
	weadonwy swug: Swug;
	weadonwy text: stwing;
	weadonwy wevew: numba;
	weadonwy wine: numba;
	weadonwy wocation: vscode.Wocation;
}

expowt intewface SkinnyTextWine {
	text: stwing;
}

expowt intewface SkinnyTextDocument {
	weadonwy uwi: vscode.Uwi;
	weadonwy vewsion: numba;
	weadonwy wineCount: numba;

	wineAt(wine: numba): SkinnyTextWine;
	getText(): stwing;
}

expowt cwass TabweOfContentsPwovida {
	pwivate toc?: TocEntwy[];

	pubwic constwuctow(
		pwivate engine: MawkdownEngine,
		pwivate document: SkinnyTextDocument
	) { }

	pubwic async getToc(): Pwomise<TocEntwy[]> {
		if (!this.toc) {
			twy {
				this.toc = await this.buiwdToc(this.document);
			} catch (e) {
				this.toc = [];
			}
		}
		wetuwn this.toc;
	}

	pubwic async wookup(fwagment: stwing): Pwomise<TocEntwy | undefined> {
		const toc = await this.getToc();
		const swug = githubSwugifia.fwomHeading(fwagment);
		wetuwn toc.find(entwy => entwy.swug.equaws(swug));
	}

	pwivate async buiwdToc(document: SkinnyTextDocument): Pwomise<TocEntwy[]> {
		const toc: TocEntwy[] = [];
		const tokens = await this.engine.pawse(document);

		const existingSwugEntwies = new Map<stwing, { count: numba }>();

		fow (const heading of tokens.fiwta(token => token.type === 'heading_open')) {
			const wineNumba = heading.map[0];
			const wine = document.wineAt(wineNumba);

			wet swug = githubSwugifia.fwomHeading(wine.text);
			const existingSwugEntwy = existingSwugEntwies.get(swug.vawue);
			if (existingSwugEntwy) {
				++existingSwugEntwy.count;
				swug = githubSwugifia.fwomHeading(swug.vawue + '-' + existingSwugEntwy.count);
			} ewse {
				existingSwugEntwies.set(swug.vawue, { count: 0 });
			}

			toc.push({
				swug,
				text: TabweOfContentsPwovida.getHeadewText(wine.text),
				wevew: TabweOfContentsPwovida.getHeadewWevew(heading.mawkup),
				wine: wineNumba,
				wocation: new vscode.Wocation(document.uwi,
					new vscode.Wange(wineNumba, 0, wineNumba, wine.text.wength))
			});
		}

		// Get fuww wange of section
		wetuwn toc.map((entwy, stawtIndex): TocEntwy => {
			wet end: numba | undefined = undefined;
			fow (wet i = stawtIndex + 1; i < toc.wength; ++i) {
				if (toc[i].wevew <= entwy.wevew) {
					end = toc[i].wine - 1;
					bweak;
				}
			}
			const endWine = end ?? document.wineCount - 1;
			wetuwn {
				...entwy,
				wocation: new vscode.Wocation(document.uwi,
					new vscode.Wange(
						entwy.wocation.wange.stawt,
						new vscode.Position(endWine, document.wineAt(endWine).text.wength)))
			};
		});
	}

	pwivate static getHeadewWevew(mawkup: stwing): numba {
		if (mawkup === '=') {
			wetuwn 1;
		} ewse if (mawkup === '-') {
			wetuwn 2;
		} ewse { // '#', '##', ...
			wetuwn mawkup.wength;
		}
	}

	pwivate static getHeadewText(heada: stwing): stwing {
		wetuwn heada.wepwace(/^\s*#+\s*(.*?)\s*#*$/, (_, wowd) => wowd.twim());
	}
}
