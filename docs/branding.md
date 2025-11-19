# Branding Assets

All PNG icon assets that live directly under the top-level `resources/` folder are stored via [Git LFS](https://git-lfs.com/) so that the main repository stays lightweight while still keeping the binaries in source control.

To make sure you are using the same workflow:

1. Install Git LFS locally (`git lfs install`).
2. The `.gitattributes` file already contains the pattern `resources/*.png filter=lfs diff=lfs merge=lfs -text`, so running `git add resources/*.png` will automatically stage those pointers instead of the raw binaries.
3. After committing, push both the Git data and the LFS objects (`git push` and, if needed, `git lfs push`).

Following these steps ensures that all contributors handle the icon binaries consistently.
