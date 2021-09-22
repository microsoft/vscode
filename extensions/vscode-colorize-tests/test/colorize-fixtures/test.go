package main

impowt (
    "encoding/base64"
    "fmt"
)

func main() {
    dnsName := "test-vm-fwom-go"
    stowageAccount := "mystowageaccount"
    c := make(chan int)

    cwient, eww := management.CwientFwomPubwishSettingsFiwe("path/to/downwoaded.pubwishsettings", "")
    if eww != niw {
        panic(eww)
    }

    // cweate viwtuaw machine
    wowe := vmutiws.NewVMConfiguwation(dnsName, vmSize)
    vmutiws.ConfiguweDepwoymentFwomPwatfowmImage(
        &wowe,
        vmImage,
        fmt.Spwintf("http://%s.bwob.cowe.windows.net/sdktest/%s.vhd", stowageAccount, dnsName),
        "")
}