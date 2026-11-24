# Distribution Guide

This guide covers everything needed to distribute Endpoint Lab to end users, including setup for automatic updates.

## Overview

Endpoint Lab uses Tauri's built-in distribution and update system to deliver native applications across platforms:

- **Windows**: `.msi` installer
- **macOS**: Universal `.dmg` and `.app.tar.gz` (Intel + Apple Silicon)
- **Linux**: `.deb`, `.rpm`, `.AppImage`

Updates are delivered automatically through GitHub Releases.

## Initial Setup (One-Time)

### 1. Generate Signing Keys

The auto-updater requires cryptographic keys to verify updates are legitimate:

```bash
# Generate signing keys
npm run tauri signer generate -- -w ~/.tauri/endpoint-lab.key

# Output shows:
# Private key: ~/.tauri/endpoint-lab.key (KEEP SECRET!)
# Public key: dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWd... (use in config)
```

**Important:**
- Store the private key (`.key` file) securely - you'll need it for every release
- Back it up in a secure location (password manager, encrypted drive)
- Never commit it to git (already in `.gitignore`)
- If you lose it, you'll need to redistribute the app with new keys

### 2. Configure the Updater

Add the public key to `src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWd..."
    }
  }
}
```

Commit this change:

```bash
git add src-tauri/tauri.conf.json
git commit -m "chore: configure updater with public key"
git push
```

### 3. Set Up GitHub Secrets

In your GitHub repository:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add **New repository secret**:
   - Name: `TAURI_SIGNING_PRIVATE_KEY`
   - Value: Paste entire contents of `~/.tauri/endpoint-lab.key`
3. Add another secret:
   - Name: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   - Value: Password you used (or leave empty if no password)

## Building Releases

### Quick Method

Use the version bump script:

```bash
# Bump version and get instructions
./scripts/bump-version.sh 0.2.0

# Follow the printed instructions:
# 1. Update CHANGELOG.md
# 2. Review changes
# 3. Commit and tag
# 4. Push
```

### Manual Method

See [RELEASE.md](RELEASE.md) for detailed release process.

### What Happens During Build

When you push a tag (e.g., `v0.2.0`):

1. GitHub Actions triggers automatically
2. Builds for all platforms in parallel:
   - **Windows**: x64 `.msi` installer
   - **macOS**: Universal binary (Intel + ARM) as `.dmg` and `.app.tar.gz`
   - **Linux**: `.deb`, `.rpm`, `.AppImage`
3. Signs all artifacts with your private key
4. Creates a draft release with all installers
5. Generates `latest.json` for the updater

Build time: ~15-20 minutes total

## Publishing a Release

1. Go to [GitHub Releases](https://github.com/mrspeiser/endpoint-lab/releases)
2. Find the draft release created by Actions
3. Review the auto-generated release notes
4. Edit if needed to add:
   - Feature highlights
   - Breaking changes
   - Known issues
5. Click **Publish release**

The update is now live! Users will be notified on next app launch.

## User Update Experience

When an update is available:

1. User launches the app
2. A dialog appears: "Update available: v0.2.0"
3. User can view changes or install now
4. Update downloads in background
5. Installs on next restart

Users can also check manually: **Help** → **Check for Updates**

## Distribution Channels

### Primary: GitHub Releases (Recommended)

- Free hosting
- Automatic update delivery
- Download statistics
- Release notes

Shareable links:
```
https://github.com/mrspeiser/endpoint-lab/releases/latest
```

### Alternative Channels

#### Homebrew (macOS)

Create a Homebrew tap for easy installation:

```bash
brew install mrspeiser/tap/endpoint-lab
```

Setup: See [Homebrew tap documentation](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap)

#### Winget (Windows)

Submit to Windows Package Manager:

```bash
winget install EndpointLab
```

Setup: See [Winget submission guide](https://docs.microsoft.com/en-us/windows/package-manager/package/)

#### Snapcraft (Linux)

Publish to Ubuntu Snap Store:

```bash
snap install endpoint-lab
```

Setup: See [Snapcraft documentation](https://snapcraft.io/docs)

#### Flathub (Linux)

Publish to Flathub for universal Linux distribution:

```bash
flatpak install endpoint-lab
```

Setup: See [Flathub submission](https://github.com/flathub/flathub/wiki/App-Submission)

## Verification

### Test the Build Locally

Before releasing:

```bash
# Build locally
npm run tauri:build

# Test installers in:
# src-tauri/target/release/bundle/
```

### Test the Update System

1. Install version N (e.g., 0.1.0)
2. Create and publish version N+1 (e.g., 0.2.0)
3. Launch version N
4. Verify update dialog appears
5. Test the update process

### Verify Signature

Users can verify authenticity:

```bash
# Using Tauri CLI
tauri signer verify \
  --public-key "YOUR_PUBLIC_KEY" \
  --file path/to/installer
```

## Troubleshooting

### "Updater not configured" error

- Verify public key is in `tauri.conf.json`
- Check the key format (should start with "dW50cnVzdGVk...")
- Rebuild the app after updating config

### GitHub Actions fails

- Check Actions tab for detailed logs
- Verify both secrets are set correctly
- Ensure all CI tests pass before tagging

### Users not receiving updates

- Verify release is **published** (not draft)
- Check `latest.json` exists in release assets
- Confirm public key matches private key used for signing
- Check users are on a release version (dev builds don't update)

### Signature verification fails

- Public and private keys must be from same generation
- Don't regenerate keys after distributing app
- If keys are lost, must do a fresh release with new keys

## Security Best Practices

- ✅ Store private key in secure location
- ✅ Use GitHub Secrets for CI/CD
- ✅ Never commit private key
- ✅ Enable 2FA on GitHub account
- ✅ Review all PRs before merging
- ✅ Use signed commits
- ✅ Keep dependencies updated
- ❌ Don't share private key
- ❌ Don't store key in cloud sync folders
- ❌ Don't commit secrets to git

## Monitoring

### Download Statistics

GitHub provides:
- Download counts per release
- Downloads per platform
- Geographic distribution (via API)

View in: Release page on GitHub

### Update Analytics

Consider adding optional telemetry:
- Update success rate
- Platform distribution
- Version adoption
- Error reporting

Always respect user privacy and make it opt-in.

## Marketing & Distribution

### Website

Create a landing page with:
- Download buttons for each platform
- Feature highlights
- Screenshots/demo video
- Documentation links

### Social Media

Announce releases on:
- Twitter/X
- Reddit (r/rust, r/webdev)
- Hacker News
- Dev.to

### Documentation

Maintain:
- README.md - Quick start
- User guide - Detailed usage
- API documentation (if applicable)
- Video tutorials

### Community

Build community through:
- GitHub Discussions
- Discord server
- Issue tracker engagement
- Contributing guidelines

## Analytics & Feedback

### Recommended Tools

- **GitHub Insights**: Stars, forks, clones
- **Sentry**: Error tracking (opt-in)
- **Google Analytics**: Website traffic
- **Plausible**: Privacy-friendly analytics

### Gathering Feedback

- GitHub Issues
- User surveys
- Feature voting
- Beta testing program

## Compliance

### Open Source License

- MIT License included (see LICENSE file)
- Include in all distributions
- Credit dependencies

### Privacy

- Document data collection (if any)
- Provide privacy policy
- GDPR/CCPA compliance if applicable
- Clear opt-out mechanisms

### Code Signing

For better trust:

- **macOS**: Sign with Apple Developer account
- **Windows**: Sign with EV certificate
- **Linux**: Not typically required

## Costs

| Item | Cost | Purpose |
|------|------|---------|
| GitHub Hosting | Free | Release hosting & CI/CD |
| Apple Developer | $99/year | macOS code signing (optional) |
| Windows Cert | $400-800/year | Windows code signing (optional) |
| Domain | $10-20/year | Website (optional) |

Minimum cost: **$0** (GitHub free tier is sufficient)

## Support

For distribution questions:
- Review [RELEASE.md](RELEASE.md)
- Check [Tauri docs](https://tauri.app/v1/guides/)
- Open issue on GitHub
- Join Tauri Discord

## Resources

- [Tauri Distribution Guide](https://tauri.app/v1/guides/distribution/)
- [GitHub Releases Documentation](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
