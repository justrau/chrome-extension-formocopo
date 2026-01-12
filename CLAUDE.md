# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run watch      # Development mode with auto-rebuild on changes
npm run build      # Production build
npm run pack       # Create zip package for Chrome Web Store
npm run repack     # Build + pack in one command
npm run format     # Format code with Prettier
```

After building, load the extension in Chrome via `chrome://extensions/` → "Load unpacked" → select the `build/` directory.

## Architecture

This is a Chrome Extension (Manifest V3) for saving and filling web forms.

### Entry Points (in `src/`)
- **background.js** - Service worker that manages context menus. Updates menu items when presets are saved/deleted.
- **contentScript.js** - Injected into all pages. Handles form saving, form filling, keyboard shortcuts, and the preset popover UI.
- **popup.js** - Extension popup UI for managing presets and shortcuts.
- **settings.js** - Options page for configuring the popover shortcut.

### Data Flow
1. User right-clicks a form → background.js shows context menu → sends message to contentScript.js
2. contentScript.js collects form data using `getUniqueFieldId()` to create stable field identifiers
3. Data stored in `chrome.storage.local` under `formPresets` key
4. Form filling uses multi-pass approach (up to 10 passes with 200ms delays) to handle dynamic forms

### Key Storage Keys
- `formPresets` - Object mapping preset names to `{url, formData, savedAt}`
- `formShortcuts` - Object mapping keyboard shortcuts to preset names
- `popoverShortcut` - Global shortcut to show preset popover

### Build Configuration
- Webpack config in `config/webpack.config.js`
- Output goes to `build/` directory
- Static assets (manifest.json, HTML, icons) copied from `public/`
