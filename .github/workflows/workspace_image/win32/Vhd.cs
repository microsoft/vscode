// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

// The virtual disk API for vhd.ps1: it attaches a VHDX without diskpart, the Virtual Disk Service or
// the storage cmdlets, which take seconds to start on a new runner, and it creates a VHDX with blocks
// of 1 MB, which diskpart can't (it always uses 32 MB, which the VHDX allocates in full). vhd.ps1
// compiles it with the C# compiler of the .NET Framework, which takes about a second, unlike Add-Type
// of PowerShell 7 (over 10 seconds on a new runner), so it sticks to C# 5.

using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class WorkspaceImageVhd
{
	[StructLayout(LayoutKind.Sequential)]
	private struct VirtualStorageType
	{
		public uint DeviceId;
		public Guid VendorId;
	}

	// OPEN_VIRTUAL_DISK_PARAMETERS of version 1, in the size of the later versions
	[StructLayout(LayoutKind.Explicit, Size = 48)]
	private struct OpenParameters
	{
		[FieldOffset(0)] public uint Version;
		[FieldOffset(4)] public uint RWDepth;
	}

	[StructLayout(LayoutKind.Sequential)]
	private struct AttachParameters
	{
		public uint Version;
		public uint Reserved;
	}

	// CREATE_VIRTUAL_DISK_PARAMETERS of version 2, whose union starts at offset 8. Padded beyond the
	// fields of version 2, in case the API reads the size of a later version.
	[StructLayout(LayoutKind.Explicit, Size = 256)]
	private struct CreateParameters
	{
		[FieldOffset(0)] public uint Version;
		[FieldOffset(8)] public Guid UniqueId;
		[FieldOffset(24)] public ulong MaximumSize;
		[FieldOffset(32)] public uint BlockSizeInBytes;
		[FieldOffset(36)] public uint SectorSizeInBytes;
		[FieldOffset(40)] public uint PhysicalSectorSizeInBytes;
	}

	[DllImport("virtdisk.dll", CharSet = CharSet.Unicode)]
	private static extern uint CreateVirtualDisk(ref VirtualStorageType type, string path, uint access, IntPtr securityDescriptor, uint flags, uint providerSpecificFlags, ref CreateParameters parameters, IntPtr overlapped, out IntPtr handle);

	[DllImport("virtdisk.dll", CharSet = CharSet.Unicode)]
	private static extern uint OpenVirtualDisk(ref VirtualStorageType type, string path, uint access, uint flags, ref OpenParameters parameters, out IntPtr handle);

	[DllImport("virtdisk.dll", CharSet = CharSet.Unicode)]
	private static extern uint AttachVirtualDisk(IntPtr handle, IntPtr securityDescriptor, uint flags, uint providerSpecificFlags, ref AttachParameters parameters, IntPtr overlapped);

	[DllImport("virtdisk.dll", CharSet = CharSet.Unicode)]
	private static extern uint GetVirtualDiskPhysicalPath(IntPtr handle, ref uint size, StringBuilder path);

	[DllImport("kernel32.dll", SetLastError = true)]
	private static extern bool CloseHandle(IntPtr handle);

	[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
	private static extern IntPtr FindFirstVolume(StringBuilder name, uint length);

	[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
	private static extern bool FindNextVolume(IntPtr handle, StringBuilder name, uint length);

	[DllImport("kernel32.dll", SetLastError = true)]
	private static extern bool FindVolumeClose(IntPtr handle);

	[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
	private static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);

	[DllImport("kernel32.dll", SetLastError = true)]
	private static extern bool DeviceIoControl(IntPtr handle, uint code, IntPtr input, uint inputSize, IntPtr output, uint outputSize, out uint returned, IntPtr overlapped);

	[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
	private static extern bool SetVolumeMountPoint(string mountPoint, string volumeName);

	private static readonly IntPtr Invalid = new IntPtr(-1);

	private static VirtualStorageType Vhdx()
	{
		VirtualStorageType type = new VirtualStorageType();
		// VIRTUAL_STORAGE_TYPE_DEVICE_VHDX of VIRTUAL_STORAGE_TYPE_VENDOR_MICROSOFT
		type.DeviceId = 3;
		type.VendorId = new Guid("EC984AEC-A0F9-47e9-901F-71415A66345B");
		return type;
	}

	/// <summary>Creates an empty dynamic VHDX with the given block size.</summary>
	public static void Create(string path, ulong maximumSize, uint blockSize)
	{
		VirtualStorageType type = Vhdx();
		CreateParameters parameters = new CreateParameters();
		parameters.Version = 2;
		parameters.UniqueId = Guid.NewGuid();
		parameters.MaximumSize = maximumSize;
		parameters.BlockSizeInBytes = blockSize;
		parameters.SectorSizeInBytes = 512;
		parameters.PhysicalSectorSizeInBytes = 4096;
		IntPtr handle;
		// VIRTUAL_DISK_ACCESS_NONE and CREATE_VIRTUAL_DISK_FLAG_NONE, which version 2 requires for a dynamic VHDX
		uint result = CreateVirtualDisk(ref type, path, 0, IntPtr.Zero, 0, 0, ref parameters, IntPtr.Zero, out handle);
		if (result != 0)
		{
			throw new Exception("CreateVirtualDisk failed with error " + result);
		}
		CloseHandle(handle);
	}

	/// <summary>
	/// Opens the VHDX with version 1 of the open parameters, the only one that takes
	/// OPEN_VIRTUAL_DISK_FLAG_CACHED_IO, then attaches it for good, without a drive letter. Returns the
	/// error of OpenVirtualDisk, 0 when it attached.
	/// </summary>
	public static uint TryAttach(string path, uint openFlags, out int disk)
	{
		disk = -1;
		VirtualStorageType type = Vhdx();
		OpenParameters open = new OpenParameters();
		open.Version = 1;
		open.RWDepth = 1;
		IntPtr handle;
		// VIRTUAL_DISK_ACCESS_ALL
		uint result = OpenVirtualDisk(ref type, path, 0x003f0000, openFlags, ref open, out handle);
		if (result != 0)
		{
			return result;
		}
		try
		{
			AttachParameters attach = new AttachParameters();
			attach.Version = 1;
			// ATTACH_VIRTUAL_DISK_FLAG_NO_DRIVE_LETTER | ATTACH_VIRTUAL_DISK_FLAG_PERMANENT_LIFETIME
			result = AttachVirtualDisk(handle, IntPtr.Zero, 0x2 | 0x4, 0, ref attach, IntPtr.Zero);
			if (result != 0)
			{
				throw new Exception("AttachVirtualDisk failed with error " + result);
			}
			uint size = 1024;
			StringBuilder physical = new StringBuilder((int)size);
			result = GetVirtualDiskPhysicalPath(handle, ref size, physical);
			if (result != 0)
			{
				throw new Exception("GetVirtualDiskPhysicalPath failed with error " + result);
			}
			string text = physical.ToString();
			disk = int.Parse(text.Substring(text.LastIndexOf("PhysicalDrive", StringComparison.OrdinalIgnoreCase) + "PhysicalDrive".Length));
			return 0;
		}
		finally
		{
			CloseHandle(handle);
		}
	}

	/// <summary>Waits for the volume of the disk and returns its \\?\Volume{GUID}\ path.</summary>
	public static string WaitForVolume(int disk, int timeoutMilliseconds)
	{
		DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeoutMilliseconds);
		while (true)
		{
			string volume = FindVolume(disk);
			if (volume != null)
			{
				return volume;
			}
			if (DateTime.UtcNow > deadline)
			{
				throw new TimeoutException("No volume on disk " + disk);
			}
			Thread.Sleep(25);
		}
	}

	private static string FindVolume(int disk)
	{
		StringBuilder name = new StringBuilder(1024);
		IntPtr find = FindFirstVolume(name, 1024);
		if (find == Invalid)
		{
			return null;
		}
		try
		{
			do
			{
				string volume = name.ToString();
				IntPtr handle = CreateFile(volume.TrimEnd('\\'), 0, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
				if (handle == Invalid)
				{
					continue;
				}
				IntPtr buffer = Marshal.AllocHGlobal(1024);
				try
				{
					uint returned;
					// IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS returns VOLUME_DISK_EXTENTS, whose DISK_EXTENTs of 24 bytes start at offset 8
					if (DeviceIoControl(handle, 0x00560000, IntPtr.Zero, 0, buffer, 1024, out returned, IntPtr.Zero))
					{
						int count = Marshal.ReadInt32(buffer);
						for (int i = 0; i < count; i++)
						{
							if (Marshal.ReadInt32(buffer, 8 + i * 24) == disk)
							{
								return volume;
							}
						}
					}
				}
				finally
				{
					Marshal.FreeHGlobal(buffer);
					CloseHandle(handle);
				}
			} while (FindNextVolume(find, name, 1024));
		}
		finally
		{
			FindVolumeClose(find);
		}
		return null;
	}

	/// <summary>Mounts the volume at an empty folder, whose path ends with a backslash.</summary>
	public static void Mount(string folder, string volume)
	{
		if (!SetVolumeMountPoint(folder, volume))
		{
			throw new Exception("SetVolumeMountPoint failed with error " + Marshal.GetLastWin32Error());
		}
	}
}
