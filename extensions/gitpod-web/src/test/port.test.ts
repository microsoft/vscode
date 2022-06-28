import { ExposedPortInfo, OnPortExposedAction, PortAutoExposure, PortsStatus, PortVisibility, TunneledPortInfo } from '@gitpod/supervisor-api-grpc/lib/status_pb';
import { GitpodExtensionContext } from 'gitpod-shared';
import { GitpodWorkspacePort, PortInfo, TunnelDescriptionI } from '../util/port';
import { TunnelVisiblity } from '@gitpod/supervisor-api-grpc/lib/port_pb';

import * as assert from 'assert';

describe('GitpodWorkspacePort', () => {

	const genPortsStatus = (obj: PortsStatus.AsObject) => {
		function genExposed(obj?: ExposedPortInfo.AsObject) {
			if (obj == null) {
				return;
			}
			const exposed = new ExposedPortInfo();
			exposed.setVisibility(obj.visibility);
			exposed.setUrl(obj.url);
			exposed.setOnExposed(obj.onExposed);
			return exposed;
		}
		function genTunneledPortInfo(obj?: TunneledPortInfo.AsObject) {
			if (obj == null) {
				return;
			}
			const tunneled = new TunneledPortInfo();
			tunneled.setTargetPort(obj.targetPort);
			tunneled.setVisibility(obj.visibility);
			return tunneled;
		}
		const ps = new PortsStatus();
		ps.setAutoExposure(obj.autoExposure);
		ps.setDescription(obj.description);
		ps.setName(obj.name);
		ps.setExposed(genExposed(obj.exposed));
		ps.setLocalPort(obj.localPort);
		ps.setServed(obj.served);
		ps.setTunneled(genTunneledPortInfo(obj.tunneled));
		return ps;
	};

	interface TmpTunnel {
		localAddress: {
			port: number;
			host: string;
		} | string;
		public: boolean;
	}

	interface TestI { ps: Partial<PortsStatus.AsObject>; tunnel?: TmpTunnel; result: PortInfo }

	it('parsePortInfo', () => {
		const base = {
			name: 'name',
			description: 'desc',
			exposed: {
				visibility: PortVisibility.PRIVATE,
				url: 'http://localhost:3000',
				onExposed: OnPortExposedAction.OPEN_BROWSER,
			},
			localPort: 3000,
			served: false,
			tunneled: {
				targetPort: 3000,
				visibility: TunnelVisiblity.HOST,
				clientsMap: [] as Array<[string, number]>,
			},
			autoExposure: PortAutoExposure.TRYING,
		};
		const cases: TestI[] = [
			{
				ps: {},
				tunnel: {
					localAddress: 'https://localhost:3001',
					public: true,
				},
				result: {
					label: 'name: 3000:3001',
					tooltip: 'name - desc',
					description: 'not served',
					iconStatus: 'NotServed',
					contextValue: 'network-tunneled-private-exposed-port',
					localUrl: 'http://localhost:3000',
				}
			},
			{
				ps: {
					exposed: Object.assign({}, base, {
						visibility: PortVisibility.PUBLIC
					}) as any as ExposedPortInfo.AsObject
				},
				tunnel: {
					localAddress: 'https://localhost:3001',
					public: true,
				},
				result: {
					label: 'name: 3000:3001',
					tooltip: 'name - desc',
					description: 'not served',
					iconStatus: 'NotServed',
					contextValue: 'network-tunneled-public-exposed-port',
					localUrl: 'http://localhost:3000',
				}
			},
			{
				ps: {
					name: undefined,
					served: true,
					exposed: undefined,
					autoExposure: PortAutoExposure.FAILED,
				},
				result: {
					label: '3000',
					tooltip: 'desc',
					description: 'failed to expose',
					iconStatus: 'ExposureFailed',
					contextValue: 'failed-served-port',
					localUrl: 'http://localhost:3000',
				}
			},
			{
				ps: {
					name: undefined,
					served: true,
					exposed: undefined,
					autoExposure: PortAutoExposure.SUCCEEDED,
				},
				result: {
					label: '3000',
					tooltip: 'desc',
					description: 'detecting...',
					iconStatus: 'Detecting',
					contextValue: 'served-port',
					localUrl: 'http://localhost:3000',
				}
			},
			{
				ps: {
					name: undefined,
					served: true,
					exposed: undefined,
					autoExposure: PortAutoExposure.TRYING,
				},
				result: {
					label: '3000',
					tooltip: 'desc',
					description: 'detecting...',
					iconStatus: 'Detecting',
					contextValue: 'served-port',
					localUrl: 'http://localhost:3000',
				}
			},
			{
				ps: {
					name: undefined,
					served: true,
					exposed: undefined,
					autoExposure: PortAutoExposure.TRYING,
				},
				tunnel: {
					localAddress: 'http://localhost:3001',
					public: true
				},
				result: {
					label: '3000:3001',
					tooltip: 'desc',
					description: 'open on all interfaces',
					iconStatus: 'Served',
					contextValue: 'network-tunneled-served-port',
					localUrl: 'http://localhost:3000',
				}
			},
			{
				ps: {
					name: undefined,
					served: true,
					exposed: undefined,
					autoExposure: PortAutoExposure.TRYING,
				},
				tunnel: {
					localAddress: 'http://localhost:3001',
					public: false
				},
				result: {
					label: '3000:3001',
					tooltip: 'desc',
					description: 'open on localhost',
					iconStatus: 'Served',
					contextValue: 'host-tunneled-served-port',
					localUrl: 'http://localhost:3000',
				}
			},
			{
				ps: {
					name: undefined,
					served: true,
					exposed: undefined,
					autoExposure: PortAutoExposure.TRYING,
				},
				tunnel: {
					localAddress: 'http://localhost:3001',
					public: false
				},
				result: {
					label: '3000:3001',
					tooltip: 'desc',
					description: 'open on localhost',
					iconStatus: 'Served',
					contextValue: 'host-tunneled-served-port',
					localUrl: 'http://localhost:3000',
				}
			},
			{
				ps: {
					name: undefined,
					served: true,
					exposed: Object.assign({}, base, {
						visibility: PortVisibility.PUBLIC
					}) as any as ExposedPortInfo.AsObject,
					autoExposure: PortAutoExposure.TRYING,
				},
				tunnel: {
					localAddress: 'http://localhost:3001',
					public: false
				},
				result: {
					label: '3000:3001',
					tooltip: 'desc',
					description: 'open on localhost (public)',
					iconStatus: 'Served',
					contextValue: 'host-tunneled-public-exposed-served-port',
					localUrl: 'http://localhost:3000',
				}
			},
			{
				ps: {
					name: undefined,
					served: true,
					exposed: Object.assign({}, base, {
						visibility: PortVisibility.PRIVATE
					}) as any as ExposedPortInfo.AsObject,
					autoExposure: PortAutoExposure.TRYING,
				},
				tunnel: {
					localAddress: 'http://localhost:3001',
					public: false
				},
				result: {
					label: '3000:3001',
					tooltip: 'desc',
					description: 'open on localhost (private)',
					iconStatus: 'Served',
					contextValue: 'host-tunneled-private-exposed-served-port',
					localUrl: 'http://localhost:3000',
				}
			},
		];
		for (const t of cases) {
			const ps = genPortsStatus(Object.assign({}, base, t.ps));
			const result = new GitpodWorkspacePort(ps.getLocalPort(), {} as GitpodExtensionContext, ps, t.tunnel as TunnelDescriptionI);
			assert.deepEqual(result.info, t.result);
		}
	});
});
