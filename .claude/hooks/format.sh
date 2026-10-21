#!/bin/sh
# Düzenlenen dosyayı prettier ile biçimlendirir (CI format:check ile uyumlu).
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  *.ts|*.tsx|*.json|*.md|*.yml|*.yaml)
    cd "$CLAUDE_PROJECT_DIR" && pnpm exec prettier --write "$f" >/dev/null 2>&1 ;;
esac
exit 0
