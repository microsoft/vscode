package main

import (
    "encoding/base64"
    "fmt"
)

func main() {
    dnsName := "test-vm-from-go"
    storageAccount := "mystorageaccount"

    client, err := management.ClientFromPublishSettingsFile("path/to/downloaded.publishsettings", "")
    if err != nil {
        panic(err)
    }

    // create virtual machine
    role := vmutils.NewVMConfiguration(dnsName, vmSize)
    vmutils.ConfigureDeploymentFromPlatformImage(
        &role,
        vmImage,
        fmt.Sprintf("http://%s.blob.core.windows.net/sdktest/%s.vhd", storageAccount, dnsName),
        "")
}