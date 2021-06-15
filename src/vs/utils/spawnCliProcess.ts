import { NativeParsedArgs } from 'vs/platform/environment/common/argv';

export default function shouldSpawnCliProcess(argv: NativeParsedArgs): boolean {
	return !!argv['install-source']
		|| !!argv['list-extensions']
		|| !!argv['install-extension']
		|| !!argv['uninstall-extension']
		|| !!argv['locate-extension']
		|| !!argv['telemetry'];
}
