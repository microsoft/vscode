if (-not ('LaunchSkill.NativeCommandLine' -as [type])) {
	Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace LaunchSkill {
	public static class NativeCommandLine {
		[DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
		private static extern IntPtr CommandLineToArgvW(string commandLine, out int argumentCount);

		[DllImport("kernel32.dll")]
		private static extern IntPtr LocalFree(IntPtr memory);

		public static string[] Parse(string commandLine) {
			int argumentCount;
			IntPtr arguments = CommandLineToArgvW(commandLine, out argumentCount);
			if (arguments == IntPtr.Zero) {
				throw new Win32Exception(Marshal.GetLastWin32Error());
			}

			try {
				string[] result = new string[argumentCount];
				for (int index = 0; index < argumentCount; index++) {
					IntPtr argument = Marshal.ReadIntPtr(arguments, index * IntPtr.Size);
					result[index] = Marshal.PtrToStringUni(argument);
				}
				return result;
			} finally {
				LocalFree(arguments);
			}
		}
	}
}
'@
}

if (-not ('LaunchSkill.NativePath' -as [type])) {
	Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
using System.Text;

namespace LaunchSkill {
	public static class NativePath {
		[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
		private static extern uint GetLongPathName(string shortPath, StringBuilder longPath, uint bufferLength);

		public static string ToLongPath(string path) {
			StringBuilder buffer = new StringBuilder(32768);
			uint length = GetLongPathName(path, buffer, (uint)buffer.Capacity);
			return length == 0 || length >= buffer.Capacity ? path : buffer.ToString();
		}
	}
}
'@
}

# Matches `--<name>=<path>` arguments by the path they refer to, so short (8.3)
# and long spellings of the same existing directory compare equal.
function Test-CommandLineHasPathArgument([string]$commandLine, [string]$argumentName, [string]$expectedPath) {
	$prefix = "$argumentName="
	$expected = [LaunchSkill.NativePath]::ToLongPath($expectedPath).TrimEnd('\')
	return [LaunchSkill.NativeCommandLine]::Parse($commandLine) |
		Where-Object {
			$_.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -and
			[string]::Equals([LaunchSkill.NativePath]::ToLongPath($_.Substring($prefix.Length)).TrimEnd('\'), $expected, [StringComparison]::OrdinalIgnoreCase)
		} |
		Select-Object -First 1
}
