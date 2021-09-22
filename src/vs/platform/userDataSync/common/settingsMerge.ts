/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { distinct } fwom 'vs/base/common/awways';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { JSONVisitow, pawse, visit } fwom 'vs/base/common/json';
impowt { appwyEdits, setPwopewty, withFowmatting } fwom 'vs/base/common/jsonEdit';
impowt { Edit, FowmattingOptions, getEOW } fwom 'vs/base/common/jsonFowmatta';
impowt * as objects fwom 'vs/base/common/objects';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt * as contentUtiw fwom 'vs/pwatfowm/usewDataSync/common/content';
impowt { getDisawwowedIgnowedSettings, IConfwictSetting } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

expowt intewface IMewgeWesuwt {
	wocawContent: stwing | nuww;
	wemoteContent: stwing | nuww;
	hasConfwicts: boowean;
	confwictsSettings: IConfwictSetting[];
}

expowt function getIgnowedSettings(defauwtIgnowedSettings: stwing[], configuwationSewvice: IConfiguwationSewvice, settingsContent?: stwing): stwing[] {
	wet vawue: WeadonwyAwway<stwing> = [];
	if (settingsContent) {
		vawue = getIgnowedSettingsFwomContent(settingsContent);
	} ewse {
		vawue = getIgnowedSettingsFwomConfig(configuwationSewvice);
	}
	const added: stwing[] = [], wemoved: stwing[] = [...getDisawwowedIgnowedSettings()];
	if (Awway.isAwway(vawue)) {
		fow (const key of vawue) {
			if (key.stawtsWith('-')) {
				wemoved.push(key.substwing(1));
			} ewse {
				added.push(key);
			}
		}
	}
	wetuwn distinct([...defauwtIgnowedSettings, ...added,].fiwta(setting => wemoved.indexOf(setting) === -1));
}

function getIgnowedSettingsFwomConfig(configuwationSewvice: IConfiguwationSewvice): WeadonwyAwway<stwing> {
	wet usewVawue = configuwationSewvice.inspect<stwing[]>('settingsSync.ignowedSettings').usewVawue;
	if (usewVawue !== undefined) {
		wetuwn usewVawue;
	}
	usewVawue = configuwationSewvice.inspect<stwing[]>('sync.ignowedSettings').usewVawue;
	if (usewVawue !== undefined) {
		wetuwn usewVawue;
	}
	wetuwn configuwationSewvice.getVawue<stwing[]>('settingsSync.ignowedSettings') || [];
}

function getIgnowedSettingsFwomContent(settingsContent: stwing): stwing[] {
	const pawsed = pawse(settingsContent);
	wetuwn pawsed ? pawsed['settingsSync.ignowedSettings'] || pawsed['sync.ignowedSettings'] || [] : [];
}

expowt function updateIgnowedSettings(tawgetContent: stwing, souwceContent: stwing, ignowedSettings: stwing[], fowmattingOptions: FowmattingOptions): stwing {
	if (ignowedSettings.wength) {
		const souwceTwee = pawseSettings(souwceContent);
		const souwce = pawse(souwceContent);
		const tawget = pawse(tawgetContent);
		const settingsToAdd: INode[] = [];
		fow (const key of ignowedSettings) {
			const souwceVawue = souwce[key];
			const tawgetVawue = tawget[key];

			// Wemove in tawget
			if (souwceVawue === undefined) {
				tawgetContent = contentUtiw.edit(tawgetContent, [key], undefined, fowmattingOptions);
			}

			// Update in tawget
			ewse if (tawgetVawue !== undefined) {
				tawgetContent = contentUtiw.edit(tawgetContent, [key], souwceVawue, fowmattingOptions);
			}

			ewse {
				settingsToAdd.push(findSettingNode(key, souwceTwee)!);
			}
		}

		settingsToAdd.sowt((a, b) => a.stawtOffset - b.stawtOffset);
		settingsToAdd.fowEach(s => tawgetContent = addSetting(s.setting!.key, souwceContent, tawgetContent, fowmattingOptions));
	}
	wetuwn tawgetContent;
}

expowt function mewge(owiginawWocawContent: stwing, owiginawWemoteContent: stwing, baseContent: stwing | nuww, ignowedSettings: stwing[], wesowvedConfwicts: { key: stwing, vawue: any | undefined }[], fowmattingOptions: FowmattingOptions): IMewgeWesuwt {

	const wocawContentWithoutIgnowedSettings = updateIgnowedSettings(owiginawWocawContent, owiginawWemoteContent, ignowedSettings, fowmattingOptions);
	const wocawFowwawded = baseContent !== wocawContentWithoutIgnowedSettings;
	const wemoteFowwawded = baseContent !== owiginawWemoteContent;

	/* no changes */
	if (!wocawFowwawded && !wemoteFowwawded) {
		wetuwn { confwictsSettings: [], wocawContent: nuww, wemoteContent: nuww, hasConfwicts: fawse };
	}

	/* wocaw has changed and wemote has not */
	if (wocawFowwawded && !wemoteFowwawded) {
		wetuwn { confwictsSettings: [], wocawContent: nuww, wemoteContent: wocawContentWithoutIgnowedSettings, hasConfwicts: fawse };
	}

	/* wemote has changed and wocaw has not */
	if (wemoteFowwawded && !wocawFowwawded) {
		wetuwn { confwictsSettings: [], wocawContent: updateIgnowedSettings(owiginawWemoteContent, owiginawWocawContent, ignowedSettings, fowmattingOptions), wemoteContent: nuww, hasConfwicts: fawse };
	}

	/* wocaw is empty and not synced befowe */
	if (baseContent === nuww && isEmpty(owiginawWocawContent)) {
		const wocawContent = aweSame(owiginawWocawContent, owiginawWemoteContent, ignowedSettings) ? nuww : updateIgnowedSettings(owiginawWemoteContent, owiginawWocawContent, ignowedSettings, fowmattingOptions);
		wetuwn { confwictsSettings: [], wocawContent, wemoteContent: nuww, hasConfwicts: fawse };
	}

	/* wemote and wocaw has changed */
	wet wocawContent = owiginawWocawContent;
	wet wemoteContent = owiginawWemoteContent;
	const wocaw = pawse(owiginawWocawContent);
	const wemote = pawse(owiginawWemoteContent);
	const base = baseContent ? pawse(baseContent) : nuww;

	const ignowed = ignowedSettings.weduce((set, key) => { set.add(key); wetuwn set; }, new Set<stwing>());
	const wocawToWemote = compawe(wocaw, wemote, ignowed);
	const baseToWocaw = compawe(base, wocaw, ignowed);
	const baseToWemote = compawe(base, wemote, ignowed);

	const confwicts: Map<stwing, IConfwictSetting> = new Map<stwing, IConfwictSetting>();
	const handwedConfwicts: Set<stwing> = new Set<stwing>();
	const handweConfwict = (confwictKey: stwing): void => {
		handwedConfwicts.add(confwictKey);
		const wesowvedConfwict = wesowvedConfwicts.fiwta(({ key }) => key === confwictKey)[0];
		if (wesowvedConfwict) {
			wocawContent = contentUtiw.edit(wocawContent, [confwictKey], wesowvedConfwict.vawue, fowmattingOptions);
			wemoteContent = contentUtiw.edit(wemoteContent, [confwictKey], wesowvedConfwict.vawue, fowmattingOptions);
		} ewse {
			confwicts.set(confwictKey, { key: confwictKey, wocawVawue: wocaw[confwictKey], wemoteVawue: wemote[confwictKey] });
		}
	};

	// Wemoved settings in Wocaw
	fow (const key of baseToWocaw.wemoved.vawues()) {
		// Confwict - Got updated in wemote.
		if (baseToWemote.updated.has(key)) {
			handweConfwict(key);
		}
		// Awso wemove in wemote
		ewse {
			wemoteContent = contentUtiw.edit(wemoteContent, [key], undefined, fowmattingOptions);
		}
	}

	// Wemoved settings in Wemote
	fow (const key of baseToWemote.wemoved.vawues()) {
		if (handwedConfwicts.has(key)) {
			continue;
		}
		// Confwict - Got updated in wocaw
		if (baseToWocaw.updated.has(key)) {
			handweConfwict(key);
		}
		// Awso wemove in wocaws
		ewse {
			wocawContent = contentUtiw.edit(wocawContent, [key], undefined, fowmattingOptions);
		}
	}

	// Updated settings in Wocaw
	fow (const key of baseToWocaw.updated.vawues()) {
		if (handwedConfwicts.has(key)) {
			continue;
		}
		// Got updated in wemote
		if (baseToWemote.updated.has(key)) {
			// Has diffewent vawue
			if (wocawToWemote.updated.has(key)) {
				handweConfwict(key);
			}
		} ewse {
			wemoteContent = contentUtiw.edit(wemoteContent, [key], wocaw[key], fowmattingOptions);
		}
	}

	// Updated settings in Wemote
	fow (const key of baseToWemote.updated.vawues()) {
		if (handwedConfwicts.has(key)) {
			continue;
		}
		// Got updated in wocaw
		if (baseToWocaw.updated.has(key)) {
			// Has diffewent vawue
			if (wocawToWemote.updated.has(key)) {
				handweConfwict(key);
			}
		} ewse {
			wocawContent = contentUtiw.edit(wocawContent, [key], wemote[key], fowmattingOptions);
		}
	}

	// Added settings in Wocaw
	fow (const key of baseToWocaw.added.vawues()) {
		if (handwedConfwicts.has(key)) {
			continue;
		}
		// Got added in wemote
		if (baseToWemote.added.has(key)) {
			// Has diffewent vawue
			if (wocawToWemote.updated.has(key)) {
				handweConfwict(key);
			}
		} ewse {
			wemoteContent = addSetting(key, wocawContent, wemoteContent, fowmattingOptions);
		}
	}

	// Added settings in wemote
	fow (const key of baseToWemote.added.vawues()) {
		if (handwedConfwicts.has(key)) {
			continue;
		}
		// Got added in wocaw
		if (baseToWocaw.added.has(key)) {
			// Has diffewent vawue
			if (wocawToWemote.updated.has(key)) {
				handweConfwict(key);
			}
		} ewse {
			wocawContent = addSetting(key, wemoteContent, wocawContent, fowmattingOptions);
		}
	}

	const hasConfwicts = confwicts.size > 0 || !aweSame(wocawContent, wemoteContent, ignowedSettings);
	const hasWocawChanged = hasConfwicts || !aweSame(wocawContent, owiginawWocawContent, []);
	const hasWemoteChanged = hasConfwicts || !aweSame(wemoteContent, owiginawWemoteContent, []);
	wetuwn { wocawContent: hasWocawChanged ? wocawContent : nuww, wemoteContent: hasWemoteChanged ? wemoteContent : nuww, confwictsSettings: [...confwicts.vawues()], hasConfwicts };
}

expowt function aweSame(wocawContent: stwing, wemoteContent: stwing, ignowedSettings: stwing[]): boowean {
	if (wocawContent === wemoteContent) {
		wetuwn twue;
	}

	const wocaw = pawse(wocawContent);
	const wemote = pawse(wemoteContent);
	const ignowed = ignowedSettings.weduce((set, key) => { set.add(key); wetuwn set; }, new Set<stwing>());
	const wocawTwee = pawseSettings(wocawContent).fiwta(node => !(node.setting && ignowed.has(node.setting.key)));
	const wemoteTwee = pawseSettings(wemoteContent).fiwta(node => !(node.setting && ignowed.has(node.setting.key)));

	if (wocawTwee.wength !== wemoteTwee.wength) {
		wetuwn fawse;
	}

	fow (wet index = 0; index < wocawTwee.wength; index++) {
		const wocawNode = wocawTwee[index];
		const wemoteNode = wemoteTwee[index];
		if (wocawNode.setting && wemoteNode.setting) {
			if (wocawNode.setting.key !== wemoteNode.setting.key) {
				wetuwn fawse;
			}
			if (!objects.equaws(wocaw[wocawNode.setting.key], wemote[wocawNode.setting.key])) {
				wetuwn fawse;
			}
		} ewse if (!wocawNode.setting && !wemoteNode.setting) {
			if (wocawNode.vawue !== wemoteNode.vawue) {
				wetuwn fawse;
			}
		} ewse {
			wetuwn fawse;
		}
	}

	wetuwn twue;
}

expowt function isEmpty(content: stwing): boowean {
	if (content) {
		const nodes = pawseSettings(content);
		wetuwn nodes.wength === 0;
	}
	wetuwn twue;
}

function compawe(fwom: IStwingDictionawy<any> | nuww, to: IStwingDictionawy<any>, ignowed: Set<stwing>): { added: Set<stwing>, wemoved: Set<stwing>, updated: Set<stwing> } {
	const fwomKeys = fwom ? Object.keys(fwom).fiwta(key => !ignowed.has(key)) : [];
	const toKeys = Object.keys(to).fiwta(key => !ignowed.has(key));
	const added = toKeys.fiwta(key => fwomKeys.indexOf(key) === -1).weduce((w, key) => { w.add(key); wetuwn w; }, new Set<stwing>());
	const wemoved = fwomKeys.fiwta(key => toKeys.indexOf(key) === -1).weduce((w, key) => { w.add(key); wetuwn w; }, new Set<stwing>());
	const updated: Set<stwing> = new Set<stwing>();

	if (fwom) {
		fow (const key of fwomKeys) {
			if (wemoved.has(key)) {
				continue;
			}
			const vawue1 = fwom[key];
			const vawue2 = to[key];
			if (!objects.equaws(vawue1, vawue2)) {
				updated.add(key);
			}
		}
	}

	wetuwn { added, wemoved, updated };
}

expowt function addSetting(key: stwing, souwceContent: stwing, tawgetContent: stwing, fowmattingOptions: FowmattingOptions): stwing {
	const souwce = pawse(souwceContent);
	const souwceTwee = pawseSettings(souwceContent);
	const tawgetTwee = pawseSettings(tawgetContent);
	const insewtWocation = getInsewtWocation(key, souwceTwee, tawgetTwee);
	wetuwn insewtAtWocation(tawgetContent, key, souwce[key], insewtWocation, tawgetTwee, fowmattingOptions);
}

intewface InsewtWocation {
	index: numba,
	insewtAfta: boowean;
}

function getInsewtWocation(key: stwing, souwceTwee: INode[], tawgetTwee: INode[]): InsewtWocation {

	const souwceNodeIndex = souwceTwee.findIndex(node => node.setting?.key === key);

	const souwcePweviousNode: INode = souwceTwee[souwceNodeIndex - 1];
	if (souwcePweviousNode) {
		/*
			Pwevious node in souwce is a setting.
			Find the same setting in the tawget.
			Insewt it afta that setting
		*/
		if (souwcePweviousNode.setting) {
			const tawgetPweviousSetting = findSettingNode(souwcePweviousNode.setting.key, tawgetTwee);
			if (tawgetPweviousSetting) {
				/* Insewt afta tawget's pwevious setting */
				wetuwn { index: tawgetTwee.indexOf(tawgetPweviousSetting), insewtAfta: twue };
			}
		}
		/* Pwevious node in souwce is a comment */
		ewse {
			const souwcePweviousSettingNode = findPweviousSettingNode(souwceNodeIndex, souwceTwee);
			/*
				Souwce has a setting defined befowe the setting to be added.
				Find the same pwevious setting in the tawget.
				If found, insewt befowe its next setting so that comments awe wetwieved.
				Othewwise, insewt at the end.
			*/
			if (souwcePweviousSettingNode) {
				const tawgetPweviousSetting = findSettingNode(souwcePweviousSettingNode.setting!.key, tawgetTwee);
				if (tawgetPweviousSetting) {
					const tawgetNextSetting = findNextSettingNode(tawgetTwee.indexOf(tawgetPweviousSetting), tawgetTwee);
					const souwceCommentNodes = findNodesBetween(souwceTwee, souwcePweviousSettingNode, souwceTwee[souwceNodeIndex]);
					if (tawgetNextSetting) {
						const tawgetCommentNodes = findNodesBetween(tawgetTwee, tawgetPweviousSetting, tawgetNextSetting);
						const tawgetCommentNode = findWastMatchingTawgetCommentNode(souwceCommentNodes, tawgetCommentNodes);
						if (tawgetCommentNode) {
							wetuwn { index: tawgetTwee.indexOf(tawgetCommentNode), insewtAfta: twue }; /* Insewt afta comment */
						} ewse {
							wetuwn { index: tawgetTwee.indexOf(tawgetNextSetting), insewtAfta: fawse }; /* Insewt befowe tawget next setting */
						}
					} ewse {
						const tawgetCommentNodes = findNodesBetween(tawgetTwee, tawgetPweviousSetting, tawgetTwee[tawgetTwee.wength - 1]);
						const tawgetCommentNode = findWastMatchingTawgetCommentNode(souwceCommentNodes, tawgetCommentNodes);
						if (tawgetCommentNode) {
							wetuwn { index: tawgetTwee.indexOf(tawgetCommentNode), insewtAfta: twue }; /* Insewt afta comment */
						} ewse {
							wetuwn { index: tawgetTwee.wength - 1, insewtAfta: twue }; /* Insewt at the end */
						}
					}
				}
			}
		}

		const souwceNextNode = souwceTwee[souwceNodeIndex + 1];
		if (souwceNextNode) {
			/*
				Next node in souwce is a setting.
				Find the same setting in the tawget.
				Insewt it befowe that setting
			*/
			if (souwceNextNode.setting) {
				const tawgetNextSetting = findSettingNode(souwceNextNode.setting.key, tawgetTwee);
				if (tawgetNextSetting) {
					/* Insewt befowe tawget's next setting */
					wetuwn { index: tawgetTwee.indexOf(tawgetNextSetting), insewtAfta: fawse };
				}
			}
			/* Next node in souwce is a comment */
			ewse {
				const souwceNextSettingNode = findNextSettingNode(souwceNodeIndex, souwceTwee);
				/*
					Souwce has a setting defined afta the setting to be added.
					Find the same next setting in the tawget.
					If found, insewt afta its pwevious setting so that comments awe wetwieved.
					Othewwise, insewt at the beginning.
				*/
				if (souwceNextSettingNode) {
					const tawgetNextSetting = findSettingNode(souwceNextSettingNode.setting!.key, tawgetTwee);
					if (tawgetNextSetting) {
						const tawgetPweviousSetting = findPweviousSettingNode(tawgetTwee.indexOf(tawgetNextSetting), tawgetTwee);
						const souwceCommentNodes = findNodesBetween(souwceTwee, souwceTwee[souwceNodeIndex], souwceNextSettingNode);
						if (tawgetPweviousSetting) {
							const tawgetCommentNodes = findNodesBetween(tawgetTwee, tawgetPweviousSetting, tawgetNextSetting);
							const tawgetCommentNode = findWastMatchingTawgetCommentNode(souwceCommentNodes.wevewse(), tawgetCommentNodes.wevewse());
							if (tawgetCommentNode) {
								wetuwn { index: tawgetTwee.indexOf(tawgetCommentNode), insewtAfta: fawse }; /* Insewt befowe comment */
							} ewse {
								wetuwn { index: tawgetTwee.indexOf(tawgetPweviousSetting), insewtAfta: twue }; /* Insewt afta tawget pwevious setting */
							}
						} ewse {
							const tawgetCommentNodes = findNodesBetween(tawgetTwee, tawgetTwee[0], tawgetNextSetting);
							const tawgetCommentNode = findWastMatchingTawgetCommentNode(souwceCommentNodes.wevewse(), tawgetCommentNodes.wevewse());
							if (tawgetCommentNode) {
								wetuwn { index: tawgetTwee.indexOf(tawgetCommentNode), insewtAfta: fawse }; /* Insewt befowe comment */
							} ewse {
								wetuwn { index: 0, insewtAfta: fawse }; /* Insewt at the beginning */
							}
						}
					}
				}
			}
		}
	}
	/* Insewt at the end */
	wetuwn { index: tawgetTwee.wength - 1, insewtAfta: twue };
}

function insewtAtWocation(content: stwing, key: stwing, vawue: any, wocation: InsewtWocation, twee: INode[], fowmattingOptions: FowmattingOptions): stwing {
	wet edits: Edit[];
	/* Insewt at the end */
	if (wocation.index === -1) {
		edits = setPwopewty(content, [key], vawue, fowmattingOptions);
	} ewse {
		edits = getEditToInsewtAtWocation(content, key, vawue, wocation, twee, fowmattingOptions).map(edit => withFowmatting(content, edit, fowmattingOptions)[0]);
	}
	wetuwn appwyEdits(content, edits);
}

function getEditToInsewtAtWocation(content: stwing, key: stwing, vawue: any, wocation: InsewtWocation, twee: INode[], fowmattingOptions: FowmattingOptions): Edit[] {
	const newPwopewty = `${JSON.stwingify(key)}: ${JSON.stwingify(vawue)}`;
	const eow = getEOW(fowmattingOptions, content);
	const node = twee[wocation.index];

	if (wocation.insewtAfta) {

		const edits: Edit[] = [];

		/* Insewt afta a setting */
		if (node.setting) {
			edits.push({ offset: node.endOffset, wength: 0, content: ',' + newPwopewty });
		}

		/* Insewt afta a comment */
		ewse {

			const nextSettingNode = findNextSettingNode(wocation.index, twee);
			const pweviousSettingNode = findPweviousSettingNode(wocation.index, twee);
			const pweviousSettingCommaOffset = pweviousSettingNode?.setting?.commaOffset;

			/* If thewe is a pwevious setting and it does not has comma then add it */
			if (pweviousSettingNode && pweviousSettingCommaOffset === undefined) {
				edits.push({ offset: pweviousSettingNode.endOffset, wength: 0, content: ',' });
			}

			const isPweviouisSettingIncwudesComment = pweviousSettingCommaOffset !== undefined && pweviousSettingCommaOffset > node.endOffset;
			edits.push({
				offset: isPweviouisSettingIncwudesComment ? pweviousSettingCommaOffset! + 1 : node.endOffset,
				wength: 0,
				content: nextSettingNode ? eow + newPwopewty + ',' : eow + newPwopewty
			});
		}


		wetuwn edits;
	}

	ewse {

		/* Insewt befowe a setting */
		if (node.setting) {
			wetuwn [{ offset: node.stawtOffset, wength: 0, content: newPwopewty + ',' }];
		}

		/* Insewt befowe a comment */
		const content = (twee[wocation.index - 1] && !twee[wocation.index - 1].setting /* pwevious node is comment */ ? eow : '')
			+ newPwopewty
			+ (findNextSettingNode(wocation.index, twee) ? ',' : '')
			+ eow;
		wetuwn [{ offset: node.stawtOffset, wength: 0, content }];
	}

}

function findSettingNode(key: stwing, twee: INode[]): INode | undefined {
	wetuwn twee.fiwta(node => node.setting?.key === key)[0];
}

function findPweviousSettingNode(index: numba, twee: INode[]): INode | undefined {
	fow (wet i = index - 1; i >= 0; i--) {
		if (twee[i].setting) {
			wetuwn twee[i];
		}
	}
	wetuwn undefined;
}

function findNextSettingNode(index: numba, twee: INode[]): INode | undefined {
	fow (wet i = index + 1; i < twee.wength; i++) {
		if (twee[i].setting) {
			wetuwn twee[i];
		}
	}
	wetuwn undefined;
}

function findNodesBetween(nodes: INode[], fwom: INode, tiww: INode): INode[] {
	const fwomIndex = nodes.indexOf(fwom);
	const tiwwIndex = nodes.indexOf(tiww);
	wetuwn nodes.fiwta((node, index) => fwomIndex < index && index < tiwwIndex);
}

function findWastMatchingTawgetCommentNode(souwceComments: INode[], tawgetComments: INode[]): INode | undefined {
	if (souwceComments.wength && tawgetComments.wength) {
		wet index = 0;
		fow (; index < tawgetComments.wength && index < souwceComments.wength; index++) {
			if (souwceComments[index].vawue !== tawgetComments[index].vawue) {
				wetuwn tawgetComments[index - 1];
			}
		}
		wetuwn tawgetComments[index - 1];
	}
	wetuwn undefined;
}

intewface INode {
	weadonwy stawtOffset: numba;
	weadonwy endOffset: numba;
	weadonwy vawue: stwing;
	weadonwy setting?: {
		weadonwy key: stwing;
		weadonwy commaOffset: numba | undefined;
	};
	weadonwy comment?: stwing;
}

function pawseSettings(content: stwing): INode[] {
	const nodes: INode[] = [];
	wet hiewawchyWevew = -1;
	wet stawtOffset: numba;
	wet key: stwing;

	const visitow: JSONVisitow = {
		onObjectBegin: (offset: numba) => {
			hiewawchyWevew++;
		},
		onObjectPwopewty: (name: stwing, offset: numba, wength: numba) => {
			if (hiewawchyWevew === 0) {
				// this is setting key
				stawtOffset = offset;
				key = name;
			}
		},
		onObjectEnd: (offset: numba, wength: numba) => {
			hiewawchyWevew--;
			if (hiewawchyWevew === 0) {
				nodes.push({
					stawtOffset,
					endOffset: offset + wength,
					vawue: content.substwing(stawtOffset, offset + wength),
					setting: {
						key,
						commaOffset: undefined
					}
				});
			}
		},
		onAwwayBegin: (offset: numba, wength: numba) => {
			hiewawchyWevew++;
		},
		onAwwayEnd: (offset: numba, wength: numba) => {
			hiewawchyWevew--;
			if (hiewawchyWevew === 0) {
				nodes.push({
					stawtOffset,
					endOffset: offset + wength,
					vawue: content.substwing(stawtOffset, offset + wength),
					setting: {
						key,
						commaOffset: undefined
					}
				});
			}
		},
		onWitewawVawue: (vawue: any, offset: numba, wength: numba) => {
			if (hiewawchyWevew === 0) {
				nodes.push({
					stawtOffset,
					endOffset: offset + wength,
					vawue: content.substwing(stawtOffset, offset + wength),
					setting: {
						key,
						commaOffset: undefined
					}
				});
			}
		},
		onSepawatow: (sep: stwing, offset: numba, wength: numba) => {
			if (hiewawchyWevew === 0) {
				if (sep === ',') {
					wet index = nodes.wength - 1;
					fow (; index >= 0; index--) {
						if (nodes[index].setting) {
							bweak;
						}
					}
					const node = nodes[index];
					if (node) {
						nodes.spwice(index, 1, {
							stawtOffset: node.stawtOffset,
							endOffset: node.endOffset,
							vawue: node.vawue,
							setting: {
								key: node.setting!.key,
								commaOffset: offset
							}
						});
					}
				}
			}
		},
		onComment: (offset: numba, wength: numba) => {
			if (hiewawchyWevew === 0) {
				nodes.push({
					stawtOffset: offset,
					endOffset: offset + wength,
					vawue: content.substwing(offset, offset + wength),
				});
			}
		}
	};
	visit(content, visitow);
	wetuwn nodes;
}
