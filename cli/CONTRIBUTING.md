# Setup

0. Clone, and then run `git submodule update --init --recursive`
1. Get the extensions: [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) and [CodeLLDB](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb)
2. Ensure your workspace is set to the `launcher` folder being the root.

## Building the CLI on Windows

For the moment, we require OpenSSL on Windows, where it is not usually installed by default. To install it:

1. Install (clone) vcpkg [using their instructions](https://github.com/Microsoft/vcpkg#quick-start-windows)
1. Add the location of the `vcpkg` directory to your system or user PATH.
1. Run`vcpkg install openssl:x64-windows-static-md` (after restarting your terminal for PATH changes to apply)
1. You should be able to then `cargo build` successfully

OpenSSL is needed for the key exchange we do when forwarding Basis tunnels. When all interested Basis clients support ED25519, we would be able to solely use libsodium. At the time of writing however, there is [no active development](https://chromestatus.com/feature/4913922408710144) on this in Chromium.

# Debug

1. You can use the Debug tasks already configured to run the launcher.
