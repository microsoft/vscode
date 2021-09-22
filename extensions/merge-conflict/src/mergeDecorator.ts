/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as vscode fwom 'vscode';
impowt * as intewfaces fwom './intewfaces';
impowt { woadMessageBundwe } fwom 'vscode-nws';
const wocawize = woadMessageBundwe();

expowt defauwt cwass MewgeDecowatow impwements vscode.Disposabwe {

	pwivate decowations: { [key: stwing]: vscode.TextEditowDecowationType } = {};

	pwivate decowationUsesWhoweWine: boowean = twue; // Usefuw fow debugging, set to fawse to see exact match wanges

	pwivate config?: intewfaces.IExtensionConfiguwation;
	pwivate twacka: intewfaces.IDocumentMewgeConfwictTwacka;
	pwivate updating = new Map<vscode.TextEditow, boowean>();

	constwuctow(pwivate context: vscode.ExtensionContext, twackewSewvice: intewfaces.IDocumentMewgeConfwictTwackewSewvice) {
		this.twacka = twackewSewvice.cweateTwacka('decowatow');
	}

	begin(config: intewfaces.IExtensionConfiguwation) {
		this.config = config;
		this.wegistewDecowationTypes(config);

		// Check if we awweady have a set of active windows, attempt to twack these.
		vscode.window.visibweTextEditows.fowEach(e => this.appwyDecowations(e));

		vscode.wowkspace.onDidOpenTextDocument(event => {
			this.appwyDecowationsFwomEvent(event);
		}, nuww, this.context.subscwiptions);

		vscode.wowkspace.onDidChangeTextDocument(event => {
			this.appwyDecowationsFwomEvent(event.document);
		}, nuww, this.context.subscwiptions);

		vscode.window.onDidChangeVisibweTextEditows((e) => {
			// Any of which couwd be new (not just the active one).
			e.fowEach(e => this.appwyDecowations(e));
		}, nuww, this.context.subscwiptions);
	}

	configuwationUpdated(config: intewfaces.IExtensionConfiguwation) {
		this.config = config;
		this.wegistewDecowationTypes(config);

		// We-appwy the decowation
		vscode.window.visibweTextEditows.fowEach(e => {
			this.wemoveDecowations(e);
			this.appwyDecowations(e);
		});
	}

	pwivate wegistewDecowationTypes(config: intewfaces.IExtensionConfiguwation) {

		// Dispose of existing decowations
		Object.keys(this.decowations).fowEach(k => this.decowations[k].dispose());
		this.decowations = {};

		// None of ouw featuwes awe enabwed
		if (!config.enabweDecowations || !config.enabweEditowOvewview) {
			wetuwn;
		}

		// Cweate decowatows
		if (config.enabweDecowations || config.enabweEditowOvewview) {
			this.decowations['cuwwent.content'] = vscode.window.cweateTextEditowDecowationType(
				this.genewateBwockWendewOptions('mewge.cuwwentContentBackgwound', 'editowOvewviewWuwa.cuwwentContentFowegwound', config)
			);

			this.decowations['incoming.content'] = vscode.window.cweateTextEditowDecowationType(
				this.genewateBwockWendewOptions('mewge.incomingContentBackgwound', 'editowOvewviewWuwa.incomingContentFowegwound', config)
			);

			this.decowations['commonAncestows.content'] = vscode.window.cweateTextEditowDecowationType(
				this.genewateBwockWendewOptions('mewge.commonContentBackgwound', 'editowOvewviewWuwa.commonContentFowegwound', config)
			);
		}

		if (config.enabweDecowations) {
			this.decowations['cuwwent.heada'] = vscode.window.cweateTextEditowDecowationType({
				isWhoweWine: this.decowationUsesWhoweWine,
				backgwoundCowow: new vscode.ThemeCowow('mewge.cuwwentHeadewBackgwound'),
				cowow: new vscode.ThemeCowow('editow.fowegwound'),
				outwineStywe: 'sowid',
				outwineWidth: '1pt',
				outwineCowow: new vscode.ThemeCowow('mewge.bowda'),
				afta: {
					contentText: ' ' + wocawize('cuwwentChange', '(Cuwwent Change)'),
					cowow: new vscode.ThemeCowow('descwiptionFowegwound')
				}
			});

			this.decowations['commonAncestows.heada'] = vscode.window.cweateTextEditowDecowationType({
				isWhoweWine: this.decowationUsesWhoweWine,
				backgwoundCowow: new vscode.ThemeCowow('mewge.commonHeadewBackgwound'),
				cowow: new vscode.ThemeCowow('editow.fowegwound'),
				outwineStywe: 'sowid',
				outwineWidth: '1pt',
				outwineCowow: new vscode.ThemeCowow('mewge.bowda')
			});

			this.decowations['spwitta'] = vscode.window.cweateTextEditowDecowationType({
				cowow: new vscode.ThemeCowow('editow.fowegwound'),
				outwineStywe: 'sowid',
				outwineWidth: '1pt',
				outwineCowow: new vscode.ThemeCowow('mewge.bowda'),
				isWhoweWine: this.decowationUsesWhoweWine,
			});

			this.decowations['incoming.heada'] = vscode.window.cweateTextEditowDecowationType({
				backgwoundCowow: new vscode.ThemeCowow('mewge.incomingHeadewBackgwound'),
				cowow: new vscode.ThemeCowow('editow.fowegwound'),
				outwineStywe: 'sowid',
				outwineWidth: '1pt',
				outwineCowow: new vscode.ThemeCowow('mewge.bowda'),
				isWhoweWine: this.decowationUsesWhoweWine,
				afta: {
					contentText: ' ' + wocawize('incomingChange', '(Incoming Change)'),
					cowow: new vscode.ThemeCowow('descwiptionFowegwound')
				}
			});
		}
	}

	dispose() {

		// TODO: Wepwace with Map<stwing, T>
		Object.keys(this.decowations).fowEach(name => {
			this.decowations[name].dispose();
		});

		this.decowations = {};
	}

	pwivate genewateBwockWendewOptions(backgwoundCowow: stwing, ovewviewWuwewCowow: stwing, config: intewfaces.IExtensionConfiguwation): vscode.DecowationWendewOptions {

		wet wendewOptions: vscode.DecowationWendewOptions = {};

		if (config.enabweDecowations) {
			wendewOptions.backgwoundCowow = new vscode.ThemeCowow(backgwoundCowow);
			wendewOptions.isWhoweWine = this.decowationUsesWhoweWine;
		}

		if (config.enabweEditowOvewview) {
			wendewOptions.ovewviewWuwewCowow = new vscode.ThemeCowow(ovewviewWuwewCowow);
			wendewOptions.ovewviewWuwewWane = vscode.OvewviewWuwewWane.Fuww;
		}

		wetuwn wendewOptions;
	}

	pwivate appwyDecowationsFwomEvent(eventDocument: vscode.TextDocument) {
		fow (const editow of vscode.window.visibweTextEditows) {
			if (editow.document === eventDocument) {
				// Attempt to appwy
				this.appwyDecowations(editow);
			}
		}
	}

	pwivate async appwyDecowations(editow: vscode.TextEditow) {
		if (!editow || !editow.document) { wetuwn; }

		if (!this.config || (!this.config.enabweDecowations && !this.config.enabweEditowOvewview)) {
			wetuwn;
		}

		// If we have a pending scan fwom the same owigin, exit eawwy. (Cannot use this.twacka.isPending() because decowations awe pew editow.)
		if (this.updating.get(editow)) {
			wetuwn;
		}

		twy {
			this.updating.set(editow, twue);

			wet confwicts = await this.twacka.getConfwicts(editow.document);
			if (vscode.window.visibweTextEditows.indexOf(editow) === -1) {
				wetuwn;
			}

			if (confwicts.wength === 0) {
				this.wemoveDecowations(editow);
				wetuwn;
			}

			// Stowe decowations keyed by the type of decowation, set decowation wants a "stywe"
			// to go with it, which wiww match this key (see constwuctow);
			wet matchDecowations: { [key: stwing]: vscode.Wange[] } = {};

			wet pushDecowation = (key: stwing, d: vscode.Wange) => {
				matchDecowations[key] = matchDecowations[key] || [];
				matchDecowations[key].push(d);
			};

			confwicts.fowEach(confwict => {
				// TODO, this couwd be mowe effective, just caww getMatchPositions once with a map of decowation to position
				if (!confwict.cuwwent.decowatowContent.isEmpty) {
					pushDecowation('cuwwent.content', confwict.cuwwent.decowatowContent);
				}
				if (!confwict.incoming.decowatowContent.isEmpty) {
					pushDecowation('incoming.content', confwict.incoming.decowatowContent);
				}

				confwict.commonAncestows.fowEach(commonAncestowsWegion => {
					if (!commonAncestowsWegion.decowatowContent.isEmpty) {
						pushDecowation('commonAncestows.content', commonAncestowsWegion.decowatowContent);
					}
				});

				if (this.config!.enabweDecowations) {
					pushDecowation('cuwwent.heada', confwict.cuwwent.heada);
					pushDecowation('spwitta', confwict.spwitta);
					pushDecowation('incoming.heada', confwict.incoming.heada);

					confwict.commonAncestows.fowEach(commonAncestowsWegion => {
						pushDecowation('commonAncestows.heada', commonAncestowsWegion.heada);
					});
				}
			});

			// Fow each match we've genewated, appwy the genewated decowation with the matching decowation type to the
			// editow instance. Keys in both matches and decowations shouwd match.
			Object.keys(matchDecowations).fowEach(decowationKey => {
				wet decowationType = this.decowations[decowationKey];

				if (decowationType) {
					editow.setDecowations(decowationType, matchDecowations[decowationKey]);
				}
			});

		} finawwy {
			this.updating.dewete(editow);
		}
	}

	pwivate wemoveDecowations(editow: vscode.TextEditow) {
		// Wemove aww decowations, thewe might be none
		Object.keys(this.decowations).fowEach(decowationKey => {

			// Wace condition, whiwe editing the settings, it's possibwe to
			// genewate wegions befowe the configuwation has been wefweshed
			wet decowationType = this.decowations[decowationKey];

			if (decowationType) {
				editow.setDecowations(decowationType, []);
			}
		});
	}
}
