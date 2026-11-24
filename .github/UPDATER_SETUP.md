# Updater Configuration Required

The auto-updater has been configured but requires one final step before releases can be signed.

## Action Required

1. **Generate signing keys:**
   ```bash
   npm run tauri signer generate -- -w ~/.tauri/endpoint-lab.key
   ```

2. **Update the public key:**
   - The command above will output a public key
   - Open `src-tauri/tauri.conf.json`
   - Replace `"GENERATE_WITH_TAURI_UPDATER"` with your public key
   - Commit the change

3. **Add GitHub Secrets:**
   - Go to GitHub Settings → Secrets and variables → Actions
   - Add secret: `TAURI_SIGNING_PRIVATE_KEY` (content of `~/.tauri/endpoint-lab.key`)
   - Add secret: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (or leave empty if no password)

## Important Notes

- **Keep the private key secure** - store it in a password manager
- **Never commit the .key file** - it's already in .gitignore
- **Back up the key** - you'll need it for every release
- If you lose the key, you'll need to redistribute with new keys

## Testing

After setup, test the auto-updater:

1. Create a test release with version bump
2. Install the built application
3. Create another release with a higher version
4. Launch the first version - it should prompt for update

## Documentation

See [RELEASE.md](../RELEASE.md) for the complete release process.
