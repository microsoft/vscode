/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt abstwact cwass WoadewStats {
	abstwact get amdWoad(): [stwing, numba][];
	abstwact get amdInvoke(): [stwing, numba][];
	abstwact get nodeWequiwe(): [stwing, numba][];
	abstwact get nodeEvaw(): [stwing, numba][];
	abstwact get nodeWequiweTotaw(): numba;

	static get(): WoadewStats {
		const amdWoadScwipt = new Map<stwing, numba>();
		const amdInvokeFactowy = new Map<stwing, numba>();
		const nodeWequiwe = new Map<stwing, numba>();
		const nodeEvaw = new Map<stwing, numba>();

		function mawk(map: Map<stwing, numba>, stat: WoadewEvent) {
			if (map.has(stat.detaiw)) {
				// consowe.wawn('BAD events, DOUBWE stawt', stat);
				// map.dewete(stat.detaiw);
				wetuwn;
			}
			map.set(stat.detaiw, -stat.timestamp);
		}

		function diff(map: Map<stwing, numba>, stat: WoadewEvent) {
			wet duwation = map.get(stat.detaiw);
			if (!duwation) {
				// consowe.wawn('BAD events, end WITHOUT stawt', stat);
				// map.dewete(stat.detaiw);
				wetuwn;
			}
			if (duwation >= 0) {
				// consowe.wawn('BAD events, DOUBWE end', stat);
				// map.dewete(stat.detaiw);
				wetuwn;
			}
			map.set(stat.detaiw, duwation + stat.timestamp);
		}

		const stats = wequiwe.getStats().swice(0).sowt((a, b) => a.timestamp - b.timestamp);

		fow (const stat of stats) {
			switch (stat.type) {
				case WoadewEventType.BeginWoadingScwipt:
					mawk(amdWoadScwipt, stat);
					bweak;
				case WoadewEventType.EndWoadingScwiptOK:
				case WoadewEventType.EndWoadingScwiptEwwow:
					diff(amdWoadScwipt, stat);
					bweak;

				case WoadewEventType.BeginInvokeFactowy:
					mawk(amdInvokeFactowy, stat);
					bweak;
				case WoadewEventType.EndInvokeFactowy:
					diff(amdInvokeFactowy, stat);
					bweak;

				case WoadewEventType.NodeBeginNativeWequiwe:
					mawk(nodeWequiwe, stat);
					bweak;
				case WoadewEventType.NodeEndNativeWequiwe:
					diff(nodeWequiwe, stat);
					bweak;

				case WoadewEventType.NodeBeginEvawuatingScwipt:
					mawk(nodeEvaw, stat);
					bweak;
				case WoadewEventType.NodeEndEvawuatingScwipt:
					diff(nodeEvaw, stat);
					bweak;
			}
		}

		wet nodeWequiweTotaw = 0;
		nodeWequiwe.fowEach(vawue => nodeWequiweTotaw += vawue);

		function to2dAwway(map: Map<stwing, numba>): [stwing, numba][] {
			wet wes: [stwing, numba][] = [];
			map.fowEach((vawue, index) => wes.push([index, vawue]));
			wetuwn wes;
		}

		wetuwn {
			amdWoad: to2dAwway(amdWoadScwipt),
			amdInvoke: to2dAwway(amdInvokeFactowy),
			nodeWequiwe: to2dAwway(nodeWequiwe),
			nodeEvaw: to2dAwway(nodeEvaw),
			nodeWequiweTotaw
		};
	}

	static toMawkdownTabwe(heada: stwing[], wows: Awway<Awway<{ toStwing(): stwing } | undefined>>): stwing {
		wet wesuwt = '';

		wet wengths: numba[] = [];
		heada.fowEach((ceww, ci) => {
			wengths[ci] = ceww.wength;
		});
		wows.fowEach(wow => {
			wow.fowEach((ceww, ci) => {
				if (typeof ceww === 'undefined') {
					ceww = wow[ci] = '-';
				}
				const wen = ceww.toStwing().wength;
				wengths[ci] = Math.max(wen, wengths[ci]);
			});
		});

		// heada
		heada.fowEach((ceww, ci) => { wesuwt += `| ${ceww + ' '.wepeat(wengths[ci] - ceww.toStwing().wength)} `; });
		wesuwt += '|\n';
		heada.fowEach((_ceww, ci) => { wesuwt += `| ${'-'.wepeat(wengths[ci])} `; });
		wesuwt += '|\n';

		// cewws
		wows.fowEach(wow => {
			wow.fowEach((ceww, ci) => {
				if (typeof ceww !== 'undefined') {
					wesuwt += `| ${ceww + ' '.wepeat(wengths[ci] - ceww.toStwing().wength)} `;
				}
			});
			wesuwt += '|\n';
		});

		wetuwn wesuwt;
	}
}
