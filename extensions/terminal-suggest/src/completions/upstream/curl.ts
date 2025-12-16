const completionSpec: Fig.Spec = {
	name: "curl",
	description: "Transfer a URL",
	args: { name: "URL", template: "history" },
	options: [
		{
			name: ["-a", "--append"],
			description: "Append to target file when uploading",
		},
		{
			name: ["-E", "--cert"],
			description: "Client certificate file and password",
			args: {
				name: "certificate[:password]",
				generators: {
					getQueryTerm: ":",
				},
			},
		},
		{
			name: ["-K", "--config"],
			description: "Read config from a file",
			args: { name: "file", template: "filepaths" },
		},
		{
			name: ["-C", "--continue-at"],
			description: "Resumed transfer offset",
			args: { name: "offset" },
		},
		{
			name: ["-b", "--cookie"],
			description: "Send cookies from string/file",
			args: { name: "data or filename", template: "filepaths" },
		},
		{
			name: ["-c", "--cookie-jar"],
			description: "Write cookies to <filename> after operation",
			args: { name: "filename", template: "filepaths" },
		},
		{
			name: ["-d", "--data"],
			description: "HTTP POST data",
			insertValue: "-d '{cursor}'",
			args: { name: "data" },
			isRepeatable: true,
		},
		{ name: ["-q", "--disable"], description: "Disable .curlrc" },
		{
			name: ["-D", "--dump-header"],
			description: "Write the received headers to <filename>",
			args: { name: "filename", template: "filepaths" },
		},
		{
			name: ["-f", "--fail"],
			description: "Fail silently (no output at all) on HTTP errors",
		},
		{
			name: ["-F", "--form"],
			description: "Specify multipart MIME data",
			args: { name: "content" },
			isRepeatable: true,
		},
		{
			name: ["-P", "--ftp-port"],
			description: "Use PORT instead of PASV",
			args: { name: "address" },
		},
		{
			name: ["-G", "--get"],
			description: "Put the post data in the URL and use GET",
		},
		{
			name: ["-g", "--globoff"],
			description: "Disable URL sequences and ranges using {} and []",
		},
		{ name: ["-I", "--head"], description: "Show document info only" },
		{
			name: ["-H", "--header"],
			description: "Pass custom header(s) to server",
			args: {
				name: "header/file",
				suggestions: [
					{ name: "Content-Type: application/json" },
					{ name: "Content-Type: application/x-www-form-urlencoded" },
				],
			},
		},
		{ name: ["-h", "--help"], description: "This help text" },
		{ name: ["-0", "--http1.0"], description: "Use HTTP 1.0" },
		{
			name: ["-i", "--include"],
			description: "Include protocol response headers in the output",
		},
		{
			name: ["-k", "--insecure"],
			description: "Allow insecure server connections when using SSL",
		},
		{ name: ["-4", "--ipv4"], description: "Resolve names to IPv4 addresses" },
		{ name: ["-6", "--ipv6"], description: "Resolve names to IPv6 addresses" },
		{
			name: ["-j", "--junk-session-cookies"],
			description: "Ignore session cookies read from file",
		},
		{ name: ["-l", "--list-only"], description: "List only mode" },
		{ name: ["-L", "--location"], description: "Follow redirects" },
		{ name: ["-M", "--manual"], description: "Display the full manual" },
		{
			name: ["-m", "--max-time"],
			description: "Maximum time allowed for the transfer",
			args: { name: "seconds" },
		},
		{
			name: ["-n", "--netrc"],
			description: "Must read .netrc for user name and password",
		},
		{
			name: ["-:", "--next"],
			description: "Make next URL use its separate set of options",
		},
		{
			name: ["-N", "--no-buffer"],
			description: "Disable buffering of the output stream",
		},
		{
			name: ["-o", "--output"],
			description: "Write to file instead of stdout",
			args: { name: "file", template: "filepaths" },
		},
		{
			name: ["-#", "--progress-bar"],
			description: "Display transfer progress as a bar",
		},
		{
			name: ["-x", "--proxy"],
			description: "[protocol://]host[:port] Use this proxy",
		},
		{
			name: ["-U", "--proxy-user"],
			description: "Proxy user and password",
			args: { name: "user:password" },
		},
		{
			name: ["-p", "--proxytunnel"],
			description: "Operate through an HTTP proxy tunnel (using CONNECT)",
		},
		{
			name: ["-Q", "--quote"],
			description: "Send command(s) to server before transfer",
		},
		{
			name: ["-r", "--range"],
			description: "Retrieve only the bytes within RANGE",
			args: { name: "range" },
		},
		{
			name: ["-e", "--referer"],
			description: "Referrer URL",
			args: { name: "URL" },
		},
		{
			name: ["-J", "--remote-header-name"],
			description: "Use the header-provided filename",
		},
		{
			name: ["-O", "--remote-name"],
			description: "Write output to a file named as the remote file",
		},
		{
			name: ["-R", "--remote-time"],
			description: "Set the remote file's time on the local output",
		},
		{
			name: ["-X", "--request"],
			description: "Specify request command to use",
			args: {
				name: "command",
				suggestions: [
					{ name: "GET" },
					{ name: "HEAD" },
					{ name: "POST" },
					{ name: "PUT" },
					{ name: "DELETE" },
					{ name: "CONNECT" },
					{ name: "OPTIONS" },
					{ name: "TRACE" },
					{ name: "PATCH" },
				],
			},
		},
		{
			name: ["-S", "--show-error"],
			description: "Show error even when -s is used",
		},
		{ name: ["-s", "--silent"], description: "Silent mode" },
		{
			name: ["-Y", "--speed-limit"],
			description: "Stop transfers slower than this",
			args: { name: "speed" },
		},
		{
			name: ["-y", "--speed-time"],
			description: "Trigger 'speed-limit' abort after this time",
			args: { name: "seconds" },
		},
		{ name: ["-2", "--sslv2"], description: "Use SSLv2" },
		{ name: ["-3", "--sslv3"], description: "Use SSLv3" },
		{
			name: ["-t", "--telnet-option"],
			description: "Set telnet option",
			args: { name: "val" },
		},
		{
			name: ["-z", "--time-cond"],
			description: "Transfer based on a time condition",
			args: { name: "time" },
		},
		{ name: ["-1", "--tlsv1"], description: "Use TLSv1.0 or greater" },
		{
			name: ["-T", "--upload-file"],
			description: "Transfer local FILE to destination",
			args: { name: "file", template: "filepaths" },
		},
		{ name: ["-B", "--use-ascii"], description: "Use ASCII/text transfer" },
		{
			name: ["-u", "--user"],
			description: "Server user and password",
			args: { name: "user:password" },
		},
		{
			name: ["-A", "--user-agent"],
			description: "Send User-Agent <name> to server",
			args: { name: "name" },
		},
		{
			name: ["-v", "--verbose"],
			description: "Make the operation more talkative",
		},
		{ name: ["-V", "--version"], description: "Show version number and quit" },
		{
			name: ["-w", "--write-out"],
			description: "Use output FORMAT after completion",
			args: { name: "format" },
		},
		{
			name: "--abstract-unix-socket",
			description: "Connect via abstract Unix domain socket",
			args: { name: "path" },
		},
		{
			name: "--alt-svc",
			description: "Name> Enable alt-svc with this cache file",
			args: { name: "file", template: "filepaths" },
		},
		{ name: "--anyauth", description: "Pick any authentication method" },
		{ name: "--basic", description: "Use HTTP Basic Authentication" },
		{
			name: "--cacert",
			description: "CA certificate to verify peer against",
			args: { name: "file", template: "filepaths" },
		},
		{
			name: "--capath",
			description: "CA directory to verify peer against",
			args: { name: "dir", template: "folders" },
		},
		{
			name: "--cert-status",
			description: "Verify the status of the server certificate",
		},
		{
			name: "--cert-type",
			description: "Certificate file type",
			args: {
				name: "type",
				suggestions: [{ name: "DER" }, { name: "PEM" }, { name: "ENG" }],
			},
		},
		{
			name: "--ciphers",
			description: "Of ciphers> SSL ciphers to use",
			args: { name: "list" },
		},
		{ name: "--compressed", description: "Request compressed response" },
		{ name: "--compressed-ssh", description: "Enable SSH compression" },
		{
			name: "--connect-timeout",
			description: "Maximum time allowed for connection",
			args: { name: "seconds" },
		},
		{
			name: "--connect-to",
			description: "Connect to host",
			args: { name: "HOST1:PORT1:HOST2:PORT2" },
		},
		{
			name: "--create-dirs",
			description: "Create necessary local directory hierarchy",
		},
		{ name: "--crlf", description: "Convert LF to CRLF in upload" },
		{
			name: "--crlfile",
			description: "Get a CRL list in PEM format from the given file",
			args: { name: "file", template: "filepaths" },
		},
		{
			name: "--data-ascii",
			description: "HTTP POST ASCII data",
			args: { name: "data" },
		},
		{
			name: "--data-binary",
			description: "HTTP POST binary data",
			args: { name: "data" },
		},
		{
			name: "--data-raw",
			description: "HTTP POST data, '@' allowed",
			args: { name: "data" },
		},
		{
			name: "--data-urlencode",
			description: "HTTP POST data url encoded",
			args: { name: "data" },
		},
		{
			name: "--delegation",
			description: "GSS-API delegation permission",
			args: { name: "LEVEL" },
		},
		{ name: "--digest", description: "Use HTTP Digest Authentication" },
		{ name: "--disable-eprt", description: "Inhibit using EPRT or LPRT" },
		{ name: "--disable-epsv", description: "Inhibit using EPSV" },
		{
			name: "--disallow-username-in-url",
			description: "Disallow username in url",
		},
		{
			name: "--dns-interface",
			description: "Interface to use for DNS requests",
			args: { name: "interface" },
		},
		{
			name: "--dns-ipv4-addr",
			description: "IPv4 address to use for DNS requests",
			args: { name: "address" },
		},
		{
			name: "--dns-ipv6-addr",
			description: "IPv6 address to use for DNS requests",
			args: { name: "address" },
		},
		{
			name: "--dns-servers",
			description: "DNS server addrs to use",
			args: { name: "addresses" },
		},
		{
			name: "--doh-url",
			description: "Resolve host names over DOH",
			args: { name: "URL" },
		},
		{
			name: "--egd-file",
			description: "EGD socket path for random data",
			args: { name: "file", template: "filepaths" },
		},
		{
			name: "--engine",
			description: "Crypto engine to use",
			args: { name: "name" },
		},
		{
			name: "--etag-compare",
			description:
				"Make a conditional HTTP request for the ETag read from the given file",
			args: { name: "file" },
		},
		{
			name: "--etag-save",
			description: "Save an HTTP ETag to the specified file",
			args: { name: "file" },
		},
		{
			name: "--expect100-timeout",
			description: "How long to wait for 100-continue",
			args: { name: "seconds" },
		},
		{
			name: "--fail-early",
			description: "Fail on first transfer error, do not continue",
		},
		{
			name: "--fail-with-body",
			description:
				"On HTTP errors, return an error and also output any HTML response",
		},
		{ name: "--false-start", description: "Enable TLS False Start" },
		{
			name: "--form-string",
			description: "Specify multipart MIME data",
			args: { name: "string" },
		},
		{
			name: "--ftp-account",
			description: "Account data string",
			args: { name: "data" },
		},
		{
			name: "--ftp-alternative-to-user",
			description: "String to replace USER [name]",
			args: { name: "command" },
		},
		{
			name: "--ftp-create-dirs",
			description: "Create the remote dirs if not present",
		},
		{
			name: "--ftp-method",
			description: "Control CWD usage",
			args: { name: "method" },
		},
		{ name: "--ftp-pasv", description: "Use PASV/EPSV instead of PORT" },
		{ name: "--ftp-pret", description: "Send PRET before PASV" },
		{ name: "--ftp-skip-pasv-ip", description: "Skip the IP address for PASV" },
		{ name: "--ftp-ssl-ccc", description: "Send CCC after authenticating" },
		{
			name: "--ftp-ssl-ccc-mode",
			description: "Set CCC mode",
			args: {
				name: "mode",
				suggestions: [{ name: "active" }, { name: "passive" }],
			},
		},
		{
			name: "--ftp-ssl-control",
			description: "Require SSL/TLS for FTP login, clear for transfer",
		},
		{
			name: "--happy-eyeballs-timeout-ms",
			description:
				"How long to wait in milliseconds for IPv6 before trying IPv4",
			args: { name: "milliseconds" },
		},
		{
			name: "--haproxy-protocol",
			description: "Send HAProxy PROXY protocol v1 header",
		},
		{
			name: "--hostpubmd5",
			description: "Acceptable MD5 hash of the host public key",
			args: { name: "md5" },
		},
		{ name: "--http0.9", description: "Allow HTTP 0.9 responses" },
		{ name: "--http1.1", description: "Use HTTP 1.1" },
		{ name: "--http2", description: "Use HTTP 2" },
		{
			name: "--http2-prior-knowledge",
			description: "Use HTTP 2 without HTTP/1.1 Upgrade",
		},
		{
			name: "--ignore-content-length",
			description: "Ignore the size of the remote resource",
		},
		{
			name: "--interface",
			description: "Use network INTERFACE (or address)",
			args: { name: "name" },
		},
		{
			name: "--keepalive-time",
			description: "Interval time for keepalive probes",
			args: { name: "seconds" },
		},
		{
			name: "--key",
			description: "Private key file name",
			args: { name: "key" },
		},
		{
			name: "--key-type",
			description: "Private key file type",
			args: {
				name: "type",
				suggestions: [{ name: "DER" }, { name: "PEM" }, { name: "ENG" }],
			},
		},
		{
			name: "--krb",
			description: "Enable Kerberos with security <level>",
			args: { name: "level" },
		},
		{
			name: "--libcurl",
			description: "Dump libcurl equivalent code of this command line",
			args: { name: "file", template: "filepaths" },
		},
		{
			name: "--limit-rate",
			description: "Limit transfer speed to RATE",
			args: { name: "speed" },
		},
		{
			name: "--local-port",
			description: "Force use of RANGE for local port numbers",
			args: { name: "num/range" },
		},
		{
			name: "--location-trusted",
			description: "Like --location, and send auth to other hosts",
		},
		{
			name: "--login-options",
			description: "Server login options",
			args: { name: "options" },
		},
		{
			name: "--mail-auth",
			description: "Originator address of the original email",
			args: { name: "address" },
		},
		{
			name: "--mail-from",
			description: "Mail from this address",
			args: { name: "address" },
		},
		{
			name: "--mail-rcpt",
			description: "Mail to this address",
			args: { name: "address" },
		},
		{
			name: "--max-filesize",
			description: "Maximum file size to download",
			args: { name: "bytes" },
		},
		{
			name: "--max-redirs",
			description: "Maximum number of redirects allowed",
			args: { name: "num" },
		},
		{
			name: "--metalink",
			description: "Process given URLs as metalink XML file",
		},
		{
			name: "--negotiate",
			description: "Use HTTP Negotiate (SPNEGO) authentication",
		},
		{
			name: "--netrc-file",
			description: "Specify FILE for netrc",
			args: { name: "filename", template: "filepaths" },
		},
		{ name: "--netrc-optional", description: "Use either .netrc or URL" },
		{ name: "--no-alpn", description: "Disable the ALPN TLS extension" },
		{
			name: "--no-keepalive",
			description: "Disable TCP keepalive on the connection",
		},
		{ name: "--no-npn", description: "Disable the NPN TLS extension" },
		{ name: "--no-sessionid", description: "Disable SSL session-ID reusing" },
		{
			name: "--noproxy",
			description: "List of hosts which do not use proxy",
			args: { name: "no-proxy-list" },
		},
		{ name: "--ntlm", description: "Use HTTP NTLM authentication" },
		{
			name: "--ntlm-wb",
			description: "Use HTTP NTLM authentication with winbind",
		},
		{
			name: "--oauth2-bearer",
			description: "OAuth 2 Bearer Token",
			args: { name: "token" },
		},
		{
			name: "--pass",
			description: "Pass phrase for the private key",
			args: { name: "phrase" },
		},
		{
			name: "--path-as-is",
			description: "Do not squash .. sequences in URL path",
		},
		{
			name: "--pinnedpubkey",
			description: "FILE/HASHES Public key to verify peer against",
			args: { name: "hashes" },
		},
		{
			name: "--post301",
			description: "Do not switch to GET after following a 301",
		},
		{
			name: "--post302",
			description: "Do not switch to GET after following a 302",
		},
		{
			name: "--post303",
			description: "Do not switch to GET after following a 303",
		},
		{
			name: "--preproxy",
			description: "[protocol://]host[:port] Use this proxy first",
		},
		{
			name: "--proto",
			description: "Enable/disable PROTOCOLS",
			args: { name: "protocols" },
		},
		{
			name: "--proto-default",
			description: "Use PROTOCOL for any URL missing a scheme",
			args: { name: "protocol" },
		},
		{
			name: "--proto-redir",
			description: "Enable/disable PROTOCOLS on redirect",
			args: { name: "protocols" },
		},
		{
			name: "--proxy-anyauth",
			description: "Pick any proxy authentication method",
		},
		{
			name: "--proxy-basic",
			description: "Use Basic authentication on the proxy",
		},
		{
			name: "--proxy-cacert",
			description: "CA certificate to verify peer against for proxy",
			args: { name: "file", template: "filepaths" },
		},
		{
			name: "--proxy-capath",
			description: "CA directory to verify peer against for proxy",
			args: { name: "dir", template: "folders" },
		},
		{
			name: "--proxy-cert",
			description: "Set client certificate for proxy",
			args: { name: "cert[:passwd]" },
		},
		{
			name: "--proxy-cert-type",
			description: "Client certificate type for HTTPS proxy",
			args: { name: "type" },
		},
		{
			name: "--proxy-ciphers",
			description: "SSL ciphers to use for proxy",
			args: { name: "list" },
		},
		{
			name: "--proxy-crlfile",
			description: "Set a CRL list for proxy",
			args: { name: "file", template: "filepaths" },
		},
		{
			name: "--proxy-digest",
			description: "Use Digest authentication on the proxy",
		},
		{
			name: "--proxy-header",
			description: "Pass custom header(s) to proxy",
			args: {
				name: "header/file",
				suggestions: [
					{ name: "Content-Type: application/json" },
					{ name: "Content-Type: application/x-www-form-urlencoded" },
				],
			},
		},
		{
			name: "--proxy-insecure",
			description: "Do HTTPS proxy connections without verifying the proxy",
		},
		{
			name: "--proxy-key",
			description: "Private key for HTTPS proxy",
			args: { name: "key" },
		},
		{
			name: "--proxy-key-type",
			description: "Private key file type for proxy",
			args: { name: "type" },
		},
		{
			name: "--proxy-negotiate",
			description: "Use HTTP Negotiate (SPNEGO) authentication on the proxy",
		},
		{
			name: "--proxy-ntlm",
			description: "Use NTLM authentication on the proxy",
		},
		{
			name: "--proxy-pass",
			description: "Pass phrase for the private key for HTTPS proxy",
			args: { name: "phrase" },
		},
		{
			name: "--proxy-pinnedpubkey",
			description: "FILE/HASHES public key to verify proxy with",
			args: { name: "hashes" },
		},
		{
			name: "--proxy-service-name",
			description: "SPNEGO proxy service name",
			args: { name: "name" },
		},
		{
			name: "--proxy-ssl-allow-beast",
			description: "Allow security flaw for interop for HTTPS proxy",
		},
		{
			name: "--proxy-tls13-ciphers",
			description: "List> TLS 1.3 proxy cipher suites",
			args: { name: "ciphersuite" },
		},
		{
			name: "--proxy-tlsauthtype",
			description: "TLS authentication type for HTTPS proxy",
			args: { name: "type" },
		},
		{
			name: "--proxy-tlspassword",
			description: "TLS password for HTTPS proxy",
			args: { name: "string" },
		},
		{
			name: "--proxy-tlsuser",
			description: "TLS username for HTTPS proxy",
			args: { name: "name" },
		},
		{ name: "--proxy-tlsv1", description: "Use TLSv1 for HTTPS proxy" },
		{
			name: "--proxy1.0",
			description: "Use HTTP/1.0 proxy on given port",
			args: { name: "host[:port]" },
		},
		{
			name: "--pubkey",
			description: "SSH Public key file name",
			args: { name: "key", template: "filepaths" },
		},
		{
			name: "--random-file",
			description: "File for reading random data from",
			args: { name: "file", template: "filepaths" },
		},
		{ name: "--raw", description: 'Do HTTP "raw"; no transfer decoding' },
		{
			name: "--remote-name-all",
			description: "Use the remote file name for all URLs",
		},
		{
			name: "--request-target",
			description: "Specify the target for this request",
		},
		{
			name: "--resolve",
			description: "Resolve the host+port to this address",
			args: { name: "host:port:address[,address]..." },
		},
		{
			name: "--retry",
			description: "Retry request if transient problems occur",
			args: { name: "num" },
		},
		{
			name: "--retry-connrefused",
			description: "Retry on connection refused (use with --retry)",
		},
		{
			name: "--retry-delay",
			description: "Wait time between retries",
			args: { name: "seconds" },
		},
		{
			name: "--retry-max-time",
			description: "Retry only within this period",
			args: { name: "seconds" },
		},
		{
			name: "--sasl-ir",
			description: "Enable initial response in SASL authentication",
		},
		{
			name: "--service-name",
			description: "SPNEGO service name",
			args: { name: "name" },
		},
		{
			name: "--socks4",
			description: "SOCKS4 proxy on given host + port",
			args: { name: "host[:port]" },
		},
		{
			name: "--socks4a",
			description: "SOCKS4a proxy on given host + port",
			args: { name: "host[:port]" },
		},
		{
			name: "--socks5",
			description: "SOCKS5 proxy on given host + port",
			args: { name: "host[:port]" },
		},
		{
			name: "--socks5-basic",
			description: "Enable username/password auth for SOCKS5 proxies",
		},
		{
			name: "--socks5-gssapi",
			description: "Enable GSS-API auth for SOCKS5 proxies",
		},
		{
			name: "--socks5-gssapi-nec",
			description: "Compatibility with NEC SOCKS5 server",
		},
		{
			name: "--socks5-gssapi-service",
			description: "SOCKS5 proxy service name for GSS-API",
			args: { name: "name" },
		},
		{
			name: "--socks5-hostname",
			description: "SOCKS5 proxy, pass host name to proxy",
			args: { name: "host[:port]" },
		},
		{ name: "--ssl", description: "Try SSL/TLS" },
		{
			name: "--ssl-auto-client-cert",
			description: "Obtain and use a client certificate automatically",
		},
		{
			name: "--ssl-allow-beast",
			description: "Allow security flaw to improve interop",
		},
		{
			name: "--ssl-no-revoke",
			description: "Disable cert revocation checks (Schannel)",
		},
		{ name: "--ssl-reqd", description: "Require SSL/TLS" },
		{ name: "--stderr", description: "Where to redirect stderr" },
		{
			name: "--styled-output",
			description: "Enable styled output for HTTP headers",
		},
		{
			name: "--suppress-connect-headers",
			description: "Suppress proxy CONNECT response headers",
		},
		{ name: "--tcp-fastopen", description: "Use TCP Fast Open" },
		{ name: "--tcp-nodelay", description: "Use the TCP_NODELAY option" },
		{
			name: "--tftp-blksize",
			description: "Set TFTP BLKSIZE option",
			args: { name: "value" },
		},
		{ name: "--tftp-no-options", description: "Do not send any TFTP options" },
		{
			name: "--tls-max",
			description: "Set maximum allowed TLS version",
			args: { name: "VERSION" },
		},
		{
			name: "--tls13-ciphers",
			description: "Of TLS 1.3 ciphersuites> TLS 1.3 cipher suites to use",
			args: { name: "list" },
		},
		{
			name: "--tlsauthtype",
			description: "TLS authentication type",
			args: { name: "type" },
		},
		{ name: "--tlspassword", description: "TLS password" },
		{ name: "--tlsuser", description: "TLS user name", args: { name: "name" } },
		{ name: "--tlsv1.0", description: "Use TLSv1.0 or greater" },
		{ name: "--tlsv1.1", description: "Use TLSv1.1 or greater" },
		{ name: "--tlsv1.2", description: "Use TLSv1.2 or greater" },
		{ name: "--tlsv1.3", description: "Use TLSv1.3 or greater" },
		{
			name: "--tr-encoding",
			description: "Request compressed transfer encoding",
		},
		{
			name: "--trace",
			description: "Write a debug trace to FILE",
			args: { name: "file", template: "filepaths" },
		},
		{
			name: "--trace-ascii",
			description: "Like --trace, but without hex output",
			args: { name: "file", template: "filepaths" },
		},
		{
			name: "--trace-time",
			description: "Add time stamps to trace/verbose output",
		},
		{
			name: "--unix-socket",
			description: "Connect through this Unix domain socket",
			args: { name: "path" },
		},
		{ name: "--url", description: "URL to work with", args: { name: "url" } },
		{
			name: "--xattr",
			description: "Store metadata in extended file attributes",
		},
	],
};

export default completionSpec;
