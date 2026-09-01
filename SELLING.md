# Building & Selling File Organizer

## Installers (already built in `dist/`)
| File | Platform | Purpose |
|---|---|---|
| `File Organizer-Setup-1.0.0-x64.exe` | Windows | Installer (ask-install, custom dir, desktop + start-menu shortcuts, uninstaller) |
| `File Organizer-Portable-1.0.0-x64.exe` | Windows | Portable — runs from a USB/anywhere, no install |
| `File Organizer-1.0.0-x86_64.AppImage` | Linux | Run on any distro (double-click to run) |
| `File Organizer-1.0.0-linux-amd64.deb` | Linux | Ubuntu/Debian package — installs launcher icon into the app menu |
| `dist/mac/File Organizer.app` | macOS | Signed-ready .app bundle (finalize on a Mac) |

All installers already carry the brand icon:
- Windows: `assets/icon.ico` (16–256px) in setup, uninstaller, exe, shortcuts
- macOS: `assets/icon.icns` in the bundle
- Linux: `assets/icon.png` in the menu/app-icon

## Rebuild everything
```bash
npm install
npm run react-build        # production JS bundle -> build/
npm run react-icons        # regenerate icons (edit scripts/make_icons.py first)
npx electron-builder --linux      # AppImage + deb
npx electron-builder --win        # Setup.exe + portable (needs wine on Linux)
npx electron-builder --mac        # .app bundle (must be run on macOS for a .dmg)
```

## macOS: finalize the .dmg on a Mac
The .app bundle is already built. On a Mac:
```bash
npx electron-builder --mac
```
Windows-only blocker: electron-builder can build the .app on Linux, but making the
`.dmg` + Gatekeeper-clean signing requires macOS.

## Before you sell — do these
1. **Code-sign** so Windows/macOS stop showing "Unknown publisher":
   - Windows: buy an OV/EV code-signing cert → set `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`
   - macOS: Apple Developer ID cert → set `CSC_LINK` + `CSC_KEY_PASSWORD`
   - Linux: sign the AppImage with `gpg2 --detach-sign` (optional)
2. **Set your real publisher/email**:
   - In `package.json`: `author.name`, `author.email`, `maintainer`
   - Update the placeholder email `zubair@localhost`
3. **Bump the version** in `package.json` before each paid release
4. **Auto-update** (optional, larger effort): wire `electron-updater` + S3/cloud
   storage; end users then get silent updates.

## Selling strategies
- Gumroad / Payhip / Lemon Squeezy — pay-what-you-want, instant download of the
  Setup.exe + AppImage + zip, no infra needed (they host checkout + downloads).
- The NSIS installer shows a EULA (LICENSE.txt) during install — already wired.
- Publish to stores later for more reach: Microsoft Store (needs MSIX + Win app
  cert), Ubuntu Snap, Flathub (both need accounts).

## Asset list
- `assets/icon.png` (1024), `icon-512.png`, `icon-256.png` — Linux/misc
- `assets/icon.ico` — Windows
- `assets/icon.icns` — macOS
- `LICENSE.txt` — end-user EULA + your copyright notice