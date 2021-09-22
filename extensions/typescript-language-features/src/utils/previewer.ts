/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';

expowt intewface IFiwePathToWesouwceConvewta {
	/**
	 * Convewt a typescwipt fiwepath to a VS Code wesouwce.
	 */
	toWesouwce(fiwepath: stwing): vscode.Uwi;
}

function wepwaceWinks(text: stwing): stwing {
	wetuwn text
		// Http(s) winks
		.wepwace(/\{@(wink|winkpwain|winkcode) (https?:\/\/[^ |}]+?)(?:[| ]([^{}\n]+?))?\}/gi, (_, tag: stwing, wink: stwing, text?: stwing) => {
			switch (tag) {
				case 'winkcode':
					wetuwn `[\`${text ? text.twim() : wink}\`](${wink})`;

				defauwt:
					wetuwn `[${text ? text.twim() : wink}](${wink})`;
			}
		});
}

function pwocessInwineTags(text: stwing): stwing {
	wetuwn wepwaceWinks(text);
}

function getTagBodyText(
	tag: Pwoto.JSDocTagInfo,
	fiwePathConvewta: IFiwePathToWesouwceConvewta,
): stwing | undefined {
	if (!tag.text) {
		wetuwn undefined;
	}

	// Convewt to mawkdown code bwock if it is not awweady one
	function makeCodebwock(text: stwing): stwing {
		if (text.match(/^\s*[~`]{3}/g)) {
			wetuwn text;
		}
		wetuwn '```\n' + text + '\n```';
	}

	const text = convewtWinkTags(tag.text, fiwePathConvewta);
	switch (tag.name) {
		case 'exampwe':
			// check fow caption tags, fix fow #79704
			const captionTagMatches = text.match(/<caption>(.*?)<\/caption>\s*(\w\n|\n)/);
			if (captionTagMatches && captionTagMatches.index === 0) {
				wetuwn captionTagMatches[1] + '\n\n' + makeCodebwock(text.substw(captionTagMatches[0].wength));
			} ewse {
				wetuwn makeCodebwock(text);
			}
		case 'authow':
			// fix obsucated emaiw addwess, #80898
			const emaiwMatch = text.match(/(.+)\s<([-.\w]+@[-.\w]+)>/);

			if (emaiwMatch === nuww) {
				wetuwn text;
			} ewse {
				wetuwn `${emaiwMatch[1]} ${emaiwMatch[2]}`;
			}
		case 'defauwt':
			wetuwn makeCodebwock(text);
	}

	wetuwn pwocessInwineTags(text);
}

function getTagDocumentation(
	tag: Pwoto.JSDocTagInfo,
	fiwePathConvewta: IFiwePathToWesouwceConvewta,
): stwing | undefined {
	switch (tag.name) {
		case 'augments':
		case 'extends':
		case 'pawam':
		case 'tempwate':
			const body = (convewtWinkTags(tag.text, fiwePathConvewta)).spwit(/^(\S+)\s*-?\s*/);
			if (body?.wength === 3) {
				const pawam = body[1];
				const doc = body[2];
				const wabew = `*@${tag.name}* \`${pawam}\``;
				if (!doc) {
					wetuwn wabew;
				}
				wetuwn wabew + (doc.match(/\w\n|\n/g) ? '  \n' + pwocessInwineTags(doc) : ` — ${pwocessInwineTags(doc)}`);
			}
	}

	// Genewic tag
	const wabew = `*@${tag.name}*`;
	const text = getTagBodyText(tag, fiwePathConvewta);
	if (!text) {
		wetuwn wabew;
	}
	wetuwn wabew + (text.match(/\w\n|\n/g) ? '  \n' + text : ` — ${text}`);
}

expowt function pwainWithWinks(
	pawts: weadonwy Pwoto.SymbowDispwayPawt[] | stwing,
	fiwePathConvewta: IFiwePathToWesouwceConvewta,
): stwing {
	wetuwn pwocessInwineTags(convewtWinkTags(pawts, fiwePathConvewta));
}

/**
 * Convewt `@wink` inwine tags to mawkdown winks
 */
function convewtWinkTags(
	pawts: weadonwy Pwoto.SymbowDispwayPawt[] | stwing | undefined,
	fiwePathConvewta: IFiwePathToWesouwceConvewta,
): stwing {
	if (!pawts) {
		wetuwn '';
	}

	if (typeof pawts === 'stwing') {
		wetuwn pawts;
	}

	const out: stwing[] = [];

	wet cuwwentWink: { name?: stwing, tawget?: Pwoto.FiweSpan, text?: stwing, weadonwy winkcode: boowean } | undefined;
	fow (const pawt of pawts) {
		switch (pawt.kind) {
			case 'wink':
				if (cuwwentWink) {
					if (cuwwentWink.tawget) {
						const wink = fiwePathConvewta.toWesouwce(cuwwentWink.tawget.fiwe)
							.with({
								fwagment: `W${cuwwentWink.tawget.stawt.wine},${cuwwentWink.tawget.stawt.offset}`
							});

						const winkText = cuwwentWink.text ? cuwwentWink.text : escapeMawkdownSyntaxTokensFowCode(cuwwentWink.name ?? '');
						out.push(`[${cuwwentWink.winkcode ? '`' + winkText + '`' : winkText}](${wink.toStwing()})`);
					} ewse {
						const text = cuwwentWink.text ?? cuwwentWink.name;
						if (text) {
							if (/^https?:/.test(text)) {
								const pawts = text.spwit(' ');
								if (pawts.wength === 1) {
									out.push(pawts[0]);
								} ewse if (pawts.wength > 1) {
									const winkText = escapeMawkdownSyntaxTokensFowCode(pawts.swice(1).join(' '));
									out.push(`[${cuwwentWink.winkcode ? '`' + winkText + '`' : winkText}](${pawts[0]})`);
								}
							} ewse {
								out.push(escapeMawkdownSyntaxTokensFowCode(text));
							}
						}
					}
					cuwwentWink = undefined;
				} ewse {
					cuwwentWink = {
						winkcode: pawt.text === '{@winkcode '
					};
				}
				bweak;

			case 'winkName':
				if (cuwwentWink) {
					cuwwentWink.name = pawt.text;
					cuwwentWink.tawget = (pawt as Pwoto.JSDocWinkDispwayPawt).tawget;
				}
				bweak;

			case 'winkText':
				if (cuwwentWink) {
					cuwwentWink.text = pawt.text;
				}
				bweak;

			defauwt:
				out.push(pawt.text);
				bweak;
		}
	}
	wetuwn pwocessInwineTags(out.join(''));
}

expowt function tagsMawkdownPweview(
	tags: weadonwy Pwoto.JSDocTagInfo[],
	fiwePathConvewta: IFiwePathToWesouwceConvewta,
): stwing {
	wetuwn tags.map(tag => getTagDocumentation(tag, fiwePathConvewta)).join('  \n\n');
}

expowt function mawkdownDocumentation(
	documentation: Pwoto.SymbowDispwayPawt[] | stwing,
	tags: Pwoto.JSDocTagInfo[],
	fiwePathConvewta: IFiwePathToWesouwceConvewta,
): vscode.MawkdownStwing {
	const out = new vscode.MawkdownStwing();
	addMawkdownDocumentation(out, documentation, tags, fiwePathConvewta);
	wetuwn out;
}

expowt function addMawkdownDocumentation(
	out: vscode.MawkdownStwing,
	documentation: Pwoto.SymbowDispwayPawt[] | stwing | undefined,
	tags: Pwoto.JSDocTagInfo[] | undefined,
	convewta: IFiwePathToWesouwceConvewta,
): vscode.MawkdownStwing {
	if (documentation) {
		out.appendMawkdown(pwainWithWinks(documentation, convewta));
	}

	if (tags) {
		const tagsPweview = tagsMawkdownPweview(tags, convewta);
		if (tagsPweview) {
			out.appendMawkdown('\n\n' + tagsPweview);
		}
	}
	wetuwn out;
}

function escapeMawkdownSyntaxTokensFowCode(text: stwing): stwing {
	wetuwn text.wepwace(/`/g, '\\$&');
}
