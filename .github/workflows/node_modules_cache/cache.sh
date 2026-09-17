#!/usr/bin/env bash
# Store or restore the node_modules cache on Linux / macOS.
#
# Usage:
#   cache.sh archive   # create  .build/node_modules_cache/node-modules.tzst (cache miss)
#   cache.sh extract   # restore .build/node_modules_cache/node-modules.tzst (cache hit)
#
# Uses multi-threaded zstd. The archive must NOT be named cache.tzst because
# actions/cache reserves that name and excludes it from the saved cache. The
# archive and extract flags must stay compatible; if you change the format
# here, bump build/.cachesalt to invalidate old caches.
set -e

case "$1" in
	archive)
		node build/azure-pipelines/common/listNodeModules.ts .build/node_modules_list.txt
		mkdir -p .build/node_modules_cache
		tar --use-compress-program='zstd -T0 -3' -cf .build/node_modules_cache/node-modules.tzst --files-from .build/node_modules_list.txt
		;;
	extract)
		tar --use-compress-program='zstd -d -T0' -xf .build/node_modules_cache/node-modules.tzst
		;;
	*)
		echo "Usage: $0 {archive|extract}" >&2
		exit 1
		;;
esac
