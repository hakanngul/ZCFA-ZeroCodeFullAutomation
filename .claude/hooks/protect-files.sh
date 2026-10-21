#!/bin/sh
# Gizli/kalıcı veri ve lockfile düzenlemelerini engeller.
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  */.local/*|*assistant.key|*.sqlite|*/pnpm-lock.yaml)
    echo "Engellendi: $f (yerel veri, şifreleme anahtarı veya lockfile elle düzenlenmez)" >&2
    exit 2 ;;
esac
