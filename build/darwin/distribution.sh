
realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
ROOT=$(dirname "$(dirname "$(realpath "$0")")")

cd $ROOT
NAME=`node -p "require('../product.json').nameLong"`
BUILD="$ROOT/../.build/electron"
APP="../.build/electron/$NAME.app"


# Cleanup anything from a previous build
rm -r "$BUILD/vscode"
rm -r "$BUILD/path"
rm -r "$BUILD/workflow"

# Setup directories which will become pkgs
mkdir "$BUILD/vscode"
mkdir "$BUILD/path"
mkdir "$BUILD/workflow"

# Copy the relevant files
cp -R "$BUILD/$NAME.app" "$BUILD/vscode/"
cp -R "$ROOT/darwin/path.sh" "$BUILD/path/"
mv "$BUILD/path/path.sh" "$BUILD/path/postinstall"
cp -R "$ROOT/darwin/open-in-finder.workflow" "$BUILD/workflow/"
cp $ROOT/darwin/Distribution.xml "$BUILD/"

# Create packages
cd $BUILD
# pkgbuild --identifier com.test.path.pkg  --nopayload --scripts "path" "path.pkg"
pkgbuild --root workflow --identifier com.test.workflow.pkg --install-location ~/library/services "workflow.pkg"
pkgbuild --root vscode --identifier com.test.vscode.pkg "vscode.pkg" --scripts "path"

# # Create final distribution package
productbuild --distribution "distribution.xml" "full.pkg"

# cleanup items that are not necessary anymore
rm -r vscode
rm -r path
rm -r workflow
rm vscode.pkg
rm workflow.pkg
# rm path.pkg
rm distribution.xml
