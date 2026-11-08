# Workspace images

Workspace images let the test jobs of pull requests ([pr-linux-test.yml](../pr-linux-test.yml) and [pr-win32-test.yml](../pr-win32-test.yml)) start from a disk image of a workspace of `main` instead of an empty folder: its dependencies, Electron and the Playwright browsers are installed, and its `.git` holds the commit it was built at. A job mounts the image, checks out its own commit, and installs only what changed since, which for most pull requests is nothing.

The Windows and Linux test jobs use the images, except the Windows WSL smoke test job (`Windows / Electron-Smoke (WSL)`), which runs on the 1ES pool and keeps its workspace on drive C. The macOS test jobs never adopted them, and are commented out in [pr.yml](../pr.yml) for now, like the job of [pr-workspace-images.yml](../pr-workspace-images.yml) that builds the macOS image. [What a job does](#what-a-job-does) describes the steps of a job that uses the images.

[pr-workspace-images.yml](../pr-workspace-images.yml) builds an image for Linux and Windows on the runners of the jobs every day at 05:00 UTC, and when one of its inputs changes on `main`: those of the install, of the native builds (`NATIVE_BUILD_INPUTS` in `image.ts`) and of the prepared Electron. It doesn't build them for other pushes, as the checkout of a job fetches and writes only what changed since the commit of its image. The images are kept for 2 days, so the daily build keeps a recent image available. [image.ts](image.ts) restores, checks and builds them; it has no dependencies, as the jobs run it before they check out the repository.

## What a job does

1. **Downloads the scripts** of its commit from the API (`image.ts`, and on Windows `win32/vhd.ps1` and `win32/Vhd.cs`), and `.nvmrc` for the Node.js version.
2. **Restores the image** (`image.ts restore`): finds the newest image of `main`, downloads it with parallel range requests, and mounts it at the parent folder of the workspace, so that the workspace keeps its path. Without an image, or on any error, it warns and the job installs everything as before. It gives up after 4 minutes (`--timeout-seconds`), before the timeout of its step could stop it with the image half attached, and then, as after any other error, unmounts and detaches the image, so that the workspace is an empty folder again; on Windows, it also deletes the VHDX, whose data Windows keeps in memory. Pull requests to release branches look for images of their own branch (`--branch`), which aren't built, and install everything as before. The job also doesn't use an image when the inputs of the base key of the `node_modules` caches (`computeNodeModulesBaseCacheKey` in `build/azure-pipelines/common/cacheKeys.ts`: the salt of the CI caches, the pnpmfiles, the `nativeBuild` targets and `packageManager` of `package.json`, the Node.js versions and the pnpm settings of the install roots, mirrored in `NATIVE_BUILD_INPUTS` of `image.ts`) differ between the commit of the image and its own, which the restore compares through the API before it downloads anything: installing on top of an image wouldn't build its native modules again, for example after an Electron update.
3. **Checks out its commit** with `clean: false`, which keeps the untracked files of the image and reuses its checkout: the shallow fetch sends the tag at the commit of the image, and downloads only what changed since, and git writes only the files that changed, as it compares their sizes and modification times, which the image keeps.
4. **Installs the dependencies** with its usual install steps, on the `node_modules` of the image instead of those of the `node_modules` cache. `pnpm install`, whose postinstall installs every other install root, installs only what changed since the commit of the image, as pnpm checks itself what is up to date. On Linux, `setup-env.sh` reuses the sysroots and compilers in the `.build` folder of the image, and the system packages are installed as before, as they aren't in the image.
5. **Keeps the prepared Electron** when it was prepared from the same inputs (see [setup-electron](../../actions/setup-electron/action.yml)), and finds the Playwright browsers in the image (`PLAYWRIGHT_BROWSERS_PATH`), instead of in their cache, which would point `PLAYWRIGHT_BROWSERS_PATH` into the workspace.

## The images

The workspace of an image is at the path of the workspaces of the jobs, because pnpm links packages of different folders with junctions on Windows, whose targets are absolute paths, and records its store in `node_modules/.modules.yaml`: with another store, pnpm installs every package again. The store (`pnpm_config_store_dir`) and the Playwright browsers are beside the workspace, in the image. The jobs don't need the content of the store: with an empty store at the same path, pnpm only downloads the packages that changed. On Windows, pnpm hard links the packages from the store, as its clones on ReFS store them again.

| Platform | Image | Restore |
| -------- | ----- | ------- |
| Linux | ext4 volume without a journal in a sparse file | Attached to a loop device while still empty, recreated from chunks of zstd, then mounted with `barrier=0`, while the kernel writes the image to the disk |
| macOS | APFS volume in a sparse ASIF image | Recreated from chunks of zstd, then attached |
| Windows | Dev Drive in a VHDX with blocks of 1 MB | Recreated from chunks of zstd into a temporary file, which Windows keeps in memory, then attached through the file system cache with the virtual disk API ([Vhd.cs](win32/Vhd.cs)) |

All three are writable volumes. A squashfs under an overlay, which Linux mounts without writing it, took seconds to look up the files of a checkout or `node_modules` for the first time, as squashfs reads its metadata past the caches of the kernel.

The chunks of 32 MB download and decompress in parallel, and the restore writes them in order as they arrive, without the pages of zeros where the file can be sparse. On Windows, the disk sets the pace, at 250-650 MB/s, as a VHDX can be neither sparse nor written later. The first PowerShell of a job takes seconds to start, so [vhd.ps1](win32/vhd.ps1) starts and compiles the virtual disk API while the image downloads into the file that `image.ts` created. On Linux, attaching a file to a loop device waits for the kernel to write the file to the disk, so the restore attaches the empty file while the image downloads, and drops what udev read from it before it mounts the volume. With `barrier=0`, an fsync in the volume doesn't wait for the rest of the image to reach the disk either. Images keep everything of the workspace: the checkout of their commit with HEAD detached (`image.ts seed`), the files that pnpm installed, and the `.build` folder (Electron, and on Linux the sysroots and compilers of `setup-env.sh`).

## Trust

A job only uses images of runs of this repository for pushes to `main`, its daily schedule and manual dispatches, as any pull request could upload an artifact of the same name. The `.git` of an image holds no credentials. The test jobs need `actions: read` to find and download the artifacts.

## Testing changes

`pr-workspace-images.yml` can be called with `workflow_call`, so that a temporary workflow on a branch can build the images of the branch, and test the steps of a job that restores them with `image.ts restore --branch`.
