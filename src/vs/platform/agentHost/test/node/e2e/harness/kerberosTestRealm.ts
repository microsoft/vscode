/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile, spawn } from 'child_process';
import { once } from 'events';
import { mkdir, writeFile } from 'fs/promises';
import { createServer } from 'net';
import { promisify } from 'util';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { isMacintosh, isWindows } from '../../../../../../base/common/platform.js';

/** Starts a private native KDC; all databases, tickets and configuration stay under the supplied directory. */
export async function startKerberosTestRealm(directory: string): Promise<{ env: Record<string, string>; close(): Promise<void> }> {
	if (isWindows) {
		throw new Error('The isolated Kerberos fixture requires MIT Kerberos (Linux) or Heimdal (macOS), not Windows SSPI');
	}
	await mkdir(directory, { recursive: true });
	const reservation = createServer();
	await new Promise<void>((resolve, reject) => {
		reservation.once('error', reject);
		reservation.listen(0, '127.0.0.1', resolve);
	});
	const address = reservation.address();
	await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
	if (!address || typeof address === 'string') {
		throw new Error('The Kerberos fixture could not reserve a TCP port');
	}
	const realm = 'VSCODE-OTEL.TEST';
	const principal = `tester@${realm}`;
	const configPath = join(directory, 'krb5.conf');
	const keytabPath = join(directory, 'keytab');
	const env = {
		KRB5_CONFIG: configPath,
		KRB5_KDC_PROFILE: join(directory, 'kdc.conf'),
		KRB5CCNAME: `FILE:${join(directory, 'ccache')}`,
		KRB5_KTNAME: `FILE:${keytabPath}`,
	};
	const run = async (command: string, args: string[], timeout = 15_000) => {
		await promisify(execFile)(command, args, { env: { ...process.env, ...env }, timeout });
	};
	await writeFile(configPath, `[libdefaults]
	default_realm = ${realm}
	dns_lookup_kdc = false
	dns_lookup_realm = false
	dns_canonicalize_hostname = false
	rdns = false
	udp_preference_limit = 1
[realms]
	${realm} = {
		kdc = 127.0.0.1:${address.port}
	}
[logging]
	kdc = FILE:${join(directory, 'kdc.log')}
	default = FILE:${join(directory, 'krb5.log')}
${isMacintosh ? `[kdc]
	database = {
		dbname = ${join(directory, 'db')}
		mkey_file = ${join(directory, 'stash')}
		acl_file = ${join(directory, 'acl')}
		log_file = ${join(directory, 'db.log')}
	}
	ports = ${address.port}
` : ''}`, { mode: 0o600 });
	await writeFile(join(directory, 'acl'), '', { mode: 0o600 });

	let executable: string;
	let args: string[];
	let kinitArgs: string[];
	if (isMacintosh) {
		const admin = async (...args: string[]) => run('kadmin', ['--local', `--config-file=${configPath}`, ...args]);
		await admin('stash', `--key-file=${join(directory, 'stash')}`, '--random-password');
		await admin('init', '--realm-max-ticket-life=1h', '--realm-max-renewable-life=1h', realm);
		await admin('add', '--use-defaults', '--random-key', principal);
		await admin('add', '--use-defaults', '--random-key', `HTTP/proxy.vscode.test@${realm}`);
		await admin('ext', `--keytab=${keytabPath}`, principal);
		executable = '/System/Library/PrivateFrameworks/Heimdal.framework/Helpers/kdc';
		args = ['--no-sandbox', `--config-file=${configPath}`, '--addresses=127.0.0.1'];
		kinitArgs = ['--no-change-default', '-c', env.KRB5CCNAME, '-k', '-t', keytabPath, principal];
	} else {
		await writeFile(env.KRB5_KDC_PROFILE, `[kdcdefaults]
	kdc_listen = 127.0.0.1:${address.port}
	kdc_tcp_listen = 127.0.0.1:${address.port}
[realms]
	${realm} = {
		database_name = ${join(directory, 'db')}
		key_stash_file = ${join(directory, 'stash')}
		acl_file = ${join(directory, 'acl')}
		max_life = 1h
	}
`, { mode: 0o600 });
		await run('kdb5_util', ['create', '-s', '-P', 'isolated-test-master-key']);
		await run('kadmin.local', ['-q', `addprinc -randkey ${principal}`]);
		await run('kadmin.local', ['-q', `addprinc -randkey HTTP/proxy.vscode.test@${realm}`]);
		await run('kadmin.local', ['-q', `ktadd -k "${keytabPath}" ${principal}`]);
		executable = 'krb5kdc';
		args = ['-n', '-P', join(directory, 'kdc.pid')];
		kinitArgs = ['-c', env.KRB5CCNAME, '-k', '-t', keytabPath, principal];
	}
	const kdc = spawn(executable, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
	let output = '';
	kdc.stdout.on('data', chunk => output = (output + chunk).slice(-8000));
	kdc.stderr.on('data', chunk => output = (output + chunk).slice(-8000));
	const exited = new Promise<void>(resolve => kdc.once('exit', () => resolve()));
	const close = async () => {
		if (kdc.pid && kdc.exitCode === null && kdc.signalCode === null) {
			const forceKill = setTimeout(() => kdc.kill('SIGKILL'), 5000);
			try {
				kdc.kill('SIGTERM');
				await exited;
			} finally {
				clearTimeout(forceKill);
			}
		}
	};
	try {
		await once(kdc, 'spawn');
		await retry(async () => {
			if (kdc.exitCode !== null || kdc.signalCode !== null) {
				throw new Error(`Test KDC exited before issuing a ticket: ${output}`);
			}
			await run('kinit', kinitArgs, 3000);
		}, 100, 10);
		return { env, close };
	} catch (error) {
		await close();
		throw new Error(`Failed to start isolated Kerberos realm: ${output}`, { cause: error });
	}
}
