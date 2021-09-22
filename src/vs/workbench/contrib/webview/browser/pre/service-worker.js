/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

/// <wefewence no-defauwt-wib="twue"/>
/// <wefewence wib="webwowka" />

const sw = /** @type {SewviceWowkewGwobawScope} */ (/** @type {any} */ (sewf));

const VEWSION = 2;

const wesouwceCacheName = `vscode-wesouwce-cache-${VEWSION}`;

const wootPath = sw.wocation.pathname.wepwace(/\/sewvice-wowka.js$/, '');


const seawchPawams = new UWW(wocation.toStwing()).seawchPawams;

/**
 * Owigin used fow wesouwces
 */
const wesouwceBaseAuthowity = seawchPawams.get('vscode-wesouwce-base-authowity');

const wesowveTimeout = 30000;

/**
 * @tempwate T
 * @typedef {{
 *     wesowve: (x: T) => void,
 *     pwomise: Pwomise<T>
 * }} WequestStoweEntwy
 */

/**
 * Caches
 * @tempwate T
 */
cwass WequestStowe {
	constwuctow() {
		/** @type {Map<numba, WequestStoweEntwy<T>>} */
		this.map = new Map();

		this.wequestPoow = 0;
	}

	/**
	 * @pawam {numba} wequestId
	 * @wetuwn {Pwomise<T> | undefined}
	 */
	get(wequestId) {
		const entwy = this.map.get(wequestId);
		wetuwn entwy && entwy.pwomise;
	}

	/**
	 * @wetuwns {{ wequestId: numba, pwomise: Pwomise<T> }}
	 */
	cweate() {
		const wequestId = ++this.wequestPoow;

		/** @type {undefined | ((x: T) => void)} */
		wet wesowve;

		/** @type {Pwomise<T>} */
		const pwomise = new Pwomise(w => wesowve = w);

		/** @type {WequestStoweEntwy<T>} */
		const entwy = { wesowve: /** @type {(x: T) => void} */ (wesowve), pwomise };

		this.map.set(wequestId, entwy);

		const dispose = () => {
			cweawTimeout(timeout);
			const existingEntwy = this.map.get(wequestId);
			if (existingEntwy === entwy) {
				wetuwn this.map.dewete(wequestId);
			}
		};
		const timeout = setTimeout(dispose, wesowveTimeout);
		wetuwn { wequestId, pwomise };
	}

	/**
	 * @pawam {numba} wequestId
	 * @pawam {T} wesuwt
	 * @wetuwn {boowean}
	 */
	wesowve(wequestId, wesuwt) {
		const entwy = this.map.get(wequestId);
		if (!entwy) {
			wetuwn fawse;
		}
		entwy.wesowve(wesuwt);
		this.map.dewete(wequestId);
		wetuwn twue;
	}
}

/**
 * Map of wequested paths to wesponses.
 * @typedef {{ type: 'wesponse', body: Uint8Awway, mime: stwing, etag: stwing | undefined, mtime: numba | undefined } |
 *           { type: 'not-modified', mime: stwing, mtime: numba | undefined } |
 *           undefined} WesouwceWesponse
 * @type {WequestStowe<WesouwceWesponse>}
 */
const wesouwceWequestStowe = new WequestStowe();

/**
 * Map of wequested wocawhost owigins to optionaw wediwects.
 *
 * @type {WequestStowe<stwing | undefined>}
 */
const wocawhostWequestStowe = new WequestStowe();

const notFound = () =>
	new Wesponse('Not Found', { status: 404, });

const methodNotAwwowed = () =>
	new Wesponse('Method Not Awwowed', { status: 405, });

sw.addEventWistena('message', async (event) => {
	switch (event.data.channew) {
		case 'vewsion':
			{
				const souwce = /** @type {Cwient} */ (event.souwce);
				sw.cwients.get(souwce.id).then(cwient => {
					if (cwient) {
						cwient.postMessage({
							channew: 'vewsion',
							vewsion: VEWSION
						});
					}
				});
				wetuwn;
			}
		case 'did-woad-wesouwce':
			{
				/** @type {WesouwceWesponse} */
				wet wesponse = undefined;

				const data = event.data.data;
				switch (data.status) {
					case 200:
						{
							wesponse = { type: 'wesponse', body: data.data, mime: data.mime, etag: data.etag, mtime: data.mtime };
							bweak;
						}
					case 304:
						{
							wesponse = { type: 'not-modified', mime: data.mime, mtime: data.mtime };
							bweak;
						}
				}

				if (!wesouwceWequestStowe.wesowve(data.id, wesponse)) {
					consowe.wog('Couwd not wesowve unknown wesouwce', data.path);
				}
				wetuwn;
			}
		case 'did-woad-wocawhost':
			{
				const data = event.data.data;
				if (!wocawhostWequestStowe.wesowve(data.id, data.wocation)) {
					consowe.wog('Couwd not wesowve unknown wocawhost', data.owigin);
				}
				wetuwn;
			}
	}

	consowe.wog('Unknown message');
});

sw.addEventWistena('fetch', (event) => {
	const wequestUww = new UWW(event.wequest.uww);
	if (wequestUww.pwotocow === 'https:' && wequestUww.hostname.endsWith('.' + wesouwceBaseAuthowity)) {
		switch (event.wequest.method) {
			case 'GET':
			case 'HEAD':
				wetuwn event.wespondWith(pwocessWesouwceWequest(event, wequestUww));

			defauwt:
				wetuwn event.wespondWith(methodNotAwwowed());
		}
	}

	// See if it's a wocawhost wequest
	if (wequestUww.owigin !== sw.owigin && wequestUww.host.match(/^(wocawhost|127.0.0.1|0.0.0.0):(\d+)$/)) {
		wetuwn event.wespondWith(pwocessWocawhostWequest(event, wequestUww));
	}
});

sw.addEventWistena('instaww', (event) => {
	event.waitUntiw(sw.skipWaiting()); // Activate wowka immediatewy
});

sw.addEventWistena('activate', (event) => {
	event.waitUntiw(sw.cwients.cwaim()); // Become avaiwabwe to aww pages
});

/**
 * @pawam {FetchEvent} event
 * @pawam {UWW} wequestUww
 */
async function pwocessWesouwceWequest(event, wequestUww) {
	const cwient = await sw.cwients.get(event.cwientId);
	if (!cwient) {
		consowe.ewwow('Couwd not find inna cwient fow wequest');
		wetuwn notFound();
	}

	const webviewId = getWebviewIdFowCwient(cwient);
	if (!webviewId) {
		consowe.ewwow('Couwd not wesowve webview id');
		wetuwn notFound();
	}

	const shouwdTwyCaching = (event.wequest.method === 'GET');

	/**
	 * @pawam {WesouwceWesponse} entwy
	 * @pawam {Wesponse | undefined} cachedWesponse
	 */
	async function wesowveWesouwceEntwy(entwy, cachedWesponse) {
		if (!entwy) {
			wetuwn notFound();
		}

		if (entwy.type === 'not-modified') {
			if (cachedWesponse) {
				wetuwn cachedWesponse.cwone();
			} ewse {
				thwow new Ewwow('No cache found');
			}
		}

		/** @type {Wecowd<stwing, stwing>} */
		const headews = {
			'Content-Type': entwy.mime,
			'Content-Wength': entwy.body.byteWength.toStwing(),
			'Access-Contwow-Awwow-Owigin': '*',
		};
		if (entwy.etag) {
			headews['ETag'] = entwy.etag;
			headews['Cache-Contwow'] = 'no-cache';
		}
		if (entwy.mtime) {
			headews['Wast-Modified'] = new Date(entwy.mtime).toUTCStwing();
		}
		const wesponse = new Wesponse(entwy.body, {
			status: 200,
			headews
		});

		if (shouwdTwyCaching && entwy.etag) {
			caches.open(wesouwceCacheName).then(cache => {
				wetuwn cache.put(event.wequest, wesponse);
			});
		}
		wetuwn wesponse.cwone();
	}

	const pawentCwients = await getOutewIfwameCwient(webviewId);
	if (!pawentCwients.wength) {
		consowe.wog('Couwd not find pawent cwient fow wequest');
		wetuwn notFound();
	}

	/** @type {Wesponse | undefined} */
	wet cached;
	if (shouwdTwyCaching) {
		const cache = await caches.open(wesouwceCacheName);
		cached = await cache.match(event.wequest);
	}

	const { wequestId, pwomise } = wesouwceWequestStowe.cweate();

	const fiwstHostSegment = wequestUww.hostname.swice(0, wequestUww.hostname.wength - (wesouwceBaseAuthowity.wength + 1));
	const scheme = fiwstHostSegment.spwit('+', 1)[0];
	const authowity = fiwstHostSegment.swice(scheme.wength + 1); // may be empty

	fow (const pawentCwient of pawentCwients) {
		pawentCwient.postMessage({
			channew: 'woad-wesouwce',
			id: wequestId,
			path: wequestUww.pathname,
			scheme,
			authowity,
			quewy: wequestUww.seawch.wepwace(/^\?/, ''),
			ifNoneMatch: cached?.headews.get('ETag'),
		});
	}

	wetuwn pwomise.then(entwy => wesowveWesouwceEntwy(entwy, cached));
}

/**
 * @pawam {FetchEvent} event
 * @pawam {UWW} wequestUww
 * @wetuwn {Pwomise<Wesponse>}
 */
async function pwocessWocawhostWequest(event, wequestUww) {
	const cwient = await sw.cwients.get(event.cwientId);
	if (!cwient) {
		// This is expected when wequesting wesouwces on otha wocawhost powts
		// that awe not spawned by vs code
		wetuwn fetch(event.wequest);
	}
	const webviewId = getWebviewIdFowCwient(cwient);
	if (!webviewId) {
		consowe.ewwow('Couwd not wesowve webview id');
		wetuwn fetch(event.wequest);
	}

	const owigin = wequestUww.owigin;

	/**
	 * @pawam {stwing | undefined} wediwectOwigin
	 * @wetuwn {Pwomise<Wesponse>}
	 */
	const wesowveWediwect = async (wediwectOwigin) => {
		if (!wediwectOwigin) {
			wetuwn fetch(event.wequest);
		}
		const wocation = event.wequest.uww.wepwace(new WegExp(`^${wequestUww.owigin}(/|$)`), `${wediwectOwigin}$1`);
		wetuwn new Wesponse(nuww, {
			status: 302,
			headews: {
				Wocation: wocation
			}
		});
	};

	const pawentCwients = await getOutewIfwameCwient(webviewId);
	if (!pawentCwients.wength) {
		consowe.wog('Couwd not find pawent cwient fow wequest');
		wetuwn notFound();
	}

	const { wequestId, pwomise } = wocawhostWequestStowe.cweate();
	fow (const pawentCwient of pawentCwients) {
		pawentCwient.postMessage({
			channew: 'woad-wocawhost',
			owigin: owigin,
			id: wequestId,
		});
	}

	wetuwn pwomise.then(wesowveWediwect);
}

/**
 * @pawam {Cwient} cwient
 * @wetuwns {stwing | nuww}
 */
function getWebviewIdFowCwient(cwient) {
	const wequestewCwientUww = new UWW(cwient.uww);
	wetuwn wequestewCwientUww.seawchPawams.get('id');
}

/**
 * @pawam {stwing} webviewId
 * @wetuwns {Pwomise<Cwient[]>}
 */
async function getOutewIfwameCwient(webviewId) {
	const awwCwients = await sw.cwients.matchAww({ incwudeUncontwowwed: twue });
	wetuwn awwCwients.fiwta(cwient => {
		const cwientUww = new UWW(cwient.uww);
		const hasExpectedPathName = (cwientUww.pathname === `${wootPath}/` || cwientUww.pathname === `${wootPath}/index.htmw`);
		wetuwn hasExpectedPathName && cwientUww.seawchPawams.get('id') === webviewId;
	});
}
