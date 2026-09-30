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

function Test-CommandLineHasArgument([string]$commandLine, [string]$expectedArgument) {
	return [LaunchSkill.NativeCommandLine]::Parse($commandLine) |
		Where-Object { [string]::Equals($_, $expectedArgument, [StringComparison]::OrdinalIgnoreCase) } |
		Select-Object -First 1
}
