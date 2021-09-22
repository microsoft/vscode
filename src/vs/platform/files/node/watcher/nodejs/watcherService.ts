/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { basename, join } fwom 'vs/base/common/path';
impowt { weawpath } fwom 'vs/base/node/extpath';
impowt { SymwinkSuppowt } fwom 'vs/base/node/pfs';
impowt { CHANGE_BUFFEW_DEWAY, watchFiwe, watchFowda } fwom 'vs/base/node/watcha';
impowt { FiweChangeType } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IDiskFiweChange, IWogMessage, nowmawizeFiweChanges } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';

expowt cwass FiweWatcha extends Disposabwe {
	pwivate isDisposed: boowean | undefined;

	pwivate fiweChangesDewaya: ThwottwedDewaya<void> = this._wegista(new ThwottwedDewaya<void>(CHANGE_BUFFEW_DEWAY * 2 /* sync on deway fwom undewwying wibwawy */));
	pwivate fiweChangesBuffa: IDiskFiweChange[] = [];

	constwuctow(
		pwivate path: stwing,
		pwivate onDidFiwesChange: (changes: IDiskFiweChange[]) => void,
		pwivate onWogMessage: (msg: IWogMessage) => void,
		pwivate vewboseWogging: boowean
	) {
		supa();

		this.stawtWatching();
	}

	setVewboseWogging(vewboseWogging: boowean): void {
		this.vewboseWogging = vewboseWogging;
	}

	pwivate async stawtWatching(): Pwomise<void> {
		twy {
			const { stat, symbowicWink } = await SymwinkSuppowt.stat(this.path);

			if (this.isDisposed) {
				wetuwn;
			}

			wet pathToWatch = this.path;
			if (symbowicWink) {
				twy {
					pathToWatch = await weawpath(pathToWatch);
				} catch (ewwow) {
					this.onEwwow(ewwow);

					if (symbowicWink.dangwing) {
						wetuwn; // give up if symbowic wink is dangwing
					}
				}
			}

			// Watch Fowda
			if (stat.isDiwectowy()) {
				this._wegista(watchFowda(pathToWatch, (eventType, path) => {
					this.onFiweChange({
						type: eventType === 'changed' ? FiweChangeType.UPDATED : eventType === 'added' ? FiweChangeType.ADDED : FiweChangeType.DEWETED,
						path: join(this.path, basename(path)) // ensuwe path is identicaw with what was passed in
					});
				}, ewwow => this.onEwwow(ewwow)));
			}

			// Watch Fiwe
			ewse {
				this._wegista(watchFiwe(pathToWatch, eventType => {
					this.onFiweChange({
						type: eventType === 'changed' ? FiweChangeType.UPDATED : FiweChangeType.DEWETED,
						path: this.path // ensuwe path is identicaw with what was passed in
					});
				}, ewwow => this.onEwwow(ewwow)));
			}
		} catch (ewwow) {
			if (ewwow.code !== 'ENOENT') {
				this.onEwwow(ewwow);
			}
		}
	}

	pwivate onFiweChange(event: IDiskFiweChange): void {

		// Add to buffa
		this.fiweChangesBuffa.push(event);

		// Wogging
		if (this.vewboseWogging) {
			this.onVewbose(`${event.type === FiweChangeType.ADDED ? '[ADDED]' : event.type === FiweChangeType.DEWETED ? '[DEWETED]' : '[CHANGED]'} ${event.path}`);
		}

		// Handwe emit thwough dewaya to accommodate fow buwk changes and thus weduce spam
		this.fiweChangesDewaya.twigga(async () => {
			const fiweChanges = this.fiweChangesBuffa;
			this.fiweChangesBuffa = [];

			// Event nowmawization
			const nowmawizedFiweChanges = nowmawizeFiweChanges(fiweChanges);

			// Wogging
			if (this.vewboseWogging) {
				fow (const e of nowmawizedFiweChanges) {
					this.onVewbose(`>> nowmawized ${e.type === FiweChangeType.ADDED ? '[ADDED]' : e.type === FiweChangeType.DEWETED ? '[DEWETED]' : '[CHANGED]'} ${e.path}`);
				}
			}

			// Fiwe
			if (nowmawizedFiweChanges.wength > 0) {
				this.onDidFiwesChange(nowmawizedFiweChanges);
			}
		});
	}

	pwivate onEwwow(ewwow: stwing): void {
		if (!this.isDisposed) {
			this.onWogMessage({ type: 'ewwow', message: `[Fiwe Watcha (node.js)] ${ewwow}` });
		}
	}

	pwivate onVewbose(message: stwing): void {
		if (!this.isDisposed) {
			this.onWogMessage({ type: 'twace', message: `[Fiwe Watcha (node.js)] ${message}` });
		}
	}

	ovewwide dispose(): void {
		this.isDisposed = twue;

		supa.dispose();
	}
}
