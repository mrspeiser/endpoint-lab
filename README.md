# Endpoint Lab

A modern, Rust-first HTTP client and API benchmark tool built with Tauri. Organize your API requests by domain, manage collections, and test endpoints with a beautiful, performant desktop interface.

## Features

- 🚀 **Fast & Native**: Built with Rust for maximum performance
- 📁 **Organized Collections**: Group APIs by domain and collection
- 🔧 **Path Management**: Save and reuse API endpoints with different HTTP methods
- 📋 **Header & Body Presets**: Store frequently used headers and request bodies
- 📥 **Import/Export**: Import from JSON manifests
- 💾 **Persistent Storage**: Your data is saved locally and follows the workspace
- 🎨 **Modern UI**: Clean, intuitive interface built with React

## Download & Installation

### Pre-built Binaries (Recommended)

Download the latest release for your platform:

- **Windows**: Download `.msi` installer from [Releases](https://github.com/mrspeiser/endpoint-lab/releases)
- **macOS**: Download `.dmg` or `.app.tar.gz` from [Releases](https://github.com/mrspeiser/endpoint-lab/releases)
- **Linux**: Download `.deb`, `.rpm`, or `.AppImage` from [Releases](https://github.com/mrspeiser/endpoint-lab/releases)

The application will automatically check for updates on startup.

### Building from Source

#### Prerequisites

Before building, ensure you have the following installed:

1. **Rust** (1.70 or later)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Node.js** (18 or later)
   ```bash
   # Using nvm (recommended)
   nvm install 18
   nvm use 18
   ```

3. **Platform-specific dependencies**

   **Linux (Debian/Ubuntu)**:
   ```bash
   sudo apt update
   sudo apt install libwebkit2gtk-4.1-dev \
     build-essential \
     curl \
     wget \
     file \
     libssl-dev \
     libayatana-appindicator3-dev \
     librsvg2-dev
   ```

   **Linux (Fedora/RHEL)**:
   ```bash
   sudo dnf install webkit2gtk4.1-devel \
     openssl-devel \
     curl \
     wget \
     file \
     libappindicator-gtk3-devel \
     librsvg2-devel
   ```

   **macOS**:
   ```bash
   # Xcode Command Line Tools
   xcode-select --install
   ```

   **Windows**:
   - Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section)

#### Build Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/mrspeiser/endpoint-lab.git
   cd endpoint-lab
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run tauri dev
   ```

4. **Build for production**
   ```bash
   npm run tauri build
   ```

   The built application will be in `src-tauri/target/release/bundle/`

## Usage

### Getting Started

1. **Create a Domain**: Click the menu icon in the Domains column and add a new domain (e.g., `api.example.com`)
2. **Add a Collection**: Select a domain, then create a collection with a base URL (e.g., `http://127.0.0.1:8080/v1`)
3. **Add Paths**: Add API endpoints with HTTP methods (GET, POST, PUT, DELETE, etc.)
4. **Save Headers & Bodies**: Store commonly used headers and request bodies for reuse
5. **Make Requests**: Select a path and execute requests with your saved presets

### Importing Data

You can import paths, headers, and bodies from a JSON manifest:

```json
{
  "paths": [
    { "method": "GET", "path": "/users" },
    { "method": "POST", "path": "/users" }
  ],
  "headers": [
    { "name": "Authorization", "header": "Authorization: Bearer token123" }
  ],
  "bodies": [
    { "name": "Create User", "body": "{\"name\": \"John Doe\"}" }
  ]
}
```

## Development

### Project Structure

```
endpoint-lab/
├── src/                    # React frontend source
│   ├── features/          # Feature-based components
│   │   ├── library/       # API collection management
│   │   └── workspace/     # Request execution workspace
│   └── styles.css         # Global styles
├── src-tauri/             # Rust backend
│   ├── src/               # Tauri app code
│   └── tauri.conf.json    # Tauri configuration
├── crates/                # Rust workspace crates
│   ├── core/              # Core API logic
│   └── cli/               # CLI interface
└── package.json           # Node dependencies
```

### Available Scripts

- `npm run dev` - Start Vite dev server
- `npm run build` - Build frontend
- `npm run preview` - Preview production build
- `npm run check` - Type-check TypeScript
- `npm run tauri dev` - Run app in development mode
- `npm run tauri build` - Build production app

### Code Quality

Before committing, ensure your code passes type checking:

```bash
npm run check
```

## Auto-Updates

Endpoint Lab includes automatic update checking. When a new version is available:

1. The app will notify you on startup
2. You can review the changelog
3. Updates are downloaded and installed automatically
4. The app will restart with the new version

Updates are served from GitHub Releases.

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Support

For issues, questions, or suggestions, please [open an issue](https://github.com/mrspeiser/endpoint-lab/issues) on GitHub.
