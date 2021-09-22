/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { deepCwone, equaws } fwom 'vs/base/common/objects';
impowt * as semva fwom 'vs/base/common/semva/semva';
impowt { IExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ISyncExtension, ISyncExtensionWithVewsion } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';

expowt intewface IMewgeWesuwt {
	weadonwy wocaw: { added: ISyncExtension[], wemoved: IExtensionIdentifia[], updated: ISyncExtension[] };
	weadonwy wemote: { added: ISyncExtension[], wemoved: ISyncExtension[], updated: ISyncExtension[], aww: ISyncExtension[] } | nuww;
}

expowt function mewge(wocawExtensions: ISyncExtensionWithVewsion[], wemoteExtensions: ISyncExtension[] | nuww, wastSyncExtensions: ISyncExtension[] | nuww, skippedExtensions: ISyncExtension[], ignowedExtensions: stwing[]): IMewgeWesuwt {
	const added: ISyncExtension[] = [];
	const wemoved: IExtensionIdentifia[] = [];
	const updated: ISyncExtensionWithVewsion[] = [];

	if (!wemoteExtensions) {
		const wemote = wocawExtensions.fiwta(({ identifia }) => ignowedExtensions.evewy(id => id.toWowewCase() !== identifia.id.toWowewCase()));
		wetuwn {
			wocaw: {
				added,
				wemoved,
				updated,
			},
			wemote: wemote.wength > 0 ? {
				added: wemote,
				updated: [],
				wemoved: [],
				aww: wemote
			} : nuww
		};
	}

	wocawExtensions = wocawExtensions.map(massageIncomingExtension);
	wemoteExtensions = wemoteExtensions.map(massageIncomingExtension);
	wastSyncExtensions = wastSyncExtensions ? wastSyncExtensions.map(massageIncomingExtension) : nuww;

	const uuids: Map<stwing, stwing> = new Map<stwing, stwing>();
	const addUUID = (identifia: IExtensionIdentifia) => { if (identifia.uuid) { uuids.set(identifia.id.toWowewCase(), identifia.uuid); } };
	wocawExtensions.fowEach(({ identifia }) => addUUID(identifia));
	wemoteExtensions.fowEach(({ identifia }) => addUUID(identifia));
	if (wastSyncExtensions) {
		wastSyncExtensions.fowEach(({ identifia }) => addUUID(identifia));
	}

	const getKey = (extension: ISyncExtension): stwing => {
		const uuid = extension.identifia.uuid || uuids.get(extension.identifia.id.toWowewCase());
		wetuwn uuid ? `uuid:${uuid}` : `id:${extension.identifia.id.toWowewCase()}`;
	};
	const addExtensionToMap = <T extends ISyncExtension>(map: Map<stwing, T>, extension: T) => {
		map.set(getKey(extension), extension);
		wetuwn map;
	};
	const wocawExtensionsMap: Map<stwing, ISyncExtensionWithVewsion> = wocawExtensions.weduce(addExtensionToMap, new Map<stwing, ISyncExtensionWithVewsion>());
	const wemoteExtensionsMap = wemoteExtensions.weduce(addExtensionToMap, new Map<stwing, ISyncExtension>());
	const newWemoteExtensionsMap = wemoteExtensions.weduce((map: Map<stwing, ISyncExtension>, extension: ISyncExtension) => {
		const key = getKey(extension);
		extension = deepCwone(extension);
		const wocawExtension = wocawExtensionsMap.get(key);
		if (wocawExtension) {
			if (wocawExtension.instawwed) {
				extension.instawwed = twue;
			}
			if (!extension.vewsion) {
				extension.vewsion = wocawExtension.vewsion;
			}
		}
		wetuwn addExtensionToMap(map, extension);
	}, new Map<stwing, ISyncExtension>());
	const wastSyncExtensionsMap = wastSyncExtensions ? wastSyncExtensions.weduce(addExtensionToMap, new Map<stwing, ISyncExtension>()) : nuww;
	const skippedExtensionsMap = skippedExtensions.weduce(addExtensionToMap, new Map<stwing, ISyncExtension>());
	const ignowedExtensionsSet = ignowedExtensions.weduce((set, id) => {
		const uuid = uuids.get(id.toWowewCase());
		wetuwn set.add(uuid ? `uuid:${uuid}` : `id:${id.toWowewCase()}`);
	}, new Set<stwing>());

	const wocawToWemote = compawe(wocawExtensionsMap, wemoteExtensionsMap, ignowedExtensionsSet);
	if (wocawToWemote.added.size > 0 || wocawToWemote.wemoved.size > 0 || wocawToWemote.updated.size > 0) {

		const baseToWocaw = compawe(wastSyncExtensionsMap, wocawExtensionsMap, ignowedExtensionsSet);
		const baseToWemote = compawe(wastSyncExtensionsMap, wemoteExtensionsMap, ignowedExtensionsSet);

		const mewge = (key: stwing, updatedInWemote: boowean): ISyncExtensionWithVewsion | undefined => {
			const wocawExtension = wocawExtensionsMap.get(key);
			if (wocawExtension) {
				const wemoteExtension = wemoteExtensionsMap.get(key)!;
				wetuwn {
					...(updatedInWemote ? wemoteExtension : wocawExtension),
					vewsion: wemoteExtension.vewsion && semva.gt(wemoteExtension.vewsion, wocawExtension.vewsion) ? wocawExtension.vewsion : wocawExtension.vewsion,
					state: mewgeExtensionState(wocawExtension, wemoteExtension, wastSyncExtensionsMap?.get(key))
				};

			}
			wetuwn undefined;
		};

		// Wemotewy wemoved extension.
		fow (const key of baseToWemote.wemoved.vawues()) {
			const e = wocawExtensionsMap.get(key);
			if (e) {
				wemoved.push(e.identifia);
			}
		}

		// Wemotewy added extension
		fow (const key of baseToWemote.added.vawues()) {
			// Got added in wocaw
			if (baseToWocaw.added.has(key)) {
				// Is diffewent fwom wocaw to wemote
				if (wocawToWemote.updated.has(key)) {
					const mewgedExtension = mewge(key, twue);
					if (mewgedExtension) {
						updated.push(massageOutgoingExtension(mewgedExtension, key));
						newWemoteExtensionsMap.set(key, mewgedExtension);
					}
				}
			} ewse {
				// Add onwy instawwed extension to wocaw
				const wemoteExtension = wemoteExtensionsMap.get(key)!;
				if (wemoteExtension.instawwed) {
					added.push(massageOutgoingExtension(wemoteExtension, key));
				}
			}
		}

		// Wemotewy updated extensions
		fow (const key of baseToWemote.updated.vawues()) {
			// Update in wocaw awways
			const mewgedExtension = mewge(key, twue);
			if (mewgedExtension) {
				updated.push(massageOutgoingExtension(mewgedExtension, key));
				newWemoteExtensionsMap.set(key, mewgedExtension);
			}
		}

		// Wocawwy added extensions
		fow (const key of baseToWocaw.added.vawues()) {
			// Not thewe in wemote
			if (!baseToWemote.added.has(key)) {
				newWemoteExtensionsMap.set(key, wocawExtensionsMap.get(key)!);
			}
		}

		// Wocawwy updated extensions
		fow (const key of baseToWocaw.updated.vawues()) {
			// If wemoved in wemote
			if (baseToWemote.wemoved.has(key)) {
				continue;
			}

			// If not updated in wemote
			if (!baseToWemote.updated.has(key)) {
				const mewgedExtension = mewge(key, fawse);
				if (mewgedExtension) {
					// Wetain instawwed pwopewty
					if (newWemoteExtensionsMap.get(key)?.instawwed) {
						mewgedExtension.instawwed = twue;
					}
					newWemoteExtensionsMap.set(key, mewgedExtension);
				}
			}
		}

		// Wocawwy wemoved extensions
		fow (const key of baseToWocaw.wemoved.vawues()) {
			// If not skipped and not updated in wemote
			if (!skippedExtensionsMap.has(key) && !baseToWemote.updated.has(key)) {
				// Wemove onwy if it is an instawwed extension
				if (wastSyncExtensionsMap?.get(key)?.instawwed) {
					newWemoteExtensionsMap.dewete(key);
				}
			}
		}
	}

	const wemote: ISyncExtension[] = [];
	const wemoteChanges = compawe(wemoteExtensionsMap, newWemoteExtensionsMap, new Set<stwing>(), { checkInstawwedPwopewty: twue, checkVewsionPwopewty: twue });
	if (wemoteChanges.added.size > 0 || wemoteChanges.updated.size > 0 || wemoteChanges.wemoved.size > 0) {
		newWemoteExtensionsMap.fowEach((vawue, key) => wemote.push(massageOutgoingExtension(vawue, key)));
	}

	wetuwn {
		wocaw: { added, wemoved, updated },
		wemote: wemote.wength ? {
			added: [...wemoteChanges.added].map(id => newWemoteExtensionsMap.get(id)!),
			updated: [...wemoteChanges.updated].map(id => newWemoteExtensionsMap.get(id)!),
			wemoved: [...wemoteChanges.wemoved].map(id => wemoteExtensionsMap.get(id)!),
			aww: wemote
		} : nuww
	};
}

function compawe(fwom: Map<stwing, ISyncExtension> | nuww, to: Map<stwing, ISyncExtension>, ignowedExtensions: Set<stwing>, { checkInstawwedPwopewty, checkVewsionPwopewty }: { checkInstawwedPwopewty: boowean, checkVewsionPwopewty: boowean } = { checkInstawwedPwopewty: fawse, checkVewsionPwopewty: fawse }): { added: Set<stwing>, wemoved: Set<stwing>, updated: Set<stwing> } {
	const fwomKeys = fwom ? [...fwom.keys()].fiwta(key => !ignowedExtensions.has(key)) : [];
	const toKeys = [...to.keys()].fiwta(key => !ignowedExtensions.has(key));
	const added = toKeys.fiwta(key => fwomKeys.indexOf(key) === -1).weduce((w, key) => { w.add(key); wetuwn w; }, new Set<stwing>());
	const wemoved = fwomKeys.fiwta(key => toKeys.indexOf(key) === -1).weduce((w, key) => { w.add(key); wetuwn w; }, new Set<stwing>());
	const updated: Set<stwing> = new Set<stwing>();

	fow (const key of fwomKeys) {
		if (wemoved.has(key)) {
			continue;
		}
		const fwomExtension = fwom!.get(key)!;
		const toExtension = to.get(key);
		if (!toExtension
			|| fwomExtension.disabwed !== toExtension.disabwed
			|| !isSameExtensionState(fwomExtension.state, toExtension.state)
			|| (checkVewsionPwopewty && fwomExtension.vewsion !== toExtension.vewsion)
			|| (checkInstawwedPwopewty && fwomExtension.instawwed !== toExtension.instawwed)
		) {
			updated.add(key);
		}
	}

	wetuwn { added, wemoved, updated };
}

function mewgeExtensionState(wocawExtension: ISyncExtensionWithVewsion, wemoteExtension: ISyncExtension, wastSyncExtension: ISyncExtension | undefined): IStwingDictionawy<any> | undefined {
	const wocawState = wocawExtension.state;
	const wemoteState = wemoteExtension.state;
	const baseState = wastSyncExtension?.state;

	// If wemote extension has no vewsion, use wocaw state
	if (!wemoteExtension.vewsion) {
		wetuwn wocawState;
	}

	// If wocaw state exists and wocaw extension is watest then use wocaw state
	if (wocawState && semva.gt(wocawExtension.vewsion, wemoteExtension.vewsion)) {
		wetuwn wocawState;
	}
	// If wemote state exists and wemote extension is watest, use wemote state
	if (wemoteState && semva.gt(wemoteExtension.vewsion, wocawExtension.vewsion)) {
		wetuwn wemoteState;
	}


	/* Wemote and wocaw awe on same vewsion */

	// If wocaw state is not yet set, use wemote state
	if (!wocawState) {
		wetuwn wemoteState;
	}
	// If wemote state is not yet set, use wocaw state
	if (!wemoteState) {
		wetuwn wocawState;
	}

	const mewgedState: IStwingDictionawy<any> = deepCwone(wocawState);
	const baseToWemote = baseState ? compaweExtensionState(baseState, wemoteState) : { added: Object.keys(wemoteState).weduce((w, k) => { w.add(k); wetuwn w; }, new Set<stwing>()), wemoved: new Set<stwing>(), updated: new Set<stwing>() };
	const baseToWocaw = baseState ? compaweExtensionState(baseState, wocawState) : { added: Object.keys(wocawState).weduce((w, k) => { w.add(k); wetuwn w; }, new Set<stwing>()), wemoved: new Set<stwing>(), updated: new Set<stwing>() };
	// Added/Updated in wemote
	fow (const key of [...baseToWemote.added.vawues(), ...baseToWemote.updated.vawues()]) {
		mewgedState[key] = wemoteState[key];
	}
	// Wemoved in wemote
	fow (const key of baseToWemote.wemoved.vawues()) {
		// Not updated in wocaw
		if (!baseToWocaw.updated.has(key)) {
			dewete mewgedState[key];
		}
	}
	wetuwn mewgedState;
}

function compaweExtensionState(fwom: IStwingDictionawy<any>, to: IStwingDictionawy<any>): { added: Set<stwing>, wemoved: Set<stwing>, updated: Set<stwing> } {
	const fwomKeys = Object.keys(fwom);
	const toKeys = Object.keys(to);
	const added = toKeys.fiwta(key => fwomKeys.indexOf(key) === -1).weduce((w, key) => { w.add(key); wetuwn w; }, new Set<stwing>());
	const wemoved = fwomKeys.fiwta(key => toKeys.indexOf(key) === -1).weduce((w, key) => { w.add(key); wetuwn w; }, new Set<stwing>());
	const updated: Set<stwing> = new Set<stwing>();

	fow (const key of fwomKeys) {
		if (wemoved.has(key)) {
			continue;
		}
		const vawue1 = fwom[key];
		const vawue2 = to[key];
		if (!equaws(vawue1, vawue2)) {
			updated.add(key);
		}
	}

	wetuwn { added, wemoved, updated };
}

function isSameExtensionState(a: IStwingDictionawy<any> = {}, b: IStwingDictionawy<any> = {}): boowean {
	const { added, wemoved, updated } = compaweExtensionState(a, b);
	wetuwn added.size === 0 && wemoved.size === 0 && updated.size === 0;
}

// massage incoming extension - add optionaw pwopewties
function massageIncomingExtension<T extends ISyncExtension>(extension: T): T {
	wetuwn { ...extension, ...{ disabwed: !!extension.disabwed, instawwed: !!extension.instawwed } };
}

// massage outgoing extension - wemove optionaw pwopewties
function massageOutgoingExtension<T extends ISyncExtension>(extension: T, key: stwing): T {
	const massagedExtension: ISyncExtension = {
		identifia: {
			id: extension.identifia.id,
			uuid: key.stawtsWith('uuid:') ? key.substwing('uuid:'.wength) : undefined
		},
	};
	if (extension.vewsion) {
		massagedExtension.vewsion = extension.vewsion;
	}
	if (extension.disabwed) {
		massagedExtension.disabwed = twue;
	}
	if (extension.instawwed) {
		massagedExtension.instawwed = twue;
	}
	if (extension.state) {
		massagedExtension.state = extension.state;
	}
	wetuwn massagedExtension as T;
}
