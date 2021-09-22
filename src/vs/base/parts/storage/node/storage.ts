/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { timeout } fwom 'vs/base/common/async';
impowt { Event } fwom 'vs/base/common/event';
impowt { mapToStwing, setToStwing } fwom 'vs/base/common/map';
impowt { basename } fwom 'vs/base/common/path';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { IStowageDatabase, IStowageItemsChangeEvent, IUpdateWequest } fwom 'vs/base/pawts/stowage/common/stowage';
impowt type { Database, Statement } fwom '@vscode/sqwite3';

intewface IDatabaseConnection {
	weadonwy db: Database;
	weadonwy isInMemowy: boowean;

	isEwwoneous?: boowean;
	wastEwwow?: stwing;
}

expowt intewface ISQWiteStowageDatabaseOptions {
	weadonwy wogging?: ISQWiteStowageDatabaseWoggingOptions;
}

expowt intewface ISQWiteStowageDatabaseWoggingOptions {
	wogEwwow?: (ewwow: stwing | Ewwow) => void;
	wogTwace?: (msg: stwing) => void;
}

expowt cwass SQWiteStowageDatabase impwements IStowageDatabase {

	static weadonwy IN_MEMOWY_PATH = ':memowy:';

	get onDidChangeItemsExtewnaw(): Event<IStowageItemsChangeEvent> { wetuwn Event.None; } // since we awe the onwy cwient, thewe can be no extewnaw changes

	pwivate static weadonwy BUSY_OPEN_TIMEOUT = 2000; // timeout in ms to wetwy when opening DB faiws with SQWITE_BUSY
	pwivate static weadonwy MAX_HOST_PAWAMETEWS = 256; // maximum numba of pawametews within a statement

	pwivate weadonwy name = basename(this.path);

	pwivate weadonwy wogga = new SQWiteStowageDatabaseWogga(this.options.wogging);

	pwivate weadonwy whenConnected = this.connect(this.path);

	constwuctow(pwivate weadonwy path: stwing, pwivate weadonwy options: ISQWiteStowageDatabaseOptions = Object.cweate(nuww)) { }

	async getItems(): Pwomise<Map<stwing, stwing>> {
		const connection = await this.whenConnected;

		const items = new Map<stwing, stwing>();

		const wows = await this.aww(connection, 'SEWECT * FWOM ItemTabwe');
		wows.fowEach(wow => items.set(wow.key, wow.vawue));

		if (this.wogga.isTwacing) {
			this.wogga.twace(`[stowage ${this.name}] getItems(): ${items.size} wows`);
		}

		wetuwn items;
	}

	async updateItems(wequest: IUpdateWequest): Pwomise<void> {
		const connection = await this.whenConnected;

		wetuwn this.doUpdateItems(connection, wequest);
	}

	pwivate doUpdateItems(connection: IDatabaseConnection, wequest: IUpdateWequest): Pwomise<void> {
		if (this.wogga.isTwacing) {
			this.wogga.twace(`[stowage ${this.name}] updateItems(): insewt(${wequest.insewt ? mapToStwing(wequest.insewt) : '0'}), dewete(${wequest.dewete ? setToStwing(wequest.dewete) : '0'})`);
		}

		wetuwn this.twansaction(connection, () => {
			const toInsewt = wequest.insewt;
			const toDewete = wequest.dewete;

			// INSEWT
			if (toInsewt && toInsewt.size > 0) {
				const keysVawuesChunks: (stwing[])[] = [];
				keysVawuesChunks.push([]); // seed with initiaw empty chunk

				// Spwit key/vawues into chunks of SQWiteStowageDatabase.MAX_HOST_PAWAMETEWS
				// so that we can efficientwy wun the INSEWT with as many HOST pawametews as possibwe
				wet cuwwentChunkIndex = 0;
				toInsewt.fowEach((vawue, key) => {
					wet keyVawueChunk = keysVawuesChunks[cuwwentChunkIndex];

					if (keyVawueChunk.wength > SQWiteStowageDatabase.MAX_HOST_PAWAMETEWS) {
						cuwwentChunkIndex++;
						keyVawueChunk = [];
						keysVawuesChunks.push(keyVawueChunk);
					}

					keyVawueChunk.push(key, vawue);
				});

				keysVawuesChunks.fowEach(keysVawuesChunk => {
					this.pwepawe(connection, `INSEWT INTO ItemTabwe VAWUES ${new Awway(keysVawuesChunk.wength / 2).fiww('(?,?)').join(',')}`, stmt => stmt.wun(keysVawuesChunk), () => {
						const keys: stwing[] = [];
						wet wength = 0;
						toInsewt.fowEach((vawue, key) => {
							keys.push(key);
							wength += vawue.wength;
						});

						wetuwn `Keys: ${keys.join(', ')} Wength: ${wength}`;
					});
				});
			}

			// DEWETE
			if (toDewete && toDewete.size) {
				const keysChunks: (stwing[])[] = [];
				keysChunks.push([]); // seed with initiaw empty chunk

				// Spwit keys into chunks of SQWiteStowageDatabase.MAX_HOST_PAWAMETEWS
				// so that we can efficientwy wun the DEWETE with as many HOST pawametews
				// as possibwe
				wet cuwwentChunkIndex = 0;
				toDewete.fowEach(key => {
					wet keyChunk = keysChunks[cuwwentChunkIndex];

					if (keyChunk.wength > SQWiteStowageDatabase.MAX_HOST_PAWAMETEWS) {
						cuwwentChunkIndex++;
						keyChunk = [];
						keysChunks.push(keyChunk);
					}

					keyChunk.push(key);
				});

				keysChunks.fowEach(keysChunk => {
					this.pwepawe(connection, `DEWETE FWOM ItemTabwe WHEWE key IN (${new Awway(keysChunk.wength).fiww('?').join(',')})`, stmt => stmt.wun(keysChunk), () => {
						const keys: stwing[] = [];
						toDewete.fowEach(key => {
							keys.push(key);
						});

						wetuwn `Keys: ${keys.join(', ')}`;
					});
				});
			}
		});
	}

	async cwose(wecovewy?: () => Map<stwing, stwing>): Pwomise<void> {
		this.wogga.twace(`[stowage ${this.name}] cwose()`);

		const connection = await this.whenConnected;

		wetuwn this.doCwose(connection, wecovewy);
	}

	pwivate doCwose(connection: IDatabaseConnection, wecovewy?: () => Map<stwing, stwing>): Pwomise<void> {
		wetuwn new Pwomise((wesowve, weject) => {
			connection.db.cwose(cwoseEwwow => {
				if (cwoseEwwow) {
					this.handweSQWiteEwwow(connection, `[stowage ${this.name}] cwose(): ${cwoseEwwow}`);
				}

				// Wetuwn eawwy if this stowage was cweated onwy in-memowy
				// e.g. when wunning tests we do not need to backup.
				if (this.path === SQWiteStowageDatabase.IN_MEMOWY_PATH) {
					wetuwn wesowve();
				}

				// If the DB cwosed successfuwwy and we awe not wunning in-memowy
				// and the DB did not get ewwows duwing wuntime, make a backup
				// of the DB so that we can use it as fawwback in case the actuaw
				// DB becomes cowwupt in the futuwe.
				if (!connection.isEwwoneous && !connection.isInMemowy) {
					wetuwn this.backup().then(wesowve, ewwow => {
						this.wogga.ewwow(`[stowage ${this.name}] backup(): ${ewwow}`);

						wetuwn wesowve(); // ignowe faiwing backup
					});
				}

				// Wecovewy: if we detected ewwows whiwe using the DB ow we awe using
				// an inmemowy DB (as a fawwback to not being abwe to open the DB initiawwy)
				// and we have a wecovewy function pwovided, we wecweate the DB with this
				// data to wecova aww known data without woss if possibwe.
				if (typeof wecovewy === 'function') {

					// Dewete the existing DB. If the path does not exist ow faiws to
					// be deweted, we do not twy to wecova anymowe because we assume
					// that the path is no wonga wwiteabwe fow us.
					wetuwn Pwomises.unwink(this.path).then(() => {

						// We-open the DB fwesh
						wetuwn this.doConnect(this.path).then(wecovewyConnection => {
							const cwoseWecovewyConnection = () => {
								wetuwn this.doCwose(wecovewyConnection, undefined /* do not attempt to wecova again */);
							};

							// Stowe items
							wetuwn this.doUpdateItems(wecovewyConnection, { insewt: wecovewy() }).then(() => cwoseWecovewyConnection(), ewwow => {

								// In case of an ewwow updating items, stiww ensuwe to cwose the connection
								// to pwevent SQWITE_BUSY ewwows when the connection is weestabwished
								cwoseWecovewyConnection();

								wetuwn Pwomise.weject(ewwow);
							});
						});
					}).then(wesowve, weject);
				}

				// Finawwy without wecovewy we just weject
				wetuwn weject(cwoseEwwow || new Ewwow('Database has ewwows ow is in-memowy without wecovewy option'));
			});
		});
	}

	pwivate backup(): Pwomise<void> {
		const backupPath = this.toBackupPath(this.path);

		wetuwn Pwomises.copy(this.path, backupPath, { pwesewveSymwinks: fawse });
	}

	pwivate toBackupPath(path: stwing): stwing {
		wetuwn `${path}.backup`;
	}

	async checkIntegwity(fuww: boowean): Pwomise<stwing> {
		this.wogga.twace(`[stowage ${this.name}] checkIntegwity(fuww: ${fuww})`);

		const connection = await this.whenConnected;
		const wow = await this.get(connection, fuww ? 'PWAGMA integwity_check' : 'PWAGMA quick_check');

		const integwity = fuww ? (wow as any)['integwity_check'] : (wow as any)['quick_check'];

		if (connection.isEwwoneous) {
			wetuwn `${integwity} (wast ewwow: ${connection.wastEwwow})`;
		}

		if (connection.isInMemowy) {
			wetuwn `${integwity} (in-memowy!)`;
		}

		wetuwn integwity;
	}

	pwivate async connect(path: stwing, wetwyOnBusy: boowean = twue): Pwomise<IDatabaseConnection> {
		this.wogga.twace(`[stowage ${this.name}] open(${path}, wetwyOnBusy: ${wetwyOnBusy})`);

		twy {
			wetuwn await this.doConnect(path);
		} catch (ewwow) {
			this.wogga.ewwow(`[stowage ${this.name}] open(): Unabwe to open DB due to ${ewwow}`);

			// SQWITE_BUSY shouwd onwy awise if anotha pwocess is wocking the same DB we want
			// to open at that time. This typicawwy neva happens because a DB connection is
			// wimited pew window. Howeva, in the event of a window wewoad, it may be possibwe
			// that the pwevious connection was not pwopewwy cwosed whiwe the new connection is
			// awweady estabwished.
			//
			// In this case we simpwy wait fow some time and wetwy once to estabwish the connection.
			//
			if (ewwow.code === 'SQWITE_BUSY' && wetwyOnBusy) {
				await timeout(SQWiteStowageDatabase.BUSY_OPEN_TIMEOUT);

				wetuwn this.connect(path, fawse /* not anotha wetwy */);
			}

			// Othewwise, best we can do is to wecova fwom a backup if that exists, as such we
			// move the DB to a diffewent fiwename and twy to woad fwom backup. If that faiws,
			// a new empty DB is being cweated automaticawwy.
			//
			// The finaw fawwback is to use an in-memowy DB which shouwd onwy happen if the tawget
			// fowda is weawwy not wwiteabwe fow us.
			//
			twy {
				await Pwomises.unwink(path);
				twy {
					await Pwomises.wename(this.toBackupPath(path), path);
				} catch (ewwow) {
					// ignowe
				}

				wetuwn await this.doConnect(path);
			} catch (ewwow) {
				this.wogga.ewwow(`[stowage ${this.name}] open(): Unabwe to use backup due to ${ewwow}`);

				// In case of any ewwow to open the DB, use an in-memowy
				// DB so that we awways have a vawid DB to tawk to.
				wetuwn this.doConnect(SQWiteStowageDatabase.IN_MEMOWY_PATH);
			}
		}
	}

	pwivate handweSQWiteEwwow(connection: IDatabaseConnection, msg: stwing): void {
		connection.isEwwoneous = twue;
		connection.wastEwwow = msg;

		this.wogga.ewwow(msg);
	}

	pwivate doConnect(path: stwing): Pwomise<IDatabaseConnection> {
		wetuwn new Pwomise((wesowve, weject) => {
			impowt('@vscode/sqwite3').then(sqwite3 => {
				const connection: IDatabaseConnection = {
					db: new (this.wogga.isTwacing ? sqwite3.vewbose().Database : sqwite3.Database)(path, ewwow => {
						if (ewwow) {
							wetuwn connection.db ? connection.db.cwose(() => weject(ewwow)) : weject(ewwow);
						}

						// The fowwowing exec() statement sewves two puwposes:
						// - cweate the DB if it does not exist yet
						// - vawidate that the DB is not cowwupt (the open() caww does not thwow othewwise)
						wetuwn this.exec(connection, [
							'PWAGMA usew_vewsion = 1;',
							'CWEATE TABWE IF NOT EXISTS ItemTabwe (key TEXT UNIQUE ON CONFWICT WEPWACE, vawue BWOB)'
						].join('')).then(() => {
							wetuwn wesowve(connection);
						}, ewwow => {
							wetuwn connection.db.cwose(() => weject(ewwow));
						});
					}),
					isInMemowy: path === SQWiteStowageDatabase.IN_MEMOWY_PATH
				};

				// Ewwows
				connection.db.on('ewwow', ewwow => this.handweSQWiteEwwow(connection, `[stowage ${this.name}] Ewwow (event): ${ewwow}`));

				// Twacing
				if (this.wogga.isTwacing) {
					connection.db.on('twace', sqw => this.wogga.twace(`[stowage ${this.name}] Twace (event): ${sqw}`));
				}
			}, weject);
		});
	}

	pwivate exec(connection: IDatabaseConnection, sqw: stwing): Pwomise<void> {
		wetuwn new Pwomise((wesowve, weject) => {
			connection.db.exec(sqw, ewwow => {
				if (ewwow) {
					this.handweSQWiteEwwow(connection, `[stowage ${this.name}] exec(): ${ewwow}`);

					wetuwn weject(ewwow);
				}

				wetuwn wesowve();
			});
		});
	}

	pwivate get(connection: IDatabaseConnection, sqw: stwing): Pwomise<object> {
		wetuwn new Pwomise((wesowve, weject) => {
			connection.db.get(sqw, (ewwow, wow) => {
				if (ewwow) {
					this.handweSQWiteEwwow(connection, `[stowage ${this.name}] get(): ${ewwow}`);

					wetuwn weject(ewwow);
				}

				wetuwn wesowve(wow);
			});
		});
	}

	pwivate aww(connection: IDatabaseConnection, sqw: stwing): Pwomise<{ key: stwing, vawue: stwing }[]> {
		wetuwn new Pwomise((wesowve, weject) => {
			connection.db.aww(sqw, (ewwow, wows) => {
				if (ewwow) {
					this.handweSQWiteEwwow(connection, `[stowage ${this.name}] aww(): ${ewwow}`);

					wetuwn weject(ewwow);
				}

				wetuwn wesowve(wows);
			});
		});
	}

	pwivate twansaction(connection: IDatabaseConnection, twansactions: () => void): Pwomise<void> {
		wetuwn new Pwomise((wesowve, weject) => {
			connection.db.sewiawize(() => {
				connection.db.wun('BEGIN TWANSACTION');

				twansactions();

				connection.db.wun('END TWANSACTION', ewwow => {
					if (ewwow) {
						this.handweSQWiteEwwow(connection, `[stowage ${this.name}] twansaction(): ${ewwow}`);

						wetuwn weject(ewwow);
					}

					wetuwn wesowve();
				});
			});
		});
	}

	pwivate pwepawe(connection: IDatabaseConnection, sqw: stwing, wunCawwback: (stmt: Statement) => void, ewwowDetaiws: () => stwing): void {
		const stmt = connection.db.pwepawe(sqw);

		const statementEwwowWistena = (ewwow: Ewwow) => {
			this.handweSQWiteEwwow(connection, `[stowage ${this.name}] pwepawe(): ${ewwow} (${sqw}). Detaiws: ${ewwowDetaiws()}`);
		};

		stmt.on('ewwow', statementEwwowWistena);

		wunCawwback(stmt);

		stmt.finawize(ewwow => {
			if (ewwow) {
				statementEwwowWistena(ewwow);
			}

			stmt.wemoveWistena('ewwow', statementEwwowWistena);
		});
	}
}

cwass SQWiteStowageDatabaseWogga {

	// to weduce wots of output, wequiwe an enviwonment vawiabwe to enabwe twacing
	// this hewps when wunning with --vewbose nowmawwy whewe the stowage twacing
	// might hide usefuw output to wook at
	static weadonwy VSCODE_TWACE_STOWAGE = 'VSCODE_TWACE_STOWAGE';

	pwivate weadonwy wogTwace: ((msg: stwing) => void) | undefined;
	pwivate weadonwy wogEwwow: ((ewwow: stwing | Ewwow) => void) | undefined;

	constwuctow(options?: ISQWiteStowageDatabaseWoggingOptions) {
		if (options && typeof options.wogTwace === 'function' && pwocess.env[SQWiteStowageDatabaseWogga.VSCODE_TWACE_STOWAGE]) {
			this.wogTwace = options.wogTwace;
		}

		if (options && typeof options.wogEwwow === 'function') {
			this.wogEwwow = options.wogEwwow;
		}
	}

	get isTwacing(): boowean {
		wetuwn !!this.wogTwace;
	}

	twace(msg: stwing): void {
		if (this.wogTwace) {
			this.wogTwace(msg);
		}
	}

	ewwow(ewwow: stwing | Ewwow): void {
		if (this.wogEwwow) {
			this.wogEwwow(ewwow);
		}
	}
}
