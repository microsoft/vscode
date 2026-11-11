# CI caches

The GitHub Actions workflows cache the pnpm store, the Electron downloads, the built-in extensions, the WSL installer and the Playwright browsers. This describes the pnpm store cache, how [pr-pnpm-store.yml](../pr-pnpm-store.yml) keeps the caches warm, and the Electron download cache.

## pnpm store cache

The jobs don't cache `node_modules`: every job installs the dependencies with `pnpm install`, from a pnpm store that [restore-pnpm-store](../../actions/restore-pnpm-store/action.yml) restores from the cache, so that pnpm only downloads the packages that the store doesn't have. The Azure Pipelines jobs do the same (see `build/azure-pipelines/common/restore-pnpm-store.yml`). A cached `node_modules` folder would only work with the layout of pnpm's linker that created it: in the isolated layout, its packages are links into `node_modules/.pnpm`, which are junctions with absolute targets on Windows.

The store is beside the workspace (`../.pnpm-store`), where the [workspace images](../workspace_image/README.md) keep it: on the volume of the workspace, so that pnpm can hard link from it, also on the Dev Drive of the Windows jobs. Jobs that use a workspace image don't restore the store, as the image has its own. The jobs of `pr.yml` and `component-fixtures.yml` that start from a workspace image don't restore it without one either: they install everything without a cached store. pnpm's metadata cache is inside the store, so that the cache also keeps the log of the lockfiles that passed the supply-chain policies, which pnpm then doesn't check again. The cache saves and restores the store in `.build/pnpm-store`, from where it's moved beside the workspace: `actions/cache` doesn't save paths with `..` segments, and the version of a cache depends on its path, which is the same on every runner only inside the workspace.

The key is a prefix that names the projects that the job installs (`pnpm-store-linux` for all of them on Linux, `pnpm-store-copilot-windows` for the root project and Copilot on Windows, …), the platform, the pnpm version and the cache salt (`build/.cachesalt`), and the lockfiles of every install root. Jobs that install the same projects on the same platform share a store. A store holds the files of every package that it ever installed, so a job whose lockfiles have no store yet, for example in a pull request that changes the dependencies, restores the latest store of the same prefix, and pnpm downloads only the packages that changed.

Only the job that keeps a store warm saves it, with [save-pnpm-store](../../actions/save-pnpm-store/action.yml), when the cache doesn't have it: the job removes the packages that its projects don't use from the store, and the store's links to the projects (in `projects`), which the cache would follow on Windows. A job that installs only some of the projects must not save a store that other jobs share, as the store would then lack the packages of the others. A failing cache step doesn't fail the job: pnpm then installs without the cached store, and the store isn't saved.

## Warming the caches on `main` and the release branches

Pull requests can only restore caches saved on their base branch or on `main`, so [pr-pnpm-store.yml](../pr-pnpm-store.yml) saves the pnpm store, Electron, built-in extensions, WSL installer and Playwright browsers caches on every push to `main` and to the `release/*` branches. Most pushes don't change any of them, so the `Detect Missing Caches` job first computes each platform job's cache keys on a GitHub-hosted runner and lists the caches that the pushed branch can restore: its own and, on a release branch, those of `main`, which the jobs restore without saving a copy (see [detect-missing-caches](../../actions/detect-missing-caches/detect.ts)). A platform job only starts its runner when one of its caches is missing, for example after a dependency change or a cache eviction. All platform jobs run when the detection fails.

The detection mirrors the cache keys of the platform jobs, including the CRLF line endings of the Windows checkouts, and the cache versions that `actions/cache` matches in addition to the key: they depend on the cache paths, including the home directory of the runners for Electron. A cache with another version counts as missing, so the job runs and saves a compatible one; if the detection then keeps warning about a version, update its cache paths. When you change a cache key, path, key prefix, or the jobs of the workflow, update `cacheWarmingJobs` and `getCaches` in `detect.ts`; `build/lib/test/detectMissingCaches.test.ts` fails until they match.

At most one run of the workflow is in progress, and newer pushes replace its pending run, so concurrent pushes don't install the same missing dependencies several times.

## Electron download cache

The platform jobs in [pr-pnpm-store.yml](../pr-pnpm-store.yml) also warm a
separate Electron download cache on `main`. The
[setup-electron](../../actions/setup-electron/action.yml) action shares cache
handling and download retries with the Linux and Windows PR test
workflows:

- By default, restore cached archives and validate/prepare Electron, downloading
  with up to three attempts as needed. PR jobs use this mode without saving.
- `lookup-only: 'true'` only checks for a cache entry, without restoring archives,
  preparing Electron, or saving. This mode does not require pnpm or the
  dependencies.
- `save-cache: 'true'` also saves after successful setup on a cache miss.

The cache stores `@electron/get`'s original download archives, not the prepared
`.build/electron` application. Its key includes the runner OS, target
architecture, and a hash of `build/checksums/electron.txt`, which lists the
archives of the Electron version (the `target` of the `nativeBuild` field of
`package.json`) with their checksums, so an Electron update changes it.
Ordinary `package.json` and `pnpm-lock.yaml` changes do not invalidate it. If a
downloader update changes the cache format, bump the `electron-download-v1`
prefix in `setup-electron`.

The paths match `@electron/get`'s platform defaults, including `XDG_CACHE_HOME`
on Linux and `LOCALAPPDATA` on Windows. Cache paths and keys are handled within
the action.

Even on a cache hit, PR jobs run `pnpm run electron` to validate and prepare the
application from the cached archives using the current checkout, unless
`.build/electron` was prepared from the same inputs: `setup-electron` stamps
them in `.build/electron.stamp`, which keeps the Electron of a
[workspace image](../workspace_image/README.md). Checksum
validation remains enabled: the current downloader still fetches
`SHASUMS256.txt` from GitHub, so this cache avoids the large ZIP downloads but
does not make Electron setup entirely network-independent.

On `main`, an Electron cache hit uses lookup-only checks and skips downloading
Electron. On a miss, the platform job installs the dependencies from the pnpm
store, then invokes `setup-electron` with `save-cache: 'true'`. This checks the
cache again before preparing and saving Electron, while keeping already-warm jobs
from installing the dependencies unnecessarily.
