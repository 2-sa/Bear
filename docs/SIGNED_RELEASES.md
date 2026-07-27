# Signed Harbor releases

Harbor checks only this static Tauri updater manifest:

`https://github.com/2-sa/Bear/releases/latest/download/latest.json`

The application embeds the public key from `src-tauri/tauri.conf.json`. GitHub stores the
private key as an environment secret and uses it only while building a manually requested
release. Tauri verifies every downloaded updater artifact before installation.

## One-time GitHub setup

1. Keep a secure backup of `C:\Users\Windows\Documents\HarborSecrets\harbor-updater.key`.
   Losing it means installed copies cannot trust future releases. Never commit or share it.
2. Authenticate GitHub CLI with `gh auth login --hostname github.com --web`.
3. Run `powershell -ExecutionPolicy Bypass -File scripts/configure-github-update-signing.ps1`.
   The script creates the `release-signing` environment, restricts it to `main`, requires the
   authenticated account's approval, and uploads the private key without printing it.

The generated key currently has no password, so `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is not
required. The protected environment and the private-key backup are the security boundary.

## Publish an update

1. Set the same SemVer version in `package.json`, `src-tauri/tauri.conf.json`, and
   `src-tauri/Cargo.toml`.
2. Merge the reviewed release commit into the protected release branch.
3. Run the `Signed Tauri Release` workflow manually and approve the `release-signing`
   environment deployment.
4. The workflow creates or updates `v<version>` as a draft release and uploads Windows and
   macOS installers, signatures, updater bundles, and `latest.json`.
5. Inspect the draft assets and `latest.json`, then publish the draft. Installed applications
   do not see a draft release.

Do not upload unsigned replacement assets to an existing release. To rotate the updater key,
first ship a release signed by the current key that embeds the replacement public key.
