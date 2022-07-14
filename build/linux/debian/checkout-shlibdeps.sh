# Do a sparse checkout.
# Ref https://stackoverflow.com/a/13738951
mkdir chromium
cd chromium
git init
git remote add -f origin https://github.com/chromium/chromium.git
git config core.sparseCheckout true
echo "third_party/dpkg-shlibdeps" >> .git/info/sparse-checkout
git pull origin main
