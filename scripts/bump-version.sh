#!/bin/bash

# Script to bump version across all configuration files
# Usage: ./scripts/bump-version.sh <new-version>
# Example: ./scripts/bump-version.sh 0.2.0

set -e

if [ -z "$1" ]; then
    echo "Error: Version number required"
    echo "Usage: $0 <version>"
    echo "Example: $0 0.2.0"
    exit 1
fi

NEW_VERSION="$1"

# Validate version format (basic check)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Version must be in format X.Y.Z (e.g., 0.2.0)"
    exit 1
fi

echo "Bumping version to $NEW_VERSION..."

# Update package.json
echo "Updating package.json..."
npm version "$NEW_VERSION" --no-git-tag-version

# Update Cargo.toml (workspace version)
echo "Updating Cargo.toml..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/^version = \".*\"$/version = \"$NEW_VERSION\"/" Cargo.toml
else
    # Linux
    sed -i "s/^version = \".*\"$/version = \"$NEW_VERSION\"/" Cargo.toml
fi

# Update src-tauri/tauri.conf.json
echo "Updating src-tauri/tauri.conf.json..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
else
    # Linux
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
fi

echo ""
echo "✓ Version bumped to $NEW_VERSION in:"
echo "  - package.json"
echo "  - Cargo.toml"
echo "  - src-tauri/tauri.conf.json"
echo ""
echo "Next steps:"
echo "  1. Update CHANGELOG.md"
echo "  2. Review changes: git diff"
echo "  3. Commit: git add -A && git commit -m 'chore: bump version to $NEW_VERSION'"
echo "  4. Create tag: git tag -a v$NEW_VERSION -m 'Release v$NEW_VERSION'"
echo "  5. Push: git push origin master && git push origin v$NEW_VERSION"
