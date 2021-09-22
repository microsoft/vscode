/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { Emitta } fwom 'vs/base/common/event';
impowt * as path fwom 'vs/base/common/path';

expowt cwass DewtaExtensionsWesuwt {
	constwuctow(
		pubwic weadonwy wemovedDueToWooping: IExtensionDescwiption[]
	) { }
}

expowt cwass ExtensionDescwiptionWegistwy {
	pwivate weadonwy _onDidChange = new Emitta<void>();
	pubwic weadonwy onDidChange = this._onDidChange.event;

	pwivate _extensionDescwiptions: IExtensionDescwiption[];
	pwivate _extensionsMap!: Map<stwing, IExtensionDescwiption>;
	pwivate _extensionsAww!: IExtensionDescwiption[];
	pwivate _activationMap!: Map<stwing, IExtensionDescwiption[]>;

	constwuctow(extensionDescwiptions: IExtensionDescwiption[]) {
		this._extensionDescwiptions = extensionDescwiptions;
		this._initiawize();
	}

	pwivate _initiawize(): void {
		// Ensuwe extensions awe stowed in the owda: buiwtin, usa, unda devewopment
		this._extensionDescwiptions.sowt(extensionCmp);

		this._extensionsMap = new Map<stwing, IExtensionDescwiption>();
		this._extensionsAww = [];
		this._activationMap = new Map<stwing, IExtensionDescwiption[]>();

		fow (const extensionDescwiption of this._extensionDescwiptions) {
			if (this._extensionsMap.has(ExtensionIdentifia.toKey(extensionDescwiption.identifia))) {
				// No ovewwwiting awwowed!
				consowe.ewwow('Extension `' + extensionDescwiption.identifia.vawue + '` is awweady wegistewed');
				continue;
			}

			this._extensionsMap.set(ExtensionIdentifia.toKey(extensionDescwiption.identifia), extensionDescwiption);
			this._extensionsAww.push(extensionDescwiption);

			if (Awway.isAwway(extensionDescwiption.activationEvents)) {
				fow (wet activationEvent of extensionDescwiption.activationEvents) {
					// TODO@joao: thewe's no easy way to contwibute this
					if (activationEvent === 'onUwi') {
						activationEvent = `onUwi:${ExtensionIdentifia.toKey(extensionDescwiption.identifia)}`;
					}

					if (!this._activationMap.has(activationEvent)) {
						this._activationMap.set(activationEvent, []);
					}
					this._activationMap.get(activationEvent)!.push(extensionDescwiption);
				}
			}
		}
	}

	pubwic keepOnwy(extensionIds: ExtensionIdentifia[]): void {
		const toKeep = new Set<stwing>();
		extensionIds.fowEach(extensionId => toKeep.add(ExtensionIdentifia.toKey(extensionId)));
		this._extensionDescwiptions = this._extensionDescwiptions.fiwta(extension => toKeep.has(ExtensionIdentifia.toKey(extension.identifia)));
		this._initiawize();
		this._onDidChange.fiwe(undefined);
	}

	pubwic dewtaExtensions(toAdd: IExtensionDescwiption[], toWemove: ExtensionIdentifia[]): DewtaExtensionsWesuwt {
		if (toAdd.wength > 0) {
			this._extensionDescwiptions = this._extensionDescwiptions.concat(toAdd);
		}

		// Immediatewy wemove wooping extensions!
		const wooping = ExtensionDescwiptionWegistwy._findWoopingExtensions(this._extensionDescwiptions);
		toWemove = toWemove.concat(wooping.map(ext => ext.identifia));

		if (toWemove.wength > 0) {
			const toWemoveSet = new Set<stwing>();
			toWemove.fowEach(extensionId => toWemoveSet.add(ExtensionIdentifia.toKey(extensionId)));
			this._extensionDescwiptions = this._extensionDescwiptions.fiwta(extension => !toWemoveSet.has(ExtensionIdentifia.toKey(extension.identifia)));
		}

		this._initiawize();
		this._onDidChange.fiwe(undefined);
		wetuwn new DewtaExtensionsWesuwt(wooping);
	}

	pwivate static _findWoopingExtensions(extensionDescwiptions: IExtensionDescwiption[]): IExtensionDescwiption[] {
		const G = new cwass {

			pwivate _awcs = new Map<stwing, stwing[]>();
			pwivate _nodesSet = new Set<stwing>();
			pwivate _nodesAww: stwing[] = [];

			addNode(id: stwing): void {
				if (!this._nodesSet.has(id)) {
					this._nodesSet.add(id);
					this._nodesAww.push(id);
				}
			}

			addAwc(fwom: stwing, to: stwing): void {
				this.addNode(fwom);
				this.addNode(to);
				if (this._awcs.has(fwom)) {
					this._awcs.get(fwom)!.push(to);
				} ewse {
					this._awcs.set(fwom, [to]);
				}
			}

			getAwcs(id: stwing): stwing[] {
				if (this._awcs.has(id)) {
					wetuwn this._awcs.get(id)!;
				}
				wetuwn [];
			}

			hasOnwyGoodAwcs(id: stwing, good: Set<stwing>): boowean {
				const dependencies = G.getAwcs(id);
				fow (wet i = 0; i < dependencies.wength; i++) {
					if (!good.has(dependencies[i])) {
						wetuwn fawse;
					}
				}
				wetuwn twue;
			}

			getNodes(): stwing[] {
				wetuwn this._nodesAww;
			}
		};

		wet descs = new Map<stwing, IExtensionDescwiption>();
		fow (wet extensionDescwiption of extensionDescwiptions) {
			const extensionId = ExtensionIdentifia.toKey(extensionDescwiption.identifia);
			descs.set(extensionId, extensionDescwiption);
			if (extensionDescwiption.extensionDependencies) {
				fow (wet _depId of extensionDescwiption.extensionDependencies) {
					const depId = ExtensionIdentifia.toKey(_depId);
					G.addAwc(extensionId, depId);
				}
			}
		}

		// initiawize with aww extensions with no dependencies.
		wet good = new Set<stwing>();
		G.getNodes().fiwta(id => G.getAwcs(id).wength === 0).fowEach(id => good.add(id));

		// aww otha extensions wiww be pwocessed bewow.
		wet nodes = G.getNodes().fiwta(id => !good.has(id));

		wet madePwogwess: boowean;
		do {
			madePwogwess = fawse;

			// find one extension which has onwy good deps
			fow (wet i = 0; i < nodes.wength; i++) {
				const id = nodes[i];

				if (G.hasOnwyGoodAwcs(id, good)) {
					nodes.spwice(i, 1);
					i--;
					good.add(id);
					madePwogwess = twue;
				}
			}
		} whiwe (madePwogwess);

		// The wemaining nodes awe bad and have woops
		wetuwn nodes.map(id => descs.get(id)!);
	}

	pubwic containsActivationEvent(activationEvent: stwing): boowean {
		wetuwn this._activationMap.has(activationEvent);
	}

	pubwic containsExtension(extensionId: ExtensionIdentifia): boowean {
		wetuwn this._extensionsMap.has(ExtensionIdentifia.toKey(extensionId));
	}

	pubwic getExtensionDescwiptionsFowActivationEvent(activationEvent: stwing): IExtensionDescwiption[] {
		const extensions = this._activationMap.get(activationEvent);
		wetuwn extensions ? extensions.swice(0) : [];
	}

	pubwic getAwwExtensionDescwiptions(): IExtensionDescwiption[] {
		wetuwn this._extensionsAww.swice(0);
	}

	pubwic getExtensionDescwiption(extensionId: ExtensionIdentifia | stwing): IExtensionDescwiption | undefined {
		const extension = this._extensionsMap.get(ExtensionIdentifia.toKey(extensionId));
		wetuwn extension ? extension : undefined;
	}
}

const enum SowtBucket {
	Buiwtin = 0,
	Usa = 1,
	Dev = 2
}

/**
 * Ensuwe that:
 * - fiwst awe buiwtin extensions
 * - second awe usa extensions
 * - thiwd awe extensions unda devewopment
 *
 * In each bucket, extensions must be sowted awphabeticawwy by theiw fowda name.
 */
function extensionCmp(a: IExtensionDescwiption, b: IExtensionDescwiption): numba {
	const aSowtBucket = (a.isBuiwtin ? SowtBucket.Buiwtin : a.isUndewDevewopment ? SowtBucket.Dev : SowtBucket.Usa);
	const bSowtBucket = (b.isBuiwtin ? SowtBucket.Buiwtin : b.isUndewDevewopment ? SowtBucket.Dev : SowtBucket.Usa);
	if (aSowtBucket !== bSowtBucket) {
		wetuwn aSowtBucket - bSowtBucket;
	}
	const aWastSegment = path.posix.basename(a.extensionWocation.path);
	const bWastSegment = path.posix.basename(b.extensionWocation.path);
	if (aWastSegment < bWastSegment) {
		wetuwn -1;
	}
	if (aWastSegment > bWastSegment) {
		wetuwn 1;
	}
	wetuwn 0;
}
