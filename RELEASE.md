# Release Process

This document describes how to create and publish releases for Endpoint Lab.

## Prerequisites

### 1. Generate Updater Keys (First Time Only)

The Tauri updater requires cryptographic keys to sign releases. Generate them once and store securely:

```bash
npm run tauri signer generate -- -w ~/.tauri/endpoint-lab.key
```

This creates:
- Private key: `~/.tauri/endpoint-lab.key` (keep this SECRET!)
- Public key: printed to console

### 2. Update Configuration

1. Copy the **public key** from the output
2. Update `src-tauri/tauri.conf.json`:
   ```json
   "plugins": {
     "updater": {
       "pubkey": "YOUR_PUBLIC_KEY_HERE"
     }
   }
   ```
3. Commit this change

### 3. Add GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

1. **TAURI_SIGNING_PRIVATE_KEY**
   - Content of `~/.tauri/endpoint-lab.key`
   - Required for signing releases

2. **TAURI_SIGNING_PRIVATE_KEY_PASSWORD**
   - Password you set when generating the key
   - Leave empty if you didn't set a password

## Creating a Release

### 1. Update Version

Update the version in these files:

- `package.json`
- `src-tauri/tauri.conf.json`
- `Cargo.toml` (workspace version)

Example for version 0.2.0:

```bash
# Update package.json
npm version 0.2.0 --no-git-tag-version

# Update Cargo.toml
sed -i 's/version = "0.1.0"/version = "0.2.0"/' Cargo.toml

# Update tauri.conf.json
sed -i 's/"version": "0.1.0"/"version": "0.2.0"/' src-tauri/tauri.conf.json
```

### 2. Update Changelog

Document changes in a changelog or release notes:

- New features
- Bug fixes
- Breaking changes
- Known issues

### 3. Commit and Create Tag

```bash
# Commit version changes
git add package.json Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: bump version to 0.2.0"

# Create annotated tag with release notes
git tag -a v0.2.0 -m "Release v0.2.0

## What's New

- Feature: Added XYZ
- Fix: Resolved ABC issue
- Improvement: Better performance

## Breaking Changes

- None

## Known Issues

- None
"

# Push commits and tag
git push origin master
git push origin v0.2.0
```

### 4. Automated Build

The GitHub Actions workflow will automatically:

1. Create a draft release
2. Build for Windows, macOS (Intel + Apple Silicon), and Linux
3. Generate signed installers (.msi, .dmg, .deb, .rpm, .AppImage)
4. Upload artifacts to the release
5. Generate `latest.json` for the updater

### 5. Publish Release

1. Go to GitHub Releases
2. Find the draft release
3. Review the auto-generated notes
4. Edit if needed
5. Click "Publish release"

The auto-updater will now distribute this version to users.

## Release Workflow

```
Version Bump → Commit → Tag → Push → GitHub Actions → Draft Release → Publish
```

## Manual Build (Optional)

To build locally for testing:

```bash
# Build for current platform
npm run tauri build

# Output in:
# src-tauri/target/release/bundle/
```

## Updater Workflow

When users launch the app:

1. App checks `https://github.com/mrspeiser/endpoint-lab/releases/latest/download/latest.json`
2. Compares current version with available version
3. If newer version exists, prompts user
4. Downloads and verifies signature with public key
5. Installs update and restarts

## Versioning Guidelines

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features, backwards compatible
- **PATCH** (0.0.1): Bug fixes, backwards compatible

## Testing Releases

### Local Testing

```bash
# Build in release mode
npm run tauri build

# Test the installer from:
# src-tauri/target/release/bundle/
```

### Updater Testing

1. Install version N
2. Create and publish version N+1
3. Launch version N
4. Verify update prompt appears
5. Test update installation

## Troubleshooting

### Build Fails on GitHub Actions

- Check the Actions tab for error logs
- Verify secrets are configured correctly
- Ensure all platforms pass CI before tagging

### Updater Not Working

- Verify public key in `tauri.conf.json` matches the private key
- Check that `latest.json` exists in the release
- Ensure release is published (not draft)
- Check browser console for errors

### Signature Verification Fails

- Private key and public key must match
- Don't regenerate keys after publishing releases
- Store the private key securely and consistently

## Security Notes

- **Never** commit the private key (`.key` file)
- **Never** share the private key publicly
- Store the key in a secure password manager
- Back up the key securely
- Use GitHub Secrets for CI/CD

## Support

For release issues:
1. Check GitHub Actions logs
2. Review this documentation
3. Open an issue with details
