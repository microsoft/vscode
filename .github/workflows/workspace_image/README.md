# Workspace images

The test jobs of pull requests ([pr-linux-test.yml](../pr-linux-test.yml), [pr-darwin-test.yml](../pr-darwin-test.yml) and [pr-win32-test.yml](../pr-win32-test.yml)) start from a disk image of a workspace of `main` instead of an empty folder: its dependencies, Electron and the Playwright browsers are installed, and its `.git` holds the commit it was built at. A job mounts the image, checks out its own commit, and installs only what changed since, which for most pull requests is nothing.

[pr-workspace-images.yml](../pr-workspace-images.yml) builds an image for each platform on the runners of the jobs: when the inputs of the install change on `main`, and every 6 hours, so that the checkouts of the jobs download little. [image.ts](image.ts) restores, checks and builds them; it has no dependencies, as the jobs run it before they check out the repository.

## What a job does

1. **Downloads the scripts** of its commit from the API (`image.ts`, and on Windows `vhd.ps1` and `Vhd.cs`), and `.nvmrc` for the Node.js version.
2. **Restores the image** (`image.ts restore`): finds the newest image of `main`, downloads it with parallel range requests, and mounts it at the parent folder of the workspace, so that the workspace keeps its path. Without an image, or on any error, it warns and the job installs everything as before.
3. **Checks out its commit** with `clean: false`, which keeps the untracked files of the image and reuses its checkout: the shallow fetch sends the tag at the commit of the image, and downloads only what changed since, and git writes only the files that changed, as it compares their sizes and modification times, which the image keeps.
4. **Compares the dependencies** (`image.ts deps`) with the install state that `build/npm/postinstall.ts` saved in the image (see `build/npm/installStateHash.ts`). When an input of the install changed, the job runs its usual install steps on the `node_modules` of the image, and pnpm installs only what changed.
5. **Keeps the prepared Electron** when it was prepared from the same inputs (see [setup-electron](../../actions/setup-electron/action.yml)), and finds the Playwright browsers in the image (`PLAYWRIGHT_BROWSERS_PATH`).

## The images

The workspace of an image is at the path of the workspaces of the jobs, because pnpm links packages of different folders with junctions on Windows, whose targets are absolute paths, and records its store in `node_modules/.modules.yaml`: with another store, pnpm installs every package again. The store (`pnpm_config_store_dir`) and the Playwright browsers are beside the workspace, in the image. The jobs don't need the content of the store: with an empty store at the same path, pnpm only downloads the packages that changed. On Windows, pnpm hard links the packages from the store, as its clones on ReFS store them again.

| Platform | Image | Restore |
| -------- | ----- | ------- |
| Linux | ext4 volume without a journal in a sparse file | Attached to a loop device while still empty, recreated from chunks of zstd, then mounted with `barrier=0`, while the kernel writes the image to the disk |
| macOS | APFS volume in a sparse ASIF image | Recreated from chunks of zstd, then attached |
| Windows | Dev Drive in a VHDX with blocks of 1 MB | Recreated from chunks of zstd into a temporary file, which Windows keeps in memory, then attached through the file system cache with the virtual disk API ([Vhd.cs](Vhd.cs)) |

All three are writable volumes. A squashfs under an overlay, which Linux mounts without writing it, took seconds to look up the files of a checkout or `node_modules` for the first time, as squashfs reads its metadata past the caches of the kernel.

The chunks of 32 MB download and decompress in parallel, and the restore writes them in order as they arrive, without the pages of zeros where the file can be sparse. On Windows, the disk sets the pace, at 250-650 MB/s, as a VHDX can be neither sparse nor written later. The first PowerShell of a job takes seconds to start, so `vhd.ps1` starts and compiles the virtual disk API while the image downloads into the file that `image.ts` created. On Linux, attaching a file to a loop device waits for the kernel to write the file to the disk, so the restore attaches the empty file while the image downloads, and drops what udev read from it before it mounts the volume. With `barrier=0`, an fsync in the volume doesn't wait for the rest of the image to reach the disk either. Images keep everything of the workspace: the checkout of their commit with HEAD detached (`image.ts seed`), the files that pnpm installed, and the `.build` folder (Electron, and on Linux the sysroots and compilers of `setup-env.sh`).

## Trust

A job only uses images of runs of this repository for pushes to `main`, schedules and manual dispatches, as any pull request could upload an artifact of the same name. The `.git` of an image holds no credentials. The test jobs need `actions: read` to find and download the artifacts.

## Testing changes

The test workflows take a `workspace_image_branch` input, which is `main` unless a workflow that calls them builds the images of another branch: `pr-workspace-images.yml` can be called with `workflow_call`.
