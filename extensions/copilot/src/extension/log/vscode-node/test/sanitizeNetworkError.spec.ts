/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { sanitizeNetworkErrorForTelemetry } from '../../../../platform/log/common/logService';

describe('sanitizeNetworkErrorForTelemetry', () => {
	test('strips credentials from PROXY strings', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'Failed to establish a socket connection to proxies: PROXY testuser:testpass@proxy.fictional.example.com:8080'
		)).toBe(
			'Failed to establish a socket connection to proxies: PROXY <credentials>@<host>:8080'
		);
	});

	test('strips credentials with special characters', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'PROXY jane.fictional%40corp.example.com:fictional123@proxy.fictional.example.com:8080'
		)).toBe(
			'PROXY <credentials>@<host>:8080'
		);
	});

	test('strips credentials from HTTPS proxy', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'HTTPS fictional-user:fictional-pass@proxy.fictional.example.com:8443'
		)).toBe(
			'HTTPS <credentials>@<host>:8443'
		);
	});

	test('strips credentials from URLs', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'https://fictional-user:fictional-pass@proxy.fictional.example.com:8080/path'
		)).toBe(
			'https://<credentials>@<host>:8080/path'
		);
	});

	test('strips credentials with @ in URL userinfo', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'https://fictional-user@example.com:fictional-pass@proxy.fictional.example.com:8080/path'
		)).toBe(
			'https://<credentials>@<host>:8080/path'
		);
	});

	test('replaces IPv4 addresses', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'connect ETIMEDOUT 10.20.30.40:443'
		)).toBe(
			'connect ETIMEDOUT <ip>:443'
		);
	});

	test('replaces multiple IPv4 addresses', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'Connect Timeout Error (attempted addresses: 192.168.1.100:443, 2001:db8::1a2b:3c4d:443, timeout: 10000ms)'
		)).toBe(
			'Connect Timeout Error (attempted addresses: <ip>:443, <ip>, timeout: 10000ms)'
		);
	});

	test('replaces FQDNs', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'getaddrinfo ENOTFOUND proxy.fictional.example.com'
		)).toBe(
			'getaddrinfo ENOTFOUND <host>'
		);
	});

	test('replaces FQDN with port', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'Connect Timeout Error (attempted address: telemetry.fictional.example.com:443, timeout: 10000ms)'
		)).toBe(
			'Connect Timeout Error (attempted address: <host>:443, timeout: 10000ms)'
		);
	});

	test('preserves simple status messages', () => {
		expect(sanitizeNetworkErrorForTelemetry('Status: 200')).toBe('Status: 200');
	});

	test('replaces loopback addresses', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'ECONNREFUSED: connect ECONNREFUSED 0.0.0.0:443, connect ECONNREFUSED :::443'
		)).toBe(
			'ECONNREFUSED: connect ECONNREFUSED <ip>:443, connect ECONNREFUSED <ip>'
		);
	});

	test('replaces IPv6 addresses', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'connect ENETUNREACH 2001:db8::1a2b:3c4d:443 - Local (:::0)'
		)).toBe(
			'connect ENETUNREACH <ip> - Local (<ip>)'
		);
	});

	test('replaces full IPv6 addresses', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'connect ENETUNREACH 2001:db8:85a3:0:0:8a2e:370:7334:443'
		)).toBe(
			'connect ENETUNREACH <ip>:443'
		);
	});

	test('does not match non-IPv6 double colons', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'net::ERR_SOCKET_NOT_CONNECTED'
		)).toBe(
			'net::ERR_SOCKET_NOT_CONNECTED'
		);
	});

	test('handles combined proxy credentials and hostnames', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'Failed to establish a socket connection to proxies: PROXY fictional-admin:p%40ssw0rd@proxy.fictional.example.com:80/'
		)).toBe(
			'Failed to establish a socket connection to proxies: PROXY <credentials>@<host>:80/'
		);
	});

	test('replaces host in PROXY without credentials', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'Failed to establish a socket connection to proxies: PROXY proxy.fictional.example.com:8080'
		)).toBe(
			'Failed to establish a socket connection to proxies: PROXY <host>:8080'
		);
	});

	test('strips credentials with @ in password', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'Failed to establish a socket connection to proxies: PROXY fictional-user:P%40ss@fictional-proxy.example.com:8080'
		)).toBe(
			'Failed to establish a socket connection to proxies: PROXY <credentials>@<host>:8080'
		);
	});

	test('strips credentials with email as username', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'Failed to establish a socket connection to proxies: PROXY fictional.user@example.com:fictional-pass@fictional-proxy.example.com:8080'
		)).toBe(
			'Failed to establish a socket connection to proxies: PROXY <credentials>@<host>:8080'
		);
	});

	test('strips credentials with multiple @ signs', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'Failed to establish a socket connection to proxies: HTTPS fictional-id:fictional-pass@fictional-realm@fictional-proxy.example.com:80'
		)).toBe(
			'Failed to establish a socket connection to proxies: HTTPS <credentials>@<host>:80'
		);
	});

	test('handles multiple proxies with credentials', () => {
		expect(sanitizeNetworkErrorForTelemetry(
			'Failed to establish a socket connection to proxies: PROXY testuser:testpass@proxy1.fictional.example.com:8080; PROXY proxy2.fictional.example.com:8080; DIRECT'
		)).toBe(
			'Failed to establish a socket connection to proxies: PROXY <credentials>@<host>:8080; PROXY <host>:8080; DIRECT'
		);
	});
});
