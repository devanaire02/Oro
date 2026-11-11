#!/bin/bash
# Installs Ọrọ̀'s bank helper on this Mac and starts it at login (launchd). Safe to run again; it updates in place.
#   bash install.sh            Plaid's Sandbox (test banks)
#   bash install.sh production your real banks (needs the production secret in the Keychain)
#   bash install.sh remove     stops it and removes it (your Keychain entries stay)
# The helper is copied to ~/Library/Application Support/Oro/oro-plaid and runs with macOS's own Python 3.
# It needs your Plaid client ID and secret in the Keychain (service "oro-plaid"); see README.md here.
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DEST="$HOME/Library/Application Support/Oro/oro-plaid"
LABEL=com.oro.plaid-helper
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/oro-plaid.log"
MODE="${1:-sandbox}"

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
if [ "$MODE" = remove ]; then rm -f "$PLIST"; rm -rf "$DEST"; echo "Removed the helper. Your Keychain entries (service oro-plaid) are still there."; exit 0; fi
case "$MODE" in sandbox|production) ;; *) echo "Use: bash install.sh [sandbox|production|remove]" >&2; exit 1;; esac

mkdir -p "$DEST" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp "$HERE/oro_plaid.py" "$DEST/oro_plaid.py"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/python3</string><string>$DEST/oro_plaid.py</string></array>
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
  *'"ok": true'*) echo "The helper is running ($MODE)."; case "$STATUS" in *'"keys": false'*) echo "Next: put the Plaid keys in the Keychain (see README.md here).";; esac;;
  *) echo "The helper didn't answer. See $LOG" >&2; exit 1;;
esac
