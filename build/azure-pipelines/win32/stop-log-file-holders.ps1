#---------------------------------------------------------------------------------------------
#  Copyright (c) Microsoft Corporation. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
#---------------------------------------------------------------------------------------------

# Stops the processes that still hold files under -Path open, so that publishing those files does not
# fail with "being used by another process". A test process can outlive its test, for example a git.exe
# started by an extension host, and it can hold log files it inherited from the process that started it,
# so the holders are found by file, with the Restart Manager, rather than by executable path.

param(
	[Parameter(Mandatory = $true)]
	[string] $Path
)

$ErrorActionPreference = 'Continue'

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class LogFileHolders {
	[StructLayout(LayoutKind.Sequential)]
	struct RM_UNIQUE_PROCESS {
		public int dwProcessId;
		public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
	}

	[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
	struct RM_PROCESS_INFO {
		public RM_UNIQUE_PROCESS Process;
		[MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAppName;
		[MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string strServiceShortName;
		public int ApplicationType;
		public uint AppStatus;
		public uint TSSessionId;
		[MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
	}

	const int ERROR_MORE_DATA = 234;

	[DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
	static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, StringBuilder strSessionKey);

	[DllImport("rstrtmgr.dll")]
	static extern int RmEndSession(uint pSessionHandle);

	[DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
	static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames, uint nApplications, IntPtr rgApplications, uint nServices, string[] rgsServiceNames);

	[DllImport("rstrtmgr.dll")]
	static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);

	public static int[] Get(string[] files) {
		uint session;
		int result = RmStartSession(out session, 0, new StringBuilder(33));
		if (result != 0) {
			throw new Win32Exception(result);
		}
		try {
			result = RmRegisterResources(session, (uint)files.Length, files, 0, IntPtr.Zero, 0, null);
			if (result != 0) {
				throw new Win32Exception(result);
			}
			uint needed, count = 0, reasons = 0;
			result = RmGetList(session, out needed, ref count, null, ref reasons);
			if (result == 0) {
				return new int[0];
			}
			if (result != ERROR_MORE_DATA) {
				throw new Win32Exception(result);
			}
			RM_PROCESS_INFO[] infos = new RM_PROCESS_INFO[needed];
			count = needed;
			result = RmGetList(session, out needed, ref count, infos, ref reasons);
			if (result != 0) {
				throw new Win32Exception(result);
			}
			int[] ids = new int[count];
			for (int i = 0; i < count; i++) {
				ids[i] = infos[i].Process.dwProcessId;
			}
			return ids;
		} finally {
			RmEndSession(session);
		}
	}
}
'@

function Get-LogFileHolders {
	$files = @(Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
	if ($files.Count -eq 0) {
		return @()
	}
	return @([LogFileHolders]::Get($files) | Sort-Object -Unique)
}

if (-not (Test-Path -LiteralPath $Path)) {
	Write-Host "No log files under $Path"
	exit 0
}

$holders = Get-LogFileHolders
if ($holders.Count -eq 0) {
	Write-Host "No process holds files under $Path"
	exit 0
}

foreach ($holderId in $holders) {
	$process = Get-CimInstance Win32_Process -Filter "ProcessId = $holderId" -ErrorAction SilentlyContinue
	if (-not $process) {
		continue
	}
	$owner = Invoke-CimMethod -InputObject $process -MethodName GetOwner -ErrorAction SilentlyContinue
	Write-Host "Process holding files under ${Path}: pid=$holderId, name=$($process.Name), parent=$($process.ParentProcessId), owner=$($owner.Domain)\$($owner.User), path=$($process.ExecutablePath), command line=$($process.CommandLine)"
	# Only stop what the tests started: the agent's own processes and system services also run on this machine.
	if ($holderId -eq $PID -or $owner.User -ne $env:USERNAME -or $process.Name -like 'Agent.*') {
		Write-Host "  not stopping it"
		continue
	}
	try {
		Stop-Process -Id $holderId -Force -ErrorAction Stop
		Wait-Process -Id $holderId -Timeout 10 -ErrorAction SilentlyContinue
		Write-Host "  stopped"
	} catch {
		Write-Host "  failed to stop: $($_.Exception.Message)"
	}
}

$remaining = Get-LogFileHolders
if ($remaining.Count -gt 0) {
	Write-Host "Still holding files under ${Path}: $($remaining -join ', ')"
}
