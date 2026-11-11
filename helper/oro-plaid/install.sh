#!/bin/bash
# Installs Ọrọ̀'s bank helper on this Mac and starts it at login (launchd). Safe to run again; it updates in place.
#   bash install.sh            Plaid's Sandbox (test banks)
#   bash install.sh production your real banks (needs the production secret in the Keychain)
#   bash install.sh remove     stops it and removes it (your Keychain entries stay)
#   bash install.sh python     only prints which Python it would use
# The helper is copied to ~/Library/Application Support/Oro/oro-plaid and runs with a Python that still gets security
# fixes (3.11 or newer): Homebrew's python3, which Homebrew keeps current. macOS's own /usr/bin/python3 is 3.9, past its
# end of life, so it isn't used. ORO_PLAID_PYTHON can name another one.
# It needs your Plaid client ID and secret in the Keychain (service "oro-plaid"); see README.md here.
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DEST="$HOME/Library/Application Support/Oro/oro-plaid"
LABEL=com.oro.plaid-helper
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/oro-plaid.log"
MODE="${1:-sandbox}"

pick_python() {   # the first one that is 3.11 or newer (the same floor as MIN_PYTHON in oro_plaid.py)
  local p
  for p in "${ORO_PLAID_PYTHON:-}" /opt/homebrew/bin/python3 /usr/local/bin/python3; do
    [ -n "$p" ] && [ -x "$p" ] || continue
    "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null && { echo "$p"; return 0; }
  done
  return 1
}
if [ "$MODE" != remove ]; then
  PY="$(pick_python)" || { echo "The bank helper needs Python 3.11 or newer. Install it with Homebrew (brew install python), then run this again." >&2; exit 1; }
  if [ "$MODE" = python ]; then echo "$PY"; exit 0; fi
fi

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
if [ "$MODE" = remove ]; then rm -f "$PLIST"; rm -rf "$DEST"; echo "Removed the helper. Your Keychain entries (service oro-plaid) are still there."; exit 0; fi
case "$MODE" in sandbox|production) ;; *) echo "Use: bash install.sh [sandbox|production|remove|python]" >&2; exit 1;; esac

mkdir -p "$DEST" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp "$HERE/oro_plaid.py" "$DEST/oro_plaid.py"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$DEST/oro_plaid.py</string></array>
  <key>EnvironmentVariables</key><dict><key>ORO_PLAID_ENV</key><string>$MODE</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>StandardOutPath</key><string>/dev/null</string>
</dict></plist>
EOF
launchctl bootstrap "gui/$UID" "$PLIST"
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null --max-time 1 -H 'Origin: https://devanaire02.github.io' "http://127.0.0.1:47321/status" && break; sleep 0.5
done
STATUS=$(curl -s --max-time 5 -H 'Origin: https://devanaire02.github.io' "http://127.0.0.1:47321/status" || true)
case "$STATUS" in
  *'"ok": true'*) echo "The helper is running ($MODE, Python $("$PY" -c 'import platform; print(platform.python_version())'))."; case "$STATUS" in *'"keys": false'*) echo "Next: put the Plaid keys in the Keychain (see README.md here).";; esac;;
  *) echo "The helper didn't answer. See $LOG" >&2; exit 1;;
esac
