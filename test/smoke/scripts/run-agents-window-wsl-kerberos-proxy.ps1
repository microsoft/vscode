#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------

<#
.SYNOPSIS
	Runs the Agents Window smoke test with an Agent Host in WSL that reaches the HTTPS mock model server only through a
	Kerberos-authenticated proxy, using the Windows client's proxy configuration, Kerberos ticket and certificates.

.DESCRIPTION
	In the WSL distribution, this starts an MIT Kerberos KDC and a Squid proxy that requires Kerberos, with a throwaway
	test CA for the mock server and, with -ProxyScheme Https, the proxy. On Windows, it registers the realm's KDC, trusts
	the test CA, allows Squid to reach the mock server through the firewall, and points the user's proxy settings at a
	PAC. Changing the machine configuration needs administrator rights: the script prompts once for setup and once for
	cleanup, unless it already runs elevated, as on CI agents. The smoke test then runs with network-only credentials for
	the realm, like `runas /netonly`, so only Windows can obtain Kerberos tickets. Every change is reverted afterwards,
	and logs are kept in .build/logs/agents-window-wsl-kerberos-proxy.

	The distribution needs krb5-kdc, krb5-admin-server, squid-openssl, openssl and curl, and NAT networking.

.EXAMPLE
	.\test\smoke\scripts\run-agents-window-wsl-kerberos-proxy.ps1 -WslServerPath ~/devel/vscode -WslNodePath ~/.local/node/bin/node
#>
[CmdletBinding(PositionalBinding = $false)]
param(
	[string]$Distribution = 'Ubuntu',
	# A Linux VS Code server, or a source checkout set up with `npm run install-fast` and `npm run build-fast -- --client-only`.
	[Parameter(Mandatory)][string]$WslServerPath,
	# The Linux Node for a source checkout, which has no bundled Node.
	[string]$WslNodePath,
	# A Linux `copilot-runtime`, next to its `runtime.node`, for the Agent Host to use instead of its bundled one.
	[string]$WslCopilotRuntimePath,
	# Whether clients use TLS to the proxy. The Copilot runtime authenticates with Kerberos only to `http://` proxies.
	[ValidateSet('Http', 'Https')][string]$ProxyScheme = 'Http',
	# Further smoke test arguments, such as `--build <path>`.
	[Parameter(ValueFromRemainingArguments)][string[]]$SmokeTestArguments = @()
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$Realm = 'VSCODE.PROXY.TEST'
$KerberosUser = 'smoketest'
$ServicePrincipal = 'HTTP/localhost'
$MockHost = 'vscode-smoke.test'
$ProxyPort = 3129
$PacPort = 44444
$CaSubject = 'VS Code Smoke Test WSL Kerberos Proxy CA'
$FirewallRuleName = 'VSCodeSmokeTestWslKerberosProxy'
$SmokeTestGrep = 'WSL AgentHost, Kerberos proxy'
$ProxyUrl = "$($ProxyScheme.ToLowerInvariant())://localhost:$ProxyPort"
$SquidPort = if ($ProxyScheme -eq 'Https') {
	'https_port 127.0.0.1:{0} tls-cert=$WSL_ROOT/server.pem tls-key=$WSL_ROOT/server.key' -f $ProxyPort
} else {
	"http_port 127.0.0.1:$ProxyPort"
}
$PacProxy = "$(if ($ProxyScheme -eq 'Https') { 'HTTPS' } else { 'PROXY' }) localhost:$ProxyPort"
$LogDirectory = Join-Path $RepositoryRoot '.build\logs\agents-window-wsl-kerberos-proxy'
$TempRoot = Join-Path ([IO.Path]::GetTempPath()) "vscode-agents-window-wsl-kerberos-proxy-$PID"
$WslRoot = "/tmp/vscode-agents-window-wsl-kerberos-proxy-$PID"
$Wsl = Join-Path $env:SystemRoot 'System32\wsl.exe'
$PowerShell = (Get-Process -Id $PID).Path
$env:WSL_UTF8 = '1'

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class VSCodeSmokeProxySettings {
	[StructLayout(LayoutKind.Sequential)]
	struct PerConnectionOption { public int Option; public IntPtr Value; }

	[StructLayout(LayoutKind.Sequential)]
	struct PerConnectionOptionList { public int Size; public IntPtr Connection; public int OptionCount; public int OptionError; public IntPtr Options; }

	[StructLayout(LayoutKind.Sequential)]
	struct CurrentUserIEProxyConfig { [MarshalAs(UnmanagedType.Bool)] public bool AutoDetect; public IntPtr AutoConfigUrl; public IntPtr Proxy; public IntPtr ProxyBypass; }

	[DllImport("wininet.dll", SetLastError = true)]
	static extern bool InternetSetOptionW(IntPtr internet, int option, IntPtr buffer, int bufferLength);

	[DllImport("wininet.dll", SetLastError = true)]
	static extern bool InternetQueryOptionW(IntPtr internet, int option, IntPtr buffer, ref int bufferLength);

	[DllImport("winhttp.dll", SetLastError = true)]
	static extern bool WinHttpGetIEProxyConfigForCurrentUser(ref CurrentUserIEProxyConfig config);

	[DllImport("kernel32.dll")]
	static extern IntPtr GlobalFree(IntPtr memory);

	const int PerConnectionOptionId = 75;
	const int SettingsChanged = 39;
	const int Refresh = 37;
	const int FlagsOption = 1;
	const int ProxyServerOption = 2;
	const int ProxyBypassOption = 3;
	const int AutoConfigUrlOption = 4;
	const int FlagsUIOption = 10;
	const int DirectFlag = 1;
	const int AutoProxyUrlFlag = 4;

	public sealed class Settings {
		public int Flags;
		public string ProxyServer;
		public string ProxyBypass;
		public string AutoConfigUrl;
	}

	public static Settings Query() {
		Settings settings = new Settings();
		IntPtr[] values = QueryOptions(new int[] { FlagsUIOption, ProxyServerOption, ProxyBypassOption, AutoConfigUrlOption });
		if (values == null) {
			values = QueryOptions(new int[] { FlagsOption, ProxyServerOption, ProxyBypassOption, AutoConfigUrlOption });
		}
		if (values == null) {
			throw new Win32Exception(Marshal.GetLastWin32Error());
		}
		settings.Flags = (int)(values[0].ToInt64() & 0xffffffff);
		settings.ProxyServer = TakeString(values[1]);
		settings.ProxyBypass = TakeString(values[2]);
		settings.AutoConfigUrl = TakeString(values[3]);
		return settings;
	}

	public static void UseAutoConfigUrl(string url) {
		Settings settings = new Settings();
		settings.Flags = DirectFlag | AutoProxyUrlFlag;
		settings.AutoConfigUrl = url;
		Apply(settings);
	}

	public static void Apply(Settings settings) {
		int size = Marshal.SizeOf(typeof(PerConnectionOption));
		IntPtr options = Marshal.AllocHGlobal(size * 4);
		IntPtr[] strings = new IntPtr[] {
			IntPtr.Zero,
			settings.ProxyServer == null ? IntPtr.Zero : Marshal.StringToHGlobalUni(settings.ProxyServer),
			settings.ProxyBypass == null ? IntPtr.Zero : Marshal.StringToHGlobalUni(settings.ProxyBypass),
			settings.AutoConfigUrl == null ? IntPtr.Zero : Marshal.StringToHGlobalUni(settings.AutoConfigUrl),
		};
		int[] ids = new int[] { FlagsOption, ProxyServerOption, ProxyBypassOption, AutoConfigUrlOption };
		try {
			for (int i = 0; i < ids.Length; i++) {
				PerConnectionOption option = new PerConnectionOption();
				option.Option = ids[i];
				option.Value = i == 0 ? new IntPtr(settings.Flags) : strings[i];
				Marshal.StructureToPtr(option, IntPtr.Add(options, i * size), false);
			}
			PerConnectionOptionList list = new PerConnectionOptionList();
			list.Size = Marshal.SizeOf(typeof(PerConnectionOptionList));
			list.OptionCount = ids.Length;
			list.Options = options;
			IntPtr listPointer = Marshal.AllocHGlobal(list.Size);
			try {
				Marshal.StructureToPtr(list, listPointer, false);
				if (!InternetSetOptionW(IntPtr.Zero, PerConnectionOptionId, listPointer, list.Size)) {
					throw new Win32Exception(Marshal.GetLastWin32Error());
				}
			} finally {
				Marshal.FreeHGlobal(listPointer);
			}
			InternetSetOptionW(IntPtr.Zero, SettingsChanged, IntPtr.Zero, 0);
			InternetSetOptionW(IntPtr.Zero, Refresh, IntPtr.Zero, 0);
		} finally {
			foreach (IntPtr value in strings) {
				if (value != IntPtr.Zero) {
					Marshal.FreeHGlobal(value);
				}
			}
			Marshal.FreeHGlobal(options);
		}
	}

	/// <summary>The PAC URL that WinHTTP, and so Chromium, reads for the current user.</summary>
	public static string GetEffectiveAutoConfigUrl() {
		CurrentUserIEProxyConfig config = new CurrentUserIEProxyConfig();
		if (!WinHttpGetIEProxyConfigForCurrentUser(ref config)) {
			throw new Win32Exception(Marshal.GetLastWin32Error());
		}
		TakeString(config.Proxy);
		TakeString(config.ProxyBypass);
		return TakeString(config.AutoConfigUrl);
	}

	static IntPtr[] QueryOptions(int[] ids) {
		int size = Marshal.SizeOf(typeof(PerConnectionOption));
		IntPtr options = Marshal.AllocHGlobal(size * ids.Length);
		PerConnectionOptionList list = new PerConnectionOptionList();
		list.Size = Marshal.SizeOf(typeof(PerConnectionOptionList));
		list.OptionCount = ids.Length;
		list.Options = options;
		IntPtr listPointer = Marshal.AllocHGlobal(list.Size);
		try {
			for (int i = 0; i < ids.Length; i++) {
				PerConnectionOption option = new PerConnectionOption();
				option.Option = ids[i];
				Marshal.StructureToPtr(option, IntPtr.Add(options, i * size), false);
			}
			Marshal.StructureToPtr(list, listPointer, false);
			int length = list.Size;
			if (!InternetQueryOptionW(IntPtr.Zero, PerConnectionOptionId, listPointer, ref length)) {
				return null;
			}
			IntPtr[] values = new IntPtr[ids.Length];
			for (int i = 0; i < ids.Length; i++) {
				values[i] = ((PerConnectionOption)Marshal.PtrToStructure(IntPtr.Add(options, i * size), typeof(PerConnectionOption))).Value;
			}
			return values;
		} finally {
			Marshal.FreeHGlobal(listPointer);
			Marshal.FreeHGlobal(options);
		}
	}

	static string TakeString(IntPtr value) {
		if (value == IntPtr.Zero) {
			return null;
		}
		string result = Marshal.PtrToStringUni(value);
		GlobalFree(value);
		return result;
	}
}

public static class VSCodeSmokeNetOnlyProcess {
	[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
	struct StartupInfo {
		public int Size;
		public string Reserved;
		public string Desktop;
		public string Title;
		public int X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
		public short ShowWindow, Reserved2Size;
		public IntPtr Reserved2, StdInput, StdOutput, StdError;
	}

	[StructLayout(LayoutKind.Sequential)]
	struct ProcessInformation { public IntPtr Process; public IntPtr Thread; public int ProcessId; public int ThreadId; }

	[DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
	static extern bool CreateProcessWithLogonW(string userName, string domain, string password, int logonFlags, string applicationName, StringBuilder commandLine, int creationFlags, IntPtr environment, string currentDirectory, ref StartupInfo startupInfo, out ProcessInformation processInformation);

	[DllImport("kernel32.dll", SetLastError = true)]
	static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

	[DllImport("kernel32.dll", SetLastError = true)]
	static extern bool GetExitCodeProcess(IntPtr process, out int exitCode);

	[DllImport("kernel32.dll", SetLastError = true)]
	static extern bool CloseHandle(IntPtr handle);

	public sealed class Handle : IDisposable {
		internal IntPtr Process;
		public int Id;

		public bool WaitForExit(int milliseconds) {
			return WaitForSingleObject(Process, (uint)milliseconds) == 0;
		}

		public int ExitCode {
			get {
				int exitCode;
				if (!GetExitCodeProcess(Process, out exitCode)) {
					throw new Win32Exception(Marshal.GetLastWin32Error());
				}
				return exitCode;
			}
		}

		public void Dispose() {
			if (Process != IntPtr.Zero) {
				CloseHandle(Process);
				Process = IntPtr.Zero;
			}
		}
	}

	/// <summary>Starts a hidden process that uses the given credentials for network authentication only.</summary>
	public static Handle Start(string userName, string domain, string password, string commandLine, string currentDirectory, string[] environment) {
		const int NetCredentialsOnly = 2;
		const int UnicodeEnvironment = 0x400;
		const int UseShowWindow = 1;
		StringBuilder block = new StringBuilder();
		foreach (string variable in environment) {
			block.Append(variable).Append('\0');
		}
		block.Append('\0');
		IntPtr environmentBlock = Marshal.StringToHGlobalUni(block.ToString());
		try {
			StartupInfo startupInfo = new StartupInfo();
			startupInfo.Size = Marshal.SizeOf(typeof(StartupInfo));
			startupInfo.Flags = UseShowWindow;
			ProcessInformation information;
			if (!CreateProcessWithLogonW(userName, domain, password, NetCredentialsOnly, null, new StringBuilder(commandLine), UnicodeEnvironment, environmentBlock, currentDirectory, ref startupInfo, out information)) {
				throw new Win32Exception(Marshal.GetLastWin32Error());
			}
			CloseHandle(information.Thread);
			Handle handle = new Handle();
			handle.Process = information.Process;
			handle.Id = information.ProcessId;
			return handle;
		} finally {
			Marshal.FreeHGlobal(environmentBlock);
		}
	}
}
'@

function ConvertTo-ShellLiteral([string]$Value) {
	return "'" + $Value.Replace("'", "'\''") + "'"
}

function ConvertTo-PowerShellLiteral([string]$Value) {
	return "'" + $Value.Replace("'", "''") + "'"
}

$script:WslScriptCount = 0

# Runs a bash script in the distribution, from a file because wsl.exe garbles multi-line command-line arguments.
function Invoke-WslScript([string]$Script, [switch]$AsRoot) {
	$script:WslScriptCount++
	$name = "wsl-$script:WslScriptCount.sh"
	$prelude = @(
		'exec 2>&1'
		'set -euo pipefail'
		"WSL_ROOT=$(ConvertTo-ShellLiteral $WslRoot)"
		"REALM=$(ConvertTo-ShellLiteral $Realm)"
	) -join "`n"
	[IO.File]::WriteAllText((Join-Path $TempRoot $name), "$prelude`n$($Script.Replace("`r`n", "`n"))`n", [Text.UTF8Encoding]::new($false))
	$arguments = @('--distribution', $Distribution)
	if ($AsRoot) {
		$arguments += @('--user', 'root')
	}
	$output = & $Wsl @arguments --exec bash "$script:WslTempRoot/$name"
	if ($LASTEXITCODE -ne 0) {
		throw "WSL step failed with exit code ${LASTEXITCODE}:`n$($output -join "`n")"
	}
	return $output
}

# Starts a long-lived WSL process, which also keeps the distribution running.
function Start-WslProcess([string]$Name, [string]$Script, [switch]$AsRoot) {
	$file = Join-Path $TempRoot "$Name.sh"
	[IO.File]::WriteAllText($file, "$($Script.Replace("`r`n", "`n"))`n", [Text.UTF8Encoding]::new($false))
	$arguments = "--distribution $Distribution $(if ($AsRoot) { '--user root ' })--exec bash `"$script:WslTempRoot/$Name.sh`""
	return Start-Process -FilePath $Wsl -ArgumentList $arguments -WindowStyle Hidden -PassThru `
		-RedirectStandardOutput (Join-Path $TempRoot "$Name.out.log") -RedirectStandardError (Join-Path $TempRoot "$Name.err.log")
}

function Wait-WslPort([int]$Port, [string]$Name) {
	for ($i = 0; $i -lt 100; $i++) {
		if ((Invoke-WslScript "if [ -n `"`$(ss -Hltn 'sport = :$Port')`" ]; then echo ready; fi") -contains 'ready') {
			return
		}
		Start-Sleep -Milliseconds 200
	}
	throw "$Name did not listen on port $Port in WSL"
}

function Test-TcpPort([string]$HostName, [int]$Port) {
	$client = [Net.Sockets.TcpClient]::new()
	try {
		return $client.ConnectAsync($HostName, $Port).Wait(3000) -and $client.Connected
	} catch {
		return $false
	} finally {
		$client.Dispose()
	}
}

# Applies or reverts the machine-wide test configuration with administrator rights, prompting for them unless this
# process already has them, as on CI agents, after removing any leftovers of an interrupted run. The realm, CA and
# firewall rule exist only for this smoke test.
function Invoke-ElevatedConfiguration([ValidateSet('Setup', 'Cleanup')][string]$Mode) {
	$elevatedScript = Join-Path $TempRoot 'elevated.ps1'
	[IO.File]::WriteAllText($elevatedScript, @'
param([string]$Mode, [string]$Realm, [string]$Kdc, [string]$CaPath, [string]$CaSubject, [string]$RuleName, [string]$WslAddress, [string]$LogPath)
$ErrorActionPreference = 'Stop'
Start-Transcript -Path $LogPath -Append | Out-Null
try {
	ksetup /delhosttorealmmap localhost $Realm | Out-Null
	if ($Kdc) {
		ksetup /delkdc $Realm $Kdc | Out-Null
	}
	foreach ($key in "Domains\$Realm", "HostToRealm\$Realm") {
		Remove-Item "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\Kerberos\$key" -Recurse -ErrorAction SilentlyContinue
	}
	Get-ChildItem Cert:\LocalMachine\Root | Where-Object Subject -EQ "CN=$CaSubject" | Remove-Item
	Get-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
	if ($Mode -eq 'Setup') {
		ksetup /addkdc $Realm $Kdc
		if ($LASTEXITCODE -ne 0) {
			throw "ksetup /addkdc failed with exit code $LASTEXITCODE"
		}
		ksetup /addhosttorealmmap localhost $Realm
		if ($LASTEXITCODE -ne 0) {
			throw "ksetup /addhosttorealmmap failed with exit code $LASTEXITCODE"
		}
		certutil -f -addstore Root $CaPath | Out-Null
		if ($LASTEXITCODE -ne 0) {
			throw "certutil -addstore failed with exit code $LASTEXITCODE"
		}
		New-NetFirewallRule -Name $RuleName -DisplayName 'VS Code smoke test: WSL Kerberos proxy to the mock server' -Direction Inbound -Action Allow -Protocol TCP -RemoteAddress $WslAddress | Out-Null
	}
} finally {
	Stop-Transcript | Out-Null
}
'@, [Text.UTF8Encoding]::new($true))
	$parameters = @('-Mode', $Mode, '-Realm', $Realm, '-CaPath', (Join-Path $TempRoot 'ca.pem'), '-CaSubject', $CaSubject, '-RuleName', $FirewallRuleName, '-LogPath', (Join-Path $TempRoot 'elevated.log'))
	if ($script:KdcAddress) {
		$parameters += @('-Kdc', $script:KdcAddress)
	}
	if ($script:WslAddress) {
		$parameters += @('-WslAddress', $script:WslAddress)
	}
	$action = if ($Mode -eq 'Setup') { 'register the test Kerberos realm, CA and firewall rule' } else { 'remove the test Kerberos realm, CA and firewall rule' }
	if ($IsElevated) {
		Write-Host "Running elevated, so going to $action without a prompt..."
		& $PowerShell -NoProfile -ExecutionPolicy Bypass -File $elevatedScript @parameters | Out-Null
		$exitCode = $LASTEXITCODE
	} else {
		Write-Host "Requesting administrator rights to $action..."
		$arguments = (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $elevatedScript) + $parameters | ForEach-Object { if ($_.StartsWith('-')) { $_ } else { "`"$_`"" } }) -join ' '
		$exitCode = (Start-Process -FilePath $PowerShell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList $arguments).ExitCode
	}
	# Declining the prompt throws above, before anything changed.
	$script:WindowsConfigured = $Mode -eq 'Setup'
	if ($exitCode -ne 0) {
		throw "The elevated $Mode step failed with exit code $exitCode; see $(Join-Path $TempRoot 'elevated.log')"
	}
}

function Stop-WslProcess([System.Diagnostics.Process]$Process, [string]$PidFile, [switch]$AsRoot) {
	if (-not $Process) {
		return
	}
	try {
		Invoke-WslScript -AsRoot:$AsRoot "if [ -f $(ConvertTo-ShellLiteral $PidFile) ]; then kill -TERM `"`$(cat $(ConvertTo-ShellLiteral $PidFile))`" 2>/dev/null || true; fi" | Out-Null
	} catch {
		Write-Warning $_
	}
	if (-not $Process.WaitForExit(15000)) {
		$Process.Kill()
	}
}

if ([Environment]::OSVersion.Platform -ne 'Win32NT') {
	throw 'This smoke test requires Windows.'
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$IsElevated = [Security.Principal.WindowsPrincipal]::new($identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($identity.IsSystem) {
	throw 'Network-only logons cannot start from LocalSystem; run this script as a user.'
}
if (-not $IsElevated -and ($env:CI -or $env:TF_BUILD)) {
	throw 'CI cannot answer administrator prompts; run this script from an elevated process.'
}
$distributions = (& $Wsl --list --quiet) -replace "`0", '' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if ($distributions -notcontains $Distribution) {
	throw "WSL distribution '$Distribution' not found; available: $($distributions -join ', ')"
}
if ((Get-Service seclogon).StartType -eq 'Disabled') {
	throw 'The Secondary Logon (seclogon) service is disabled; network-only logons need it.'
}
$pacServer = Join-Path $RepositoryRoot 'test\smoke\out\networkProxy\pacServer.js'
if (-not (Test-Path $pacServer)) {
	throw "Missing $pacServer; compile the smoke tests first (cd test\smoke; npm run compile)."
}
if (Test-TcpPort '127.0.0.1' $PacPort) {
	throw "Port $PacPort must be available for the PAC server."
}

New-Item -ItemType Directory -Force $TempRoot, $LogDirectory | Out-Null
Get-ChildItem $LogDirectory | Remove-Item -Recurse -Force
$script:WslTempRoot = (& $Wsl --distribution $Distribution --exec wslpath -u $TempRoot).Trim()
$wslUser = (& $Wsl --distribution $Distribution --exec id -un).Trim()
$wslHome = (& $Wsl --distribution $Distribution --exec sh -c 'printf %s "$HOME"').Trim()
function Resolve-WslPath([string]$Path) {
	if ($Path -eq '~' -or $Path.StartsWith('~/')) {
		$Path = $wslHome + $Path.Substring(1)
	}
	if (-not $Path.StartsWith('/')) {
		throw "Expected an absolute Linux path: $Path"
	}
	return $Path
}
$WslServerPath = Resolve-WslPath $WslServerPath
if ($WslNodePath) {
	$WslNodePath = Resolve-WslPath $WslNodePath
}
if ($WslCopilotRuntimePath) {
	$WslCopilotRuntimePath = Resolve-WslPath $WslCopilotRuntimePath
}

$password = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
$savedProxySettings = $null
$script:WindowsConfigured = $false
$kdcProcess = $null
$squidProcess = $null
$pacProcess = $null
$smokeProcess = $null
$script:KdcAddress = $null
$script:WslAddress = $null
$succeeded = $false

try {
	$network = Invoke-WslScript @"
for tool in krb5kdc kdb5_util kadmin.local squid openssl curl ip ss; do
	command -v "`$tool" >/dev/null || { echo "Missing `$tool; install krb5-kdc krb5-admin-server squid-openssl openssl curl iproute2"; exit 1; }
done
test -x /usr/lib/squid/negotiate_kerberos_auth || { echo 'Missing the Squid negotiate_kerberos_auth helper'; exit 1; }
if command -v wslinfo >/dev/null && [ "`$(wslinfo --networking-mode)" != nat ]; then echo 'WSL must use NAT networking'; exit 1; fi
for port in 88 $ProxyPort; do
	if [ -n "`$(ss -Hltnu "sport = :`$port")" ]; then echo "Port `$port must be available in WSL"; exit 1; fi
done
echo "wsl=`$(hostname -I | awk '{ print `$1 }')"
echo "host=`$(ip route show default | awk '{ print `$3; exit }')"
"@
	$script:WslAddress = ($network | Where-Object { $_ -like 'wsl=*' }).Substring(4)
	$hostAddress = ($network | Where-Object { $_ -like 'host=*' }).Substring(5)
	if ($script:WslAddress -notmatch '^\d+\.\d+\.\d+\.\d+$' -or $hostAddress -notmatch '^\d+\.\d+\.\d+\.\d+$') {
		throw "Unexpected WSL ($script:WslAddress) or Windows host ($hostAddress) address"
	}
	$script:KdcAddress = $script:WslAddress

	Write-Host "Creating the $Realm realm, test CA and Squid configuration in $Distribution..."
	Invoke-WslScript -AsRoot @"
WSL_USER=$(ConvertTo-ShellLiteral $wslUser)
PASSWORD=$(ConvertTo-ShellLiteral $password)
WIN_ROOT=$(ConvertTo-ShellLiteral $script:WslTempRoot)
rm -rf "`$WSL_ROOT"
mkdir -p "`$WSL_ROOT/kdc"
chmod 700 "`$WSL_ROOT/kdc"
cd "`$WSL_ROOT"
cat > krb5.conf <<EOF
[libdefaults]
	default_realm = `$REALM
	dns_lookup_realm = false
	dns_lookup_kdc = false
	rdns = false
[realms]
	`$REALM = {
		kdc = 127.0.0.1:88
	}
[domain_realm]
	localhost = `$REALM
EOF
# Windows supports only the SHA-1 AES encryption types.
cat > kdc/kdc.conf <<EOF
[kdcdefaults]
	kdc_listen = 88
	kdc_tcp_listen = 88
[realms]
	`$REALM = {
		database_name = `$WSL_ROOT/kdc/principal
		key_stash_file = `$WSL_ROOT/kdc/stash
		acl_file = `$WSL_ROOT/kdc/kadm5.acl
		max_life = 1d
		master_key_type = aes256-cts-hmac-sha1-96
		supported_enctypes = aes256-cts-hmac-sha1-96:normal aes128-cts-hmac-sha1-96:normal
	}
[logging]
	kdc = FILE:`$WSL_ROOT/kdc/kdc.log
EOF
touch kdc/kadm5.acl
export KRB5_CONFIG="`$WSL_ROOT/krb5.conf" KRB5_KDC_PROFILE="`$WSL_ROOT/kdc/kdc.conf"
kdb5_util create -s -r "`$REALM" -P "`$(head -c 32 /dev/urandom | base64)" >/dev/null
kadmin.local -q "addprinc -pw `$PASSWORD $KerberosUser" >/dev/null
kadmin.local -q "addprinc -randkey $ServicePrincipal" >/dev/null
kadmin.local -q "ktadd -k `$WSL_ROOT/proxy.keytab $ServicePrincipal" >/dev/null

cat > tls.cnf <<EOF
[req]
distinguished_name = dn
prompt = no
[dn]
CN = $MockHost
[ca]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
[server]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:$MockHost,DNS:localhost,IP:127.0.0.1
EOF
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -sha256 -config tls.cnf -extensions ca -subj "/CN=$CaSubject" -keyout ca.key -out ca.pem 2>/dev/null
openssl req -new -newkey rsa:2048 -nodes -sha256 -config tls.cnf -keyout server.key -out server.csr 2>/dev/null
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 1 -sha256 -extfile tls.cnf -extensions server -out server.pem 2>/dev/null
rm ca.key server.csr
cp ca.pem server.pem server.key "`$WIN_ROOT/"

# Only Squid resolves the mock host, so nothing reaches it except through the proxy.
echo "$hostAddress $MockHost" > hosts
cat > squid.conf <<EOF
visible_hostname vscode-smoke-proxy
$SquidPort
hosts_file `$WSL_ROOT/hosts
cache deny all
cache_mem 8 MB
cache_store_log none
netdb_filename none
access_log stdio:`$WSL_ROOT/squid-access.log
cache_log `$WSL_ROOT/squid.log
pid_filename `$WSL_ROOT/squid.pid
coredump_dir `$WSL_ROOT
shutdown_lifetime 1 seconds
auth_param negotiate program /usr/lib/squid/negotiate_kerberos_auth -k `$WSL_ROOT/proxy.keytab -s $ServicePrincipal@`$REALM -i
auth_param negotiate children 5
auth_param negotiate keep_alive on
acl authenticated proxy_auth REQUIRED
http_access allow authenticated
http_access deny all
EOF
chown "`$WSL_USER" "`$WSL_ROOT" "`$WSL_ROOT"/*.* "`$WSL_ROOT/hosts" "`$WSL_ROOT/proxy.keytab"
"@ | Out-Null

	$kdcProcess = Start-WslProcess -AsRoot 'kdc' "echo `$`$ > $WslRoot/kdc/wrapper.pid; KRB5_CONFIG=$WslRoot/krb5.conf KRB5_KDC_PROFILE=$WslRoot/kdc/kdc.conf exec krb5kdc -n"
	Wait-WslPort 88 'The Kerberos KDC'
	$squidProcess = Start-WslProcess 'squid' "echo `$`$ > $WslRoot/wrapper.pid; KRB5_CONFIG=$WslRoot/krb5.conf KRB5_KTNAME=FILE:$WslRoot/proxy.keytab exec squid -N -f $WslRoot/squid.conf"
	Wait-WslPort $ProxyPort 'Squid'
	$unauthenticated = Invoke-WslScript "curl --silent --output /dev/null --max-time 10 --proxy $ProxyUrl --proxy-cacert `$WSL_ROOT/ca.pem --proxytunnel --write-out '%{http_connect}' https://localhost:$ProxyPort/ || true"
	if (($unauthenticated -join '') -ne '407') {
		throw "Expected Squid to require proxy authentication (HTTP 407), got '$($unauthenticated -join '')'"
	}
	if (-not (Test-TcpPort $script:KdcAddress 88)) {
		throw "Windows cannot reach the KDC at $($script:KdcAddress):88"
	}
	if (-not (Test-TcpPort '127.0.0.1' $ProxyPort)) {
		throw "Windows cannot reach Squid at localhost:$ProxyPort; WSL localhost forwarding must be enabled"
	}

	Invoke-ElevatedConfiguration 'Setup'

	# The PAC applies to the whole user session, so only the mock model server uses the authenticated proxy.
	$pacFile = Join-Path $TempRoot 'proxy.pac'
	[IO.File]::WriteAllText($pacFile, "function FindProxyForURL(url, host) {`n`treturn host === '$MockHost' ? '$PacProxy' : 'DIRECT';`n}`n")
	$pacProcess = Start-Process -FilePath node -ArgumentList "`"$pacServer`" `"$pacFile`"" `
		-WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $TempRoot 'pac-server.log') -RedirectStandardError (Join-Path $TempRoot 'pac-server.err.log')
	for ($i = 0; -not (Test-TcpPort '127.0.0.1' $PacPort); $i++) {
		if ($i -ge 50) {
			throw 'The PAC server did not start'
		}
		Start-Sleep -Milliseconds 100
	}
	$pacUrl = "http://127.0.0.1:$PacPort/proxy.pac"
	$savedProxySettings = [VSCodeSmokeProxySettings]::Query()
	[VSCodeSmokeProxySettings]::UseAutoConfigUrl($pacUrl)
	$effectivePacUrl = [VSCodeSmokeProxySettings]::GetEffectiveAutoConfigUrl()
	if ($effectivePacUrl -ne $pacUrl) {
		throw "Windows did not apply the PAC URL, possibly because of a proxy policy; WinHTTP reports '$effectivePacUrl'"
	}

	$proxyHeader = "vscode-smoke-wsl-kerberos-proxy-$PID"
	$excluded = '^(?i:(http|https|all|no)_proxy|NODE_EXTRA_CA_CERTS|SSL_CERT_(FILE|DIR)|KRB5CCNAME|ELECTRON_RUN_AS_NODE|VSCODE_SMOKE_TEST_.*)$'
	$environment = @{}
	foreach ($variable in Get-ChildItem Env:) {
		if ($variable.Name -notmatch $excluded) {
			$environment[$variable.Name] = $variable.Value
		}
	}
	$environment['VSCODE_SMOKE_TEST_WSL_KERBEROS_PROXY'] = $ProxyScheme.ToLowerInvariant()
	$environment['VSCODE_SMOKE_TEST_WSL_DISTRO'] = $Distribution
	$environment['VSCODE_SMOKE_TEST_WSL_SERVER_PATH'] = $WslServerPath
	if ($WslNodePath) {
		$environment['VSCODE_SMOKE_TEST_WSL_NODE'] = $WslNodePath
	}
	if ($WslCopilotRuntimePath) {
		$environment['VSCODE_SMOKE_TEST_WSL_COPILOT_RUNTIME_PATH'] = $WslCopilotRuntimePath
	}
	$environment['VSCODE_SMOKE_TEST_MOCK_HOST'] = $MockHost
	$environment['VSCODE_SMOKE_TEST_PROXY_HEADER'] = $proxyHeader
	$environment['VSCODE_SMOKE_TEST_MOCK_CERT'] = Join-Path $TempRoot 'server.pem'
	$environment['VSCODE_SMOKE_TEST_MOCK_KEY'] = Join-Path $TempRoot 'server.key'
	$environmentBlock = [string[]]($environment.Keys | Sort-Object { $_.ToUpperInvariant() } | ForEach-Object { "$_=$($environment[$_])" })

	$smokeArguments = @('run', 'smoketest-no-compile', '--', '--tracing', '-g', $SmokeTestGrep, '--fail-zero') + $SmokeTestArguments
	$netOnlyScript = Join-Path $TempRoot 'netonly.ps1'
	[IO.File]::WriteAllText($netOnlyScript, @"
`$ErrorActionPreference = 'Continue'
Set-Location $(ConvertTo-PowerShellLiteral $RepositoryRoot)
Write-Output 'Kerberos ticket for $ServicePrincipal from the $Realm KDC:'
klist get $ServicePrincipal
if (`$LASTEXITCODE -ne 0) {
	Write-Output 'Windows could not obtain a Kerberos ticket for $ServicePrincipal with the $Realm credentials.'
	exit 1
}
& npm.cmd $(($smokeArguments | ForEach-Object { ConvertTo-PowerShellLiteral $_ }) -join ' ')
exit `$LASTEXITCODE
"@, [Text.UTF8Encoding]::new($true))
	$smokeLog = Join-Path $TempRoot 'smoke-test.log'
	New-Item -ItemType File $smokeLog | Out-Null
	Write-Host "Running the smoke test with network-only credentials for $KerberosUser@$Realm..."
	$smokeProcess = [VSCodeSmokeNetOnlyProcess]::Start($KerberosUser, $Realm, $password,
		"`"$env:ComSpec`" /d /s /c `"`"$PowerShell`" -NoProfile -ExecutionPolicy Bypass -File `"$netOnlyScript`" > `"$smokeLog`" 2>&1`"",
		$RepositoryRoot, $environmentBlock)
	$reader = [IO.StreamReader]::new([IO.FileStream]::new($smokeLog, 'Open', 'Read', 'ReadWrite, Delete'))
	try {
		while (-not $smokeProcess.WaitForExit(500)) {
			[Console]::Out.Write($reader.ReadToEnd())
		}
		[Console]::Out.Write($reader.ReadToEnd())
	} finally {
		$reader.Dispose()
	}
	$smokeExitCode = $smokeProcess.ExitCode
	$smokeProcess.Dispose()
	$smokeProcess = $null
	if ($smokeExitCode -ne 0) {
		throw "The smoke test failed with exit code $smokeExitCode"
	}

	# Stopping Squid flushes its access log.
	Stop-WslProcess $squidProcess "$WslRoot/wrapper.pid"
	$squidProcess = $null
	Invoke-WslScript -AsRoot "cp `"`$WSL_ROOT/squid-access.log`" `"`$WSL_ROOT/kdc/kdc.log`" $(ConvertTo-ShellLiteral $script:WslTempRoot)/" | Out-Null
	$pacLog = Get-Content (Join-Path $TempRoot 'pac-server.log') -Raw
	if ($pacLog -notmatch 'GET /') {
		throw 'Windows did not fetch the PAC script.'
	}
	$accessLog = Get-Content (Join-Path $TempRoot 'squid-access.log')
	if (-not ($accessLog | Where-Object { $_.Contains('TCP_TUNNEL/200') -and $_.Contains("CONNECT ${MockHost}:") -and $_.Contains(" $KerberosUser@$Realm ") })) {
		throw "Squid has no Kerberos-authenticated tunnel to $MockHost."
	}
	$kdcLog = Get-Content (Join-Path $TempRoot 'kdc.log')
	if (-not ($kdcLog | Where-Object { $_ -match "TGS_REQ .* $([regex]::Escape($hostAddress)): ISSUE: .* $KerberosUser@$Realm for $([regex]::Escape("$ServicePrincipal@$Realm"))" })) {
		throw "The KDC did not issue a $ServicePrincipal ticket to Windows ($hostAddress)."
	}
	$succeeded = $true
	Write-Host 'Verified the PAC, Kerberos-authenticated tunnels through Squid and KDC tickets issued to Windows.'
} finally {
	if ($smokeProcess) {
		& taskkill.exe /PID $smokeProcess.Id /T /F | Out-Null
		$smokeProcess.Dispose()
	}
	if ($savedProxySettings) {
		try {
			[VSCodeSmokeProxySettings]::Apply($savedProxySettings)
		} catch {
			Write-Warning "Could not restore the proxy settings: $_"
		}
	}
	if ($pacProcess -and -not $pacProcess.HasExited) {
		$pacProcess.Kill()
	}
	Stop-WslProcess $squidProcess "$WslRoot/wrapper.pid"
	Stop-WslProcess -AsRoot $kdcProcess "$WslRoot/kdc/wrapper.pid"
	if ($script:WindowsConfigured) {
		try {
			Invoke-ElevatedConfiguration 'Cleanup'
		} catch {
			Write-Warning "Could not remove the Windows test configuration: $_. Remove it with 'ksetup /delkdc $Realm $($script:KdcAddress)', 'ksetup /delhosttorealmmap localhost $Realm', the '$CaSubject' certificate from the machine root store and the '$FirewallRuleName' firewall rule."
		}
	}
	try {
		Invoke-WslScript -AsRoot "for log in squid-access.log squid.log kdc/kdc.log; do if [ -f `"`$WSL_ROOT/`$log`" ]; then cp `"`$WSL_ROOT/`$log`" $(ConvertTo-ShellLiteral $script:WslTempRoot)/; fi; done; rm -rf `"`$WSL_ROOT`"" | Out-Null
	} catch {
		Write-Warning "Could not remove $WslRoot in WSL: $_"
	}
	Get-ChildItem $TempRoot -Filter '*.log' -ErrorAction SilentlyContinue | Copy-Item -Destination $LogDirectory
	if (-not $succeeded) {
		foreach ($log in 'squid.log', 'squid-access.log', 'kdc.log', 'pac-server.log', 'elevated.log') {
			$path = Join-Path $LogDirectory $log
			if (Test-Path $path) {
				Write-Host "--- $log"
				Get-Content $path -Tail 40
			}
		}
	}
	Remove-Item -Recurse -Force $TempRoot -ErrorAction SilentlyContinue
	Write-Host "Logs: $LogDirectory"
}
