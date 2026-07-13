#!/usr/bin/env python3
# ---------------------------------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

import argparse
from pathlib import Path, PurePosixPath, PureWindowsPath
import shutil
import stat
import struct
import tempfile
import unicodedata
import zipfile

MAX_ENTRIES = 10_000
MAX_CENTRAL_DIRECTORY_BYTES = 128 * 1024 * 1024
MAX_ENTRY_BYTES = 1024 * 1024 * 1024
MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
MAX_FILENAME_LENGTH = 1024
WINDOWS_INVALID_CHARS = frozenset('<>:"|?*')
WINDOWS_RESERVED_NAMES = frozenset({
	'AUX',
	'CON',
	'NUL',
	'PRN',
	*(f'COM{index}' for index in range(1, 10)),
	*(f'LPT{index}' for index in range(1, 10)),
	*(f'COM{suffix}' for suffix in ('\u00b9', '\u00b2', '\u00b3')),
	*(f'LPT{suffix}' for suffix in ('\u00b9', '\u00b2', '\u00b3')),
})

EOCD_SIGNATURE = b'PK\x05\x06'
EOCD_STRUCT = struct.Struct('<4s4H2LH')
ZIP64_LOCATOR_STRUCT = struct.Struct('<4sLQL')
ZIP64_EOCD_STRUCT = struct.Struct('<4sQ2H2L4Q')
CENTRAL_DIRECTORY_STRUCT = struct.Struct('<4s6H3L5H2L')


def preflight_archive(archive: Path) -> None:
	archive_size = archive.stat().st_size
	tail_size = min(archive_size, EOCD_STRUCT.size + 65_535)
	with archive.open('rb') as file:
		file.seek(archive_size - tail_size)
		tail = file.read(tail_size)
		tail_start = archive_size - tail_size

		eocd_index = tail.rfind(EOCD_SIGNATURE)
		while eocd_index >= 0:
			if eocd_index + EOCD_STRUCT.size <= len(tail):
				eocd = EOCD_STRUCT.unpack_from(tail, eocd_index)
				if eocd_index + EOCD_STRUCT.size + eocd[7] == len(tail):
					break
			eocd_index = tail.rfind(EOCD_SIGNATURE, 0, eocd_index)
		else:
			raise ValueError('Archive has no valid end-of-central-directory record')

		_, disk, central_directory_disk, disk_entries, total_entries, central_directory_size, central_directory_offset, _ = eocd
		eocd_offset = tail_start + eocd_index
		central_directory_end_offset = eocd_offset
		if total_entries == 0xFFFF or central_directory_size == 0xFFFFFFFF or central_directory_offset == 0xFFFFFFFF:
			locator_offset = eocd_offset - ZIP64_LOCATOR_STRUCT.size
			if locator_offset < 0:
				raise ValueError('Archive has no valid ZIP64 locator')
			file.seek(locator_offset)
			locator = ZIP64_LOCATOR_STRUCT.unpack(file.read(ZIP64_LOCATOR_STRUCT.size))
			if locator[0] != b'PK\x06\x07' or locator[1] != 0 or locator[3] != 1:
				raise ValueError('Multi-disk ZIP64 archives are not supported')
			file.seek(locator[2])
			zip64_eocd = ZIP64_EOCD_STRUCT.unpack(file.read(ZIP64_EOCD_STRUCT.size))
			if zip64_eocd[0] != b'PK\x06\x06' or zip64_eocd[4] != 0 or zip64_eocd[5] != 0:
				raise ValueError('Archive has an invalid ZIP64 end-of-central-directory record')
			disk_entries, total_entries, central_directory_size, central_directory_offset = zip64_eocd[6:]
			central_directory_end_offset = locator[2]

		if disk != 0 or central_directory_disk != 0 or disk_entries != total_entries:
			raise ValueError('Multi-disk zip archives are not supported')
		if total_entries > MAX_ENTRIES:
			raise ValueError(f'Archive has too many entries: {total_entries}')
		if central_directory_size > MAX_CENTRAL_DIRECTORY_BYTES:
			raise ValueError(f'Archive central directory is too large: {central_directory_size} bytes')
		if central_directory_offset + central_directory_size > central_directory_end_offset:
			raise ValueError('Archive central directory extends beyond its end record')

		file.seek(central_directory_offset)
		remaining = central_directory_size
		entry_count = 0
		while remaining:
			if remaining < CENTRAL_DIRECTORY_STRUCT.size:
				raise ValueError('Archive has a truncated central-directory entry')
			header = CENTRAL_DIRECTORY_STRUCT.unpack(file.read(CENTRAL_DIRECTORY_STRUCT.size))
			if header[0] != b'PK\x01\x02':
				raise ValueError('Archive has an invalid central-directory entry')
			variable_size = header[10] + header[11] + header[12]
			entry_size = CENTRAL_DIRECTORY_STRUCT.size + variable_size
			if entry_size > remaining:
				raise ValueError('Archive has a truncated central-directory entry')
			file.seek(variable_size, 1)
			remaining -= entry_size
			entry_count += 1
			if entry_count > MAX_ENTRIES:
				raise ValueError(f'Archive has too many entries: more than {MAX_ENTRIES}')
		if entry_count != total_entries:
			raise ValueError(f'Archive entry count mismatch: header reports {total_entries}, found {entry_count}')


def validate_windows_path(path: PurePosixPath, filename: str) -> None:
	for part in path.parts:
		if WINDOWS_INVALID_CHARS.intersection(part) or part.endswith((' ', '.')):
			raise ValueError(f'Archive path is not portable to Windows: {filename!r}')
		if part.split('.', 1)[0].upper() in WINDOWS_RESERVED_NAMES:
			raise ValueError(f'Archive path uses a reserved Windows name: {filename!r}')


def validate_entries(source: zipfile.ZipFile, root: Path) -> list[tuple[zipfile.ZipInfo, Path]]:
	entries = source.infolist()
	if len(entries) > MAX_ENTRIES:
		raise ValueError(f'Archive has too many entries: {len(entries)}')
	max_total_bytes = min(MAX_TOTAL_BYTES, shutil.disk_usage(root).free // 4)
	total_bytes = 0
	validated: list[tuple[zipfile.ZipInfo, Path]] = []
	for info in entries:
		if len(info.filename) > MAX_FILENAME_LENGTH or any(unicodedata.category(char).startswith('C') for char in info.filename):
			raise ValueError(f'Unsafe archive filename: {info.filename!r}')

		name = info.filename.replace('\\', '/')
		path = PurePosixPath(name)
		if not path.parts or path.is_absolute() or PureWindowsPath(info.filename).drive or '..' in path.parts:
			raise ValueError(f'Unsafe archive path: {info.filename!r}')
		validate_windows_path(path, info.filename)

		mode = info.external_attr >> 16
		file_type = stat.S_IFMT(mode)
		if file_type == stat.S_IFLNK:
			raise ValueError(f'Refusing archive symlink: {info.filename!r}')
		if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
			raise ValueError(f'Refusing special archive entry: {info.filename!r}')
		if info.flag_bits & 1:
			raise ValueError(f'Refusing encrypted archive entry: {info.filename!r}')
		if info.file_size > MAX_ENTRY_BYTES:
			raise ValueError(f'Archive entry is too large: {info.filename!r}')

		total_bytes += info.file_size
		if total_bytes > max_total_bytes:
			raise ValueError(f'Archive expands beyond the {max_total_bytes}-byte safety limit')

		validated.append((info, root.joinpath(*path.parts)))

	return validated


def extract_archive(archive: Path) -> Path:
	preflight_archive(archive)
	root = Path(tempfile.mkdtemp(prefix='agent-host-logs-')).resolve()
	try:
		with zipfile.ZipFile(archive) as source:
			entries = validate_entries(source, root)
			for info, target in entries:
				print(repr(info.filename))
				if info.is_dir():
					target.mkdir(parents=True, exist_ok=True)
					continue

				target.parent.mkdir(parents=True, exist_ok=True)
				with source.open(info) as input_stream, target.open('xb') as output_stream:
					shutil.copyfileobj(input_stream, output_stream)
	except (Exception, KeyboardInterrupt):
		shutil.rmtree(root)
		raise

	return root


def main() -> None:
	parser = argparse.ArgumentParser(description='Safely extract an Agent Host debug log zip into a temporary directory.')
	parser.add_argument('archive', type=Path, help='Path to an Agent Host debug log zip.')
	args = parser.parse_args()

	root = extract_archive(args.archive)
	print(f'Extracted to {str(root)!r}')


if __name__ == '__main__':
	main()
