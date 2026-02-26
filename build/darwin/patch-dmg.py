#!/usr/bin/env python3
import subprocess
import shutil
import tempfile
import plistlib
import os

def patch_dmg_icon(dmg_path, new_icon_path):
    """Replace the volume icon in an existing DMG."""

    # 1. Convert to read-write format
    temp_rw = tempfile.NamedTemporaryFile(suffix=".dmg", delete=False)
    temp_rw.close()

    subprocess.run([
        "hdiutil", "convert", dmg_path,
        "-format", "UDRW",  # Read-write
        "-o", temp_rw.name,
        "-ov"  # Overwrite
    ], check=True)

    # 2. Attach the writable DMG
    result = subprocess.run(
        ["hdiutil", "attach", "-nobrowse", "-plist", temp_rw.name],
        capture_output=True, check=True
    )
    plist = plistlib.loads(result.stdout)

    mount_point = None
    device = None
    for entity in plist["system-entities"]:
        if "mount-point" in entity:
            mount_point = entity["mount-point"]
            device = entity["dev-entry"]
            break

    try:
        # 3. Copy custom icon
        icon_target = os.path.join(mount_point, ".VolumeIcon.icns")
        shutil.copyfile(new_icon_path, icon_target)

        # 4. Set the custom icon attribute on the volume
        subprocess.run(["/usr/bin/SetFile", "-a", "C", mount_point], check=True)

        # Sync before detach
        subprocess.run(["sync", "--file-system", mount_point], check=True)

    finally:
        # 5. Detach
        subprocess.run(["hdiutil", "detach", device], check=True)

    # 6. Convert back to compressed format (ULMO = lzma)
    subprocess.run([
        "hdiutil", "convert", temp_rw.name,
        "-format", "ULMO",
        "-o", dmg_path,
        "-ov"
    ], check=True)

    # Cleanup temp file
    os.unlink(temp_rw.name)
    print(f"Successfully patched {dmg_path} with new icon")


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <dmg_path> <icon.icns>")
        sys.exit(1)

    patch_dmg_icon(sys.argv[1], sys.argv[2])
