# Go to tmpdir
cd $2
# Do a sparse checkout. Ref https://stackoverflow.com/a/63786181
git clone --filter=blob:none --no-checkout --depth 1 --sparse https://github.com/chromium/chromium.git
cd chromium
git sparse-checkout init --cone
git sparse-checkout add third_party/dpkg-shlibdeps
git checkout
