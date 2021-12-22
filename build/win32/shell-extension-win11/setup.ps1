# Setup the "Open with Code" Context Menu Item

$releasePath = (resolve-path Release)

Certutil.exe -user -addStore TrustedPeople ${releasePath}\Key.cer

Add-AppxPackage ${releasePath}\code-sparse.appx -ExternalLocation ${releasePath}