# Get a newer version of git
sudo apt-get install -y dh-autoreconf libcurl4-gnutls-dev libexpat1-dev \
gettext libz-dev libssl-dev
curl -O https://github.com/git/git/archive/refs/tags/v2.37.1.tar.gz
tar xzf v2.37.1.tar.gz
cd git-2.37.1
make configure
./configure --prefix=/usr
make all
sudo make install

# Do a sparse checkout. Ref https://stackoverflow.com/a/63786181
git clone --filter=blob:none --no-checkout --depth 1 --sparse https://github.com/chromium/chromium.git
cd chromium
git sparse-checkout init --cone
git sparse-checkout add third_party/dpkg-shlibdeps
git checkout
