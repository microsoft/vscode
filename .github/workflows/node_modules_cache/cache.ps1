# Store or restore the node_modules cache on Windows.
#
# Usage:
#   cache.ps1 archive   # create  .build/node_modules_cache/cache.7z (cache miss)
#   cache.ps1 extract   # restore .build/node_modules_cache/cache.7z (cache hit)
#
# Uses 7-Zip. The archive and extract format must stay compatible; if you change
# the format here, bump build/.cachesalt to invalidate old caches.
param(
	[Parameter(Mandatory = $true)]
	[ValidateSet("archive", "extract")]
	[string]$Action
)

. build/azure-pipelines/win32/exec.ps1
$ErrorActionPreference = "Stop"

switch ($Action) {
	"archive" {
		exec { node build/azure-pipelines/common/listNodeModules.ts .build/node_modules_list.txt }
		exec { mkdir -Force .build/node_modules_cache }
		exec { 7z.exe a .build/node_modules_cache/cache.7z -mx3 `@.build/node_modules_list.txt }
	}
	"extract" {
		exec { 7z.exe x .build/node_modules_cache/cache.7z -aoa }
	}
}
