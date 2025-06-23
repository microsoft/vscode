# Waveform Surfer

A powerful VSCode extension for viewing digital waveform files, integrating the [Surfer](https://surfer-project.org/) waveform viewer with advanced parsing capabilities using Rust WebAssembly.

## Features

- **Multi-format Support**: View VCD, FST, GHW, and FSDB waveform files
- **High Performance**: Rust WebAssembly parser for fast file processing
- **Integrated UI**:
  - Signal hierarchy browser
  - Displayed signals manager
  - Custom editor for waveform files
- **Surfer Integration**: Leverages the powerful Surfer waveform viewer
- **Large File Support**: Streaming parser for handling large waveform files

## Supported File Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| VCD    | `.vcd`    | Value Change Dump (IEEE 1364) |
| FST    | `.fst`    | Fast Signal Trace (GTKWave) |
| GHW    | `.ghw`    | GHDL Waveform |
| FSDB   | `.fsdb`   | Synopsys Fast Signal Database |

## Installation

### From VSCode Marketplace
1. Open VSCode
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Waveform Surfer"
4. Click Install

### From Source
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install Rust dependencies:
   ```bash
   npm run install:rust-deps
   ```
4. Build the extension:
   ```bash
   npm run package
   ```
5. Install the generated `.vsix` file

## Usage

### Opening Waveform Files
- Open any supported waveform file (`.vcd`, `.fst`, `.ghw`, `.fsdb`)
- The extension will automatically register as the default viewer
- Files will open in the custom Surfer-powered editor

### Signal Navigation
- Use the **Signal Hierarchy** panel to browse available signals
- Click on signals to add them to the waveform view
- Manage displayed signals in the **Displayed Signals** panel

### Commands
- **Add Signal**: Add selected signals to the waveform display
- **Remove Signal**: Remove signals from display
- **Zoom to Fit**: Fit all waveforms in the viewport
- **Export Image**: Export the current view as an image

## Development

### Prerequisites
- Node.js 18+
- Rust 1.70+
- VSCode 1.85+

### Setup
```bash
# Clone the repository
git clone https://github.com/voltai/waveform-surfer-v2.git
cd waveform-surfer-v2

# Install Node.js dependencies
npm install

# Install Rust target for WebAssembly
rustup target add wasm32-unknown-unknown

# Install optional tools for optimization
npm install -g wasm-opt @bytecodealliance/wit2ts
```

### Building

#### Full Build
```bash
npm run package
```

This will:
1. Generate TypeScript bindings from WIT interface
2. Compile Rust to WebAssembly
3. Optimize WASM module
4. Download Surfer distribution
5. Bundle TypeScript code

#### Development Build
```bash
npm run compile
```

#### Watch Mode
```bash
npm run watch
```

### Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   VSCode API    │    │   TypeScript     │    │   Rust WASM     │
│                 │◄──►│   Extension      │◄──►│   Parser        │
│ Custom Editor   │    │                  │    │                 │
│ Tree Views      │    │ - Document Mgmt  │    │ - VCD Parser    │
│ Commands        │    │ - Webview Host   │    │ - FST Parser    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Webview UI     │
                       │                  │
                       │ - Surfer Embed   │
                       │ - Message Bridge │
                       │ - State Mgmt     │
                       └──────────────────┘
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Testing

```bash
# Run TypeScript tests
npm test

# Run Rust tests
cargo test

# Run integration tests
npm run test:integration
```

## Configuration

The extension can be configured through VSCode settings:

```json
{
  "waveformSurfer.theme": "auto",        // "dark", "light", or "auto"
  "waveformSurfer.maxFileSize": 100      // Maximum file size in MB
}
```

## Troubleshooting

### Common Issues

**Extension fails to load WASM module**
- Ensure Rust is installed and the wasm32 target is added
- Try rebuilding: `npm run build:wasm`

**Surfer not loading**
- Check if Surfer was downloaded: `ls dist/surfer/`
- Manually download if needed: `npm run download:surfer`

**Large files fail to parse**
- Increase the max file size setting
- Consider using a more efficient format (FST instead of VCD)

### Development Issues

**TypeScript compilation errors**
- Ensure WIT bindings are generated: `npm run generate:bindings`
- Check TypeScript version compatibility

**Rust compilation errors**
- Verify Rust toolchain: `rustup show`
- Update dependencies: `cargo update`

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Surfer Project](https://surfer-project.org/) for the excellent waveform viewer
- [wellen](https://github.com/ekiwi/wellen) for VCD parsing
- VSCode team for the excellent extension APIs

## Related Projects

- [Surfer](https://gitlab.com/surfer-project/surfer) - The core waveform viewer
- [GTKWave](http://gtkwave.sourceforge.net/) - Traditional waveform viewer
- [WaveTrace](https://github.com/wavetrace/wavetrace) - Web-based waveform viewer
