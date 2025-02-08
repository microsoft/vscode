const completionSpec: Fig.Spec = {
  name: "wget",
  description: "A non-interactive network retriever",
  args: {
    isVariadic: true,
    name: "url",
    description: "The url(s) to retrieve",
  },
  options: [
    {
      name: ["-V", "--version"],
      description: "Display the version of Wget and exit",
    },
    { name: ["-h", "--help"], description: "Print this help" },
    {
      name: ["-b", "--background"],
      description: "Go to background after startup",
    },
    {
      name: ["-e", "--execute=COMMAND"],
      description: "Execute a `.wgetrc'-style command",
    },
    { name: ["-o", "--output-file=FILE"], description: "Log messages to FILE" },
    {
      name: ["-a", "--append-output=FILE"],
      description: "Append messages to FILE",
    },
    { name: ["-q", "--quiet"], description: "Quiet (no output)" },
    {
      name: ["-v", "--verbose"],
      description: "Be verbose (this is the default)",
    },
    {
      name: ["-nv", "--no-verbose"],
      description: "Turn off verboseness, without being quiet",
    },
    {
      name: "--report-speed=TYPE",
      description: "Output bandwidth as TYPE.  TYPE can be bits",
    },
    {
      name: ["-i", "--input-file=FILE"],
      description: "Download URLs found in local or external FILE",
    },
    { name: ["-F", "--force-html"], description: "Treat input file as HTML" },
    {
      name: ["-B", "--base=URL"],
      description: "Resolves HTML input-file links (-i -F) relative to URL",
    },
    { name: "--config=FILE", description: "Specify config file to use" },
    { name: "--no-config", description: "Do not read any config file" },
    {
      name: "--rejected-log=FILE",
      description: "Log reasons for URL rejection to FILE",
    },
    {
      name: ["-t", "--tries=NUMBER"],
      description: "Set number of retries to NUMBER (0 unlimits)",
    },
    {
      name: "--retry-connrefused",
      description: "Retry even if connection is refused",
    },
    {
      name: "--retry-on-http-error",
      description: "Comma-separated list of HTTP errors to retry",
    },
    {
      name: ["-O", "--output-document=FILE"],
      description: "Write documents to FILE",
    },
    {
      name: ["-nc", "--no-clobber"],
      description:
        "Skip downloads that would download to existing files (overwriting them)",
    },
    {
      name: "--no-netrc",
      description: "Don't try to obtain credentials from .netrc",
    },
    {
      name: ["-c", "--continue"],
      description: "Resume getting a partially-downloaded file",
    },
    {
      name: "--start-pos=OFFSET",
      description: "Start downloading from zero-based position OFFSET",
    },
    { name: "--progress=TYPE", description: "Select progress gauge type" },
    {
      name: "--show-progress",
      description: "Display the progress bar in any verbosity mode",
    },
    {
      name: ["-N", "--timestamping"],
      description: "Don't re-retrieve files unless newer than local",
    },
    { name: ["-S", "--server-response"], description: "Print server response" },
    { name: "--spider", description: "Don't download anything" },
    {
      name: ["-T", "--timeout=SECONDS"],
      description: "Set all timeout values to SECONDS",
    },
    {
      name: "--dns-timeout=SECS",
      description: "Set the DNS lookup timeout to SECS",
    },
    {
      name: "--connect-timeout=SECS",
      description: "Set the connect timeout to SECS",
    },
    {
      name: "--read-timeout=SECS",
      description: "Set the read timeout to SECS",
    },
    {
      name: ["-w", "--wait=SECONDS"],
      description: "Wait SECONDS between retrievals",
    },
    {
      name: "--waitretry=SECONDS",
      description: "Wait 1..SECONDS between retries of a retrieval",
    },
    {
      name: "--random-wait",
      description: "Wait from 0.5*WAIT...1.5*WAIT secs between retrievals",
    },
    { name: "--no-proxy", description: "Explicitly turn off proxy" },
    {
      name: ["-Q", "--quota=NUMBER"],
      description: "Set retrieval quota to NUMBER",
    },
    {
      name: "--bind-address=ADDRESS",
      description: "Bind to ADDRESS (hostname or IP) on local host",
    },
    { name: "--limit-rate=RATE", description: "Limit download rate to RATE" },
    { name: "--no-dns-cache", description: "Disable caching DNS lookups" },
    {
      name: "--restrict-file-names=OS",
      description: "Restrict chars in file names to ones OS allows",
    },
    {
      name: "--ignore-case",
      description: "Ignore case when matching files/directories",
    },
    {
      name: ["-4", "--inet4-only"],
      description: "Connect only to IPv4 addresses",
    },
    {
      name: ["-6", "--inet6-only"],
      description: "Connect only to IPv6 addresses",
    },
    {
      name: "--user=USER",
      description: "Set both ftp and http user to USER",
    },
    {
      name: "--password=PASS",
      description: "Set both ftp and http password to PASS",
    },
    { name: "--ask-password", description: "Prompt for passwords" },
    { name: "--no-iri", description: "Turn off IRI support" },
    {
      name: "--local-encoding=ENC",
      description: "Use ENC as the local encoding for IRIs",
    },
    {
      name: "--remote-encoding=ENC",
      description: "Use ENC as the default remote encoding",
    },
    { name: "--unlink", description: "Remove file before clobber" },
    {
      name: "--xattr",
      description: "Turn on storage of metadata in extended file attributes",
    },
    {
      name: ["-nd", "--no-directories"],
      description: "Don't create directories",
    },
    {
      name: ["-x", "--force-directories"],
      description: "Force creation of directories",
    },
    {
      name: ["-nH", "--no-host-directories"],
      description: "Don't create host directories",
    },
    {
      name: "--protocol-directories",
      description: "Use protocol name in directories",
    },
    {
      name: ["-P", "--directory-prefix=PREFIX"],
      description: "Save files to PREFIX/",
    },
    {
      name: "--cut-dirs=NUMBER",
      description: "Ignore NUMBER remote directory components",
    },
    { name: "--http-user=USER", description: "Set http user to USER" },
    {
      name: "--http-password=PASS",
      description: "Set http password to PASS",
    },
    { name: "--no-cache", description: "Disallow server-cached data" },
    {
      name: ["-E", "--adjust-extension"],
      description: "Save HTML/CSS documents with proper extensions",
    },
    {
      name: "--ignore-length",
      description: "Ignore 'Content-Length' header field",
    },
    {
      name: "--header=STRING",
      description: "Insert STRING among the headers",
    },
    {
      name: "--compression=TYPE",
      description:
        "Choose compression, one of auto, gzip and none. (default: none)",
    },
    {
      name: "--max-redirect",
      description: "Maximum redirections allowed per page",
    },
    { name: "--proxy-user=USER", description: "Set USER as proxy username" },
    {
      name: "--proxy-password=PASS",
      description: "Set PASS as proxy password",
    },
    {
      name: "--referer=URL",
      description: "Include 'Referer: URL' header in HTTP request",
    },
    { name: "--save-headers", description: "Save the HTTP headers to file" },
    {
      name: ["-U", "--user-agent=AGENT"],
      description: "Identify as AGENT instead of Wget/VERSION",
    },
    {
      name: "--no-http-keep-alive",
      description: "Disable HTTP keep-alive (persistent connections)",
    },
    { name: "--no-cookies", description: "Don't use cookies" },
    {
      name: "--load-cookies=FILE",
      description: "Load cookies from FILE before session",
    },
    {
      name: "--save-cookies=FILE",
      description: "Save cookies to FILE after session",
    },
    {
      name: "--keep-session-cookies",
      description: "Load and save session (non-permanent) cookies",
    },
    {
      name: "--post-data=STRING",
      description: "Use the POST method; send STRING as the data",
    },
    {
      name: "--post-file=FILE",
      description: "Use the POST method; send contents of FILE",
    },
    {
      name: "--method=HTTPMethod",
      description: 'Use method "HTTPMethod" in the request',
    },
    {
      name: "--body-data=STRING",
      description: "Send STRING as data. --method MUST be set",
    },
    {
      name: "--body-file=FILE",
      description: "Send contents of FILE. --method MUST be set",
    },
    {
      name: "--content-on-error",
      description: "Output the received content on server errors",
    },
    {
      name: "--secure-protocol=PR",
      description: "Choose secure protocol, one of auto, SSLv2,",
    },
    { name: "--https-only", description: "Only follow secure HTTPS links" },
    {
      name: "--no-check-certificate",
      description: "Don't validate the server's certificate",
    },
    { name: "--certificate=FILE", description: "Client certificate file" },
    {
      name: "--certificate-type=TYPE",
      description: "Client certificate type, PEM or DER",
    },
    { name: "--private-key=FILE", description: "Private key file" },
    {
      name: "--private-key-type=TYPE",
      description: "Private key type, PEM or DER",
    },
    {
      name: "--ca-certificate=FILE",
      description: "File with the bundle of CAs",
    },
    {
      name: "--ca-directory=DIR",
      description: "Directory where hash list of CAs is stored",
    },
    { name: "--crl-file=FILE", description: "File with bundle of CRLs" },
    {
      name: "--ciphers=STR",
      description:
        "Set the priority string (GnuTLS) or cipher list string (OpenSSL) directly",
    },
    { name: ["-r", "--recursive"], description: "Specify recursive download" },
    {
      name: ["-l", "--level=NUMBER"],
      description: "Maximum recursion depth (inf or 0 for infinite)",
    },
    {
      name: "--delete-after",
      description: "Delete files locally after downloading them",
    },
    {
      name: ["-k", "--convert-links"],
      description: "Make links in downloaded HTML or CSS point to local files",
    },
    {
      name: ["-K", "--backup-converted"],
      description: "Before converting file X, back up as X.orig",
    },
    {
      name: ["-m", "--mirror"],
      description: "Shortcut for -N -r -l inf --no-remove-listing",
    },
    {
      name: ["-p", "--page-requisites"],
      description: "Get all images, etc. needed to display HTML page",
    },
    {
      name: ["-A", "--accept=LIST"],
      description: "Comma-separated list of accepted extensions",
    },
    {
      name: ["-R", "--reject=LIST"],
      description: "Comma-separated list of rejected extensions",
    },
    {
      name: "--accept-regex=REGEX",
      description: "Regex matching accepted URLs",
    },
    {
      name: "--reject-regex=REGEX",
      description: "Regex matching rejected URLs",
    },
    { name: "--regex-type=TYPE", description: "Regex type (posix)" },
    {
      name: ["-D", "--domains=LIST"],
      description: "Comma-separated list of accepted domains",
    },
    {
      name: "--exclude-domains=LIST",
      description: "Comma-separated list of rejected domains",
    },
    {
      name: "--follow-ftp",
      description: "Follow FTP links from HTML documents",
    },
    {
      name: "--follow-tags=LIST",
      description: "Comma-separated list of followed HTML tags",
    },
    {
      name: "--ignore-tags=LIST",
      description: "Comma-separated list of ignored HTML tags",
    },
    {
      name: ["-H", "--span-hosts"],
      description: "Go to foreign hosts when recursive",
    },
    { name: ["-L", "--relative"], description: "Follow relative links only" },
    {
      name: ["-I", "--include-directories=LIST"],
      description: "List of allowed directories",
    },
    {
      name: ["-X", "--exclude-directories=LIST"],
      description: "List of excluded directories",
    },
    {
      name: ["-np", "--no-parent"],
      description: "Don't ascend to the parent directory",
    },
  ],
};

// GNU Wget 1.20.3, a non-interactive network retriever.
// Usage: wget [OPTION]... [URL]...

// Mandatory arguments to long options are mandatory for short options too.

// Startup:
//   -V,  --version                   display the version of Wget and exit
//   -h,  --help                      print this help
//   -b,  --background                go to background after startup
//   -e,  --execute=COMMAND           execute a `.wgetrc'-style command

// Logging and input file:
//   -o,  --output-file=FILE          log messages to FILE
//   -a,  --append-output=FILE        append messages to FILE
//   -q,  --quiet                     quiet (no output)
//   -v,  --verbose                   be verbose (this is the default)
//   -nv, --no-verbose                turn off verboseness, without being quiet
//        --report-speed=TYPE         output bandwidth as TYPE.  TYPE can be bits
//   -i,  --input-file=FILE           download URLs found in local or external FILE
//   -F,  --force-html                treat input file as HTML
//   -B,  --base=URL                  resolves HTML input-file links (-i -F)
//                                      relative to URL
//        --config=FILE               specify config file to use
//        --no-config                 do not read any config file
//        --rejected-log=FILE         log reasons for URL rejection to FILE

// Download:
//   -t,  --tries=NUMBER              set number of retries to NUMBER (0 unlimits)
//        --retry-connrefused         retry even if connection is refused
//        --retry-on-http-error=ERRORS    comma-separated list of HTTP errors to retry
//   -O,  --output-document=FILE      write documents to FILE
//   -nc, --no-clobber                skip downloads that would download to
//                                      existing files (overwriting them)
//        --no-netrc                  don't try to obtain credentials from .netrc
//   -c,  --continue                  resume getting a partially-downloaded file
//        --start-pos=OFFSET          start downloading from zero-based position OFFSET
//        --progress=TYPE             select progress gauge type
//        --show-progress             display the progress bar in any verbosity mode
//   -N,  --timestamping              don't re-retrieve files unless newer than
//                                      local
//        --no-if-modified-since      don't use conditional if-modified-since get
//                                      requests in timestamping mode
//        --no-use-server-timestamps  don't set the local file's timestamp by
//                                      the one on the server
//   -S,  --server-response           print server response
//        --spider                    don't download anything
//   -T,  --timeout=SECONDS           set all timeout values to SECONDS
//        --dns-timeout=SECS          set the DNS lookup timeout to SECS
//        --connect-timeout=SECS      set the connect timeout to SECS
//        --read-timeout=SECS         set the read timeout to SECS
//   -w,  --wait=SECONDS              wait SECONDS between retrievals
//        --waitretry=SECONDS         wait 1..SECONDS between retries of a retrieval
//        --random-wait               wait from 0.5*WAIT...1.5*WAIT secs between retrievals
//        --no-proxy                  explicitly turn off proxy
//   -Q,  --quota=NUMBER              set retrieval quota to NUMBER
//        --bind-address=ADDRESS      bind to ADDRESS (hostname or IP) on local host
//        --limit-rate=RATE           limit download rate to RATE
//        --no-dns-cache              disable caching DNS lookups
//        --restrict-file-names=OS    restrict chars in file names to ones OS allows
//        --ignore-case               ignore case when matching files/directories
//   -4,  --inet4-only                connect only to IPv4 addresses
//   -6,  --inet6-only                connect only to IPv6 addresses
//        --prefer-family=FAMILY      connect first to addresses of specified family,
//                                      one of IPv6, IPv4, or none
//        --user=USER                 set both ftp and http user to USER
//        --password=PASS             set both ftp and http password to PASS
//        --ask-password              prompt for passwords
//        --use-askpass=COMMAND       specify credential handler for requesting
//                                      username and password.  If no COMMAND is
//                                      specified the WGET_ASKPASS or the SSH_ASKPASS
//                                      environment variable is used.
//        --no-iri                    turn off IRI support
//        --local-encoding=ENC        use ENC as the local encoding for IRIs
//        --remote-encoding=ENC       use ENC as the default remote encoding
//        --unlink                    remove file before clobber
//        --xattr                     turn on storage of metadata in extended file attributes

// Directories:
//   -nd, --no-directories            don't create directories
//   -x,  --force-directories         force creation of directories
//   -nH, --no-host-directories       don't create host directories
//        --protocol-directories      use protocol name in directories
//   -P,  --directory-prefix=PREFIX   save files to PREFIX/..
//        --cut-dirs=NUMBER           ignore NUMBER remote directory components

// HTTP options:
//        --http-user=USER            set http user to USER
//        --http-password=PASS        set http password to PASS
//        --no-cache                  disallow server-cached data
//        --default-page=NAME         change the default page name (normally
//                                      this is 'index.html'.)
//   -E,  --adjust-extension          save HTML/CSS documents with proper extensions
//        --ignore-length             ignore 'Content-Length' header field
//        --header=STRING             insert STRING among the headers
//        --compression=TYPE          choose compression, one of auto, gzip and none. (default: none)
//        --max-redirect              maximum redirections allowed per page
//        --proxy-user=USER           set USER as proxy username
//        --proxy-password=PASS       set PASS as proxy password
//        --referer=URL               include 'Referer: URL' header in HTTP request
//        --save-headers              save the HTTP headers to file
//   -U,  --user-agent=AGENT          identify as AGENT instead of Wget/VERSION
//        --no-http-keep-alive        disable HTTP keep-alive (persistent connections)
//        --no-cookies                don't use cookies
//        --load-cookies=FILE         load cookies from FILE before session
//        --save-cookies=FILE         save cookies to FILE after session
//        --keep-session-cookies      load and save session (non-permanent) cookies
//        --post-data=STRING          use the POST method; send STRING as the data
//        --post-file=FILE            use the POST method; send contents of FILE
//        --method=HTTPMethod         use method "HTTPMethod" in the request
//        --body-data=STRING          send STRING as data. --method MUST be set
//        --body-file=FILE            send contents of FILE. --method MUST be set
//        --content-disposition       honor the Content-Disposition header when
//                                      choosing local file names (EXPERIMENTAL)
//        --content-on-error          output the received content on server errors
//        --auth-no-challenge         send Basic HTTP authentication information
//                                      without first waiting for the server's
//                                      challenge

// HTTPS (SSL/TLS) options:
//        --secure-protocol=PR        choose secure protocol, one of auto, SSLv2,
//                                      SSLv3, TLSv1, TLSv1_1, TLSv1_2 and PFS
//        --https-only                only follow secure HTTPS links
//        --no-check-certificate      don't validate the server's certificate
//        --certificate=FILE          client certificate file
//        --certificate-type=TYPE     client certificate type, PEM or DER
//        --private-key=FILE          private key file
//        --private-key-type=TYPE     private key type, PEM or DER
//        --ca-certificate=FILE       file with the bundle of CAs
//        --ca-directory=DIR          directory where hash list of CAs is stored
//        --crl-file=FILE             file with bundle of CRLs
//        --pinnedpubkey=FILE/HASHES  Public key (PEM/DER) file, or any number
//                                    of base64 encoded sha256 hashes preceded by
//                                    'sha256//' and separated by ';', to verify
//                                    peer against
//        --random-file=FILE          file with random data for seeding the SSL PRNG

//        --ciphers=STR           Set the priority string (GnuTLS) or cipher list string (OpenSSL) directly.
//                                    Use with care. This option overrides --secure-protocol.
//                                    The format and syntax of this string depend on the specific SSL/TLS engine.
// HSTS options:
//        --no-hsts                   disable HSTS
//        --hsts-file                 path of HSTS database (will override default)

// FTP options:
//        --ftp-user=USER             set ftp user to USER
//        --ftp-password=PASS         set ftp password to PASS
//        --no-remove-listing         don't remove '.listing' files
//        --no-glob                   turn off FTP file name globbing
//        --no-passive-ftp            disable the "passive" transfer mode
//        --preserve-permissions      preserve remote file permissions
//        --retr-symlinks             when recursing, get linked-to files (not dir)

// FTPS options:
//        --ftps-implicit                 use implicit FTPS (default port is 990)
//        --ftps-resume-ssl               resume the SSL/TLS session started in the control connection when
//                                          opening a data connection
//        --ftps-clear-data-connection    cipher the control channel only; all the data will be in plaintext
//        --ftps-fallback-to-ftp          fall back to FTP if FTPS is not supported in the target server
// WARC options:
//        --warc-file=FILENAME        save request/response data to a .warc.gz file
//        --warc-header=STRING        insert STRING into the warcinfo record
//        --warc-max-size=NUMBER      set maximum size of WARC files to NUMBER
//        --warc-cdx                  write CDX index files
//        --warc-dedup=FILENAME       do not store records listed in this CDX file
//        --no-warc-compression       do not compress WARC files with GZIP
//        --no-warc-digests           do not calculate SHA1 digests
//        --no-warc-keep-log          do not store the log file in a WARC record
//        --warc-tempdir=DIRECTORY    location for temporary files created by the
//                                      WARC writer

// Recursive download:
//   -r,  --recursive                 specify recursive download
//   -l,  --level=NUMBER              maximum recursion depth (inf or 0 for infinite)
//        --delete-after              delete files locally after downloading them
//   -k,  --convert-links             make links in downloaded HTML or CSS point to
//                                      local files
//        --convert-file-only         convert the file part of the URLs only (usually known as the basename)
//        --backups=N                 before writing file X, rotate up to N backup files
//   -K,  --backup-converted          before converting file X, back up as X.orig
//   -m,  --mirror                    shortcut for -N -r -l inf --no-remove-listing
//   -p,  --page-requisites           get all images, etc. needed to display HTML page
//        --strict-comments           turn on strict (SGML) handling of HTML comments

// Recursive accept/reject:
//   -A,  --accept=LIST               comma-separated list of accepted extensions
//   -R,  --reject=LIST               comma-separated list of rejected extensions
//        --accept-regex=REGEX        regex matching accepted URLs
//        --reject-regex=REGEX        regex matching rejected URLs
//        --regex-type=TYPE           regex type (posix)
//   -D,  --domains=LIST              comma-separated list of accepted domains
//        --exclude-domains=LIST      comma-separated list of rejected domains
//        --follow-ftp                follow FTP links from HTML documents
//        --follow-tags=LIST          comma-separated list of followed HTML tags
//        --ignore-tags=LIST          comma-separated list of ignored HTML tags
//   -H,  --span-hosts                go to foreign hosts when recursive
//   -L,  --relative                  follow relative links only
//   -I,  --include-directories=LIST  list of allowed directories
//        --trust-server-names        use the name specified by the redirection
//                                      URL's last component
//   -X,  --exclude-directories=LIST  list of excluded directories
//   -np, --no-parent                 don't ascend to the parent directory

// Email bug reports, questions, discussions to <bug-wget@gnu.org>
// and/or open issues at https://savannah.gnu.org/bugs/?func=additem&group=wget.

export default completionSpec;
