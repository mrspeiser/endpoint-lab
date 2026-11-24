# Quick Setup Guide

This guide will help you get Endpoint Lab up and running quickly.

## For End Users

### Download & Install

1. Go to the [Releases page](https://github.com/mrspeiser/endpoint-lab/releases/latest)
2. Download the installer for your platform:
   - **Windows**: `.msi` file
   - **macOS**: `.dmg` file  
   - **Linux**: `.deb`, `.rpm`, or `.AppImage` file
3. Run the installer
4. Launch Endpoint Lab

The app will automatically check for updates on startup.

## For Developers

### Prerequisites

- **Rust** 1.70+ ([Install Rust](https://rustup.rs/))
- **Node.js** 18+ ([Install Node](https://nodejs.org/))
- **System dependencies** (see README.md for platform-specific requirements)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/mrspeiser/endpoint-lab.git
cd endpoint-lab

# Install dependencies
npm install

# Run in development mode
npm run tauri:dev
```

### Building

```bash
# Build for production
npm run tauri:build

# Installers will be in src-tauri/target/release/bundle/
```

## For Maintainers

### First-Time Release Setup

1. **Generate signing keys** (required for auto-updates):
   ```bash
   npm run tauri signer generate -- -w ~/.tauri/endpoint-lab.key
   ```

2. **Configure the updater** with the public key in `src-tauri/tauri.conf.json`

3. **Add GitHub Secrets**:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

See [RELEASE.md](RELEASE.md) for detailed instructions.

### Creating a Release

```bash
# Bump version
./scripts/bump-version.sh 0.2.0

# Update CHANGELOG.md

# Commit and tag
git add -A
git commit -m "chore: bump version to 0.2.0"
git tag -a v0.2.0 -m "Release v0.2.0"

# Push
git push origin master
git push origin v0.2.0
```

GitHub Actions will automatically build and create a draft release.

## Documentation

- **[README.md](README.md)** - Main documentation and usage guide
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contributing guidelines
- **[RELEASE.md](RELEASE.md)** - Detailed release process
- **[DISTRIBUTION.md](DISTRIBUTION.md)** - Distribution and marketing guide
- **[CHANGELOG.md](CHANGELOG.md)** - Version history

## Getting Help

- Check the [README](README.md) for detailed setup instructions
- Review [Issues](https://github.com/mrspeiser/endpoint-lab/issues) for known problems
- Open a new issue for bugs or feature requests

## License

MIT License - see [LICENSE](LICENSE) file for details.
