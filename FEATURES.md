# New Features

This document describes the new features added to Endpoint Lab.

## Environment Variables

Access via the **🔧 Environment** button in the top bar.

### Features
- Create multiple environments (Dev, Staging, Production, etc.)
- Define variables with name-value pairs
- Enable/disable individual variables
- Use variables in requests with `{{variableName}}` syntax
- Variables work in URLs, headers, query parameters, and request bodies

### Usage
1. Click "🔧 Environment" in the top bar
2. Select or create an environment
3. Add variables with names and values
4. Use `{{VARIABLE_NAME}}` in your requests
5. Variables are automatically substituted when sending requests

### Storage
- Stored in browser localStorage
- Persists across sessions
- Separate variable sets per environment

## Export Functionality

Access via the **📤 Export** button in the top bar.

### Export Formats

#### Current Request
- **JSON**: Complete request object with all details
- **cURL**: Ready-to-use cURL command
- **HTTP**: Raw HTTP request format

#### Collection Export
- **JSON**: Complete collection with paths, headers, and bodies
- **cURL**: Individual cURL commands for each path
- **HTTP**: HTTP request format for each endpoint

### Features
- Copy to clipboard with one click
- Download as file
- Secret values masked in exports (shown as ***)
- Base URLs automatically combined with paths in collection exports

### Usage
1. Click "📤 Export" in the top bar
2. Choose "Current Request" or "Collection"
3. Select output format (JSON, cURL, or HTTP)
4. Click "Generate"
5. Copy or download the output

## Settings & Theme Toggle

Access via the **⚙️ Settings** button in the top bar.

### Features
- **Light Theme**: Clean, high-contrast light mode for daytime use
- **Dark Theme**: Low-eye-strain dark mode (default)
- Instant theme switching
- Settings persist across sessions

### Light Theme
- Optimized colors for readability in bright environments
- Maintains all functionality and UI elements
- GitHub-inspired color palette
- Proper contrast ratios for accessibility

### Usage
1. Click "⚙️ Settings" in the top bar
2. Select theme: "Dark" or "Light"
3. Click "Save"
4. Theme applies immediately

### Storage
- Stored in browser localStorage
- Remembered on app restart

## UI Improvements

### Top Bar
- Reorganized with clear action buttons
- Environment, Export, and Settings easily accessible
- Better visual hierarchy
- Maintains existing mode switcher (Request/Benchmark)

### Modals
- Consistent modal design across all dialogs
- Click outside to close
- Keyboard-friendly (ESC to close)
- Responsive sizing
- Proper backdrop blur effect

### Accessibility
- Proper ARIA labels
- Keyboard navigation support
- Focus management in modals
- Color contrast in both themes

## Technical Details

### New Files Created
- `src/features/settings/SettingsModal.tsx` - Settings UI
- `src/features/environment/EnvironmentModal.tsx` - Environment variables UI
- `src/features/export/ExportModal.tsx` - Export functionality UI
- `src/state/settings.tsx` - Settings state management
- `src/state/environment.tsx` - Environment variables state management
- `src/lib/export.ts` - Export utility functions

### Modified Files
- `src/App.tsx` - Added modal controls and buttons
- `src/main.tsx` - Wrapped app with new providers
- `src/types.ts` - Added EnvironmentVariable type
- `src/styles.css` - Added modal styles and light theme

### State Management
- Settings and environment use React Context API
- Persistent storage via localStorage
- Proper provider hierarchy for data flow

### Variable Substitution
- Pattern matching with regex: `{{variableName}}`
- Only enabled variables are substituted
- Whitespace inside braces is ignored
- Case-sensitive variable names

## Future Enhancements

Potential additions based on user feedback:
- Environment import/export
- Nested/scoped variables
- Variable validation
- Secret variable masking in UI
- Variable usage highlighting in editors
- Postman collection import
- More export formats (OpenAPI, Insomnia, etc.)
