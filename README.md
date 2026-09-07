# File Organizer

A cross-platform drag-and-drop file organizer with rule-based automation and **one-click auto-organize by file type**. Built with Electron + React.

Sorts a messy folder into clean, automatically-named folders (`Images`, `Documents`, `01_Images`, `02_pdf`, …) with zero setup — or with your own custom rules.

> **Automation angle:** this is a practical rule-engine for a real-world pain point (folder chaos). The rule system (extension / regex / type → target) mirrors how workflow-automation tools chain "when X → do Y" logic — the same thinking used in n8n/Make/Zapier automation builds.

## Features

- ⚡ **Auto Organize (no rules needed)** — pick a scheme, click one button:
  - Folders per file type → `Images`, `Documents`, `Videos`, `Audio`, `Archives`
  - Numbered + type → `01_Images`, `02_Documents`, `03_Videos`, …
  - Per extension → `01_png`, `02_jpg`, …
  - Optional "Others" folder for everything unmatched
- 🖱️ **Drag-and-drop** — drag loose files from the left onto folder tiles to move them
- ⚙️ **Custom rules** — extension, regex name pattern, or file type → target folder
- 🛡️ **Safe moves** — never overwrites (auto-renames `name (1).ext`), handles cross-drive (EXDEV) moves, can't move a folder into itself
- 💾 **Rules persist** between app launches

## Download

Installers and source are in **Releases**:

| File | Platform | How to install |
|---|---|---|
| `File Organizer-Setup-1.0.0-x64.exe` | Windows (recommended) | Run it. Follow the wizard. Creates Desktop + Start Menu shortcuts and an uninstaller. |
| `File Organizer-Portable-1.0.0-x64.exe` | Windows (portable) | Just run it — no install needed. Works from a USB drive. |
| `File Organizer-1.0.0-x86_64.AppImage` | Linux (any distro) | `chmod +x "File Organizer-1.0.0-x86_64.AppImage"` then double-click or `./File Organizer-1.0.0-x86_64.AppImage` |
| `File Organizer-1.0.0-linux-amd64.deb` | Linux (Debian/Ubuntu) | `sudo dpkg -i "File Organizer-1.0.0-linux-amd64.deb"`. Adds a launcher icon in the app menu. |
| `File Organizer.app` | macOS | Drag to Applications. (Build the `.dmg` on a Mac if preferred.) |

## How to use

1. Launch **File Organizer**.
2. Click **Select Folder** → choose the folder with loose files.
3. Two ways to organize:
   - **Auto Organize:** in the ⚡ panel, pick a folder-naming option (type / numbered+type / extension), optionally tick "Move everything else into Others", then click **Auto Organize Now**.
   - **Manual:** drag files from the left panel onto any folder tile on the right. Create a new tile by typing a name and clicking **Add tile**.
4. Custom automation (optional): add rules under **Organization Rules** and click **Apply Rules Now** — everything matching each rule is moved into its target folder.

## Development

```bash
npm install
npm run react-build          # production JS -> build/
npx electron-builder --linux # AppImage + deb
npx electron-builder --win   # Setup.exe + portable (needs wine on Linux)
npx electron-builder --mac   # .app bundle (run on macOS for a .dmg)
npm run react-icons          # regenerate brand icons (edit scripts/make_icons.py)
```

## License

Proprietary — see [LICENSE.txt](LICENSE.txt). Selling/redistribution requires written permission from the author.

## Contact / Support

- Issues: https://github.com/mzpakistani9-commits/file-organizer/issues
- Email: mzpakistani9@gmail.com