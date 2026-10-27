# REA Desktop

REA Desktop is an installable Electron interface for the existing local REA
runtime. Installers bundle the pinned Node.js runtime so they do not depend on
Node.js being installed separately. Its first workflow selects a file or
application folder and runs `inspect-artifact`, displaying the CLI's JSON
result without rewriting its Evidence. The UI can copy the exact JSON output or
save it to a location chosen by the user.

The app does not upload the selected target, execute it, or accept arbitrary
commands from the renderer. Inspection is limited to the existing artifact
inspection workflow; native deep analysis and provider configuration remain
available through REA's existing CLI/MCP interfaces.

## Run from the repository

Use the pinned Node.js and npm versions from `.nvmrc` and `package.json`:

```bash
npm ci
npm run build:cached
npm run desktop:dev
```

## Package for the current host

```bash
npm run desktop:dist
```

Electron Builder writes the host-native installer/package under
`release/desktop/`. Windows produces an NSIS installer, macOS produces a DMG and
ZIP, and Linux produces an AppImage and Debian package. Build each target on its
matching operating system. macOS distribution signing and notarization require
maintainer-owned Apple credentials and are not configured here.
