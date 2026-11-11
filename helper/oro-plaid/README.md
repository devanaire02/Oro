# Ọrọ̀'s bank helper (Plaid)

Ọrọ̀ can bring in new bank and card transactions through [Plaid](https://plaid.com) instead of downloaded files. Plaid needs a secret key that must never sit inside a web page, so this small program runs on your Mac and talks to Plaid for Ọrọ̀:

- It listens on `127.0.0.1:47321` only (this Mac), answers only Ọrọ̀'s web address, and only after you've paired it with Ọrọ̀ (the Mac asks you once, in its own window).
- Your Plaid client ID and secret, and each bank connection, stay in the Mac's **Keychain** (service `oro-plaid`), read and written with macOS's own `security` tool. Nothing else is written to disk.
- It keeps nothing about your transactions and logs only the time, the path asked for and the result code (`~/Library/Logs/oro-plaid.log`).
- Plaid's sign-in window is Plaid's own hosted page, opened in a window of its own, so Plaid's code never runs inside Ọrọ̀.
- Python standard library only. It needs **Python 3.11 or newer** (Homebrew's: `brew install python`). macOS's own `python3` is 3.9, which no longer gets security fixes, so the helper won't start on it. `bash install.sh python` shows which Python it will use.

## Setting it up

1. **Put your Plaid keys in the Keychain.** In Terminal (each value is asked for twice and never shown):

   ```bash
   security add-generic-password -U -s oro-plaid -a client-id -l "Ọrọ̀ Plaid client ID" -w
   security add-generic-password -U -s oro-plaid -a sandbox-secret -l "Ọrọ̀ Plaid Sandbox secret" -w
   ```

   For real banks, later: `-a production-secret`. Never paste keys anywhere else.

2. **Install the helper** (it starts at login):

   ```bash
   bash install.sh             # Plaid's Sandbox: test banks, free
   bash install.sh production  # your real banks
   bash install.sh remove      # stop and remove it (Keychain entries stay)
   ```

3. **In Ọrọ̀ on the Mac:** Settings › Bank connections › Look for the bank helper, then Pair, then Connect a bank. Chrome may ask once whether Ọrọ̀ may talk to apps on this Mac.

## What Ọrọ̀ asks it

| Path | What it does |
|---|---|
| `GET /status` | Running, which environment, whether the keys are in the Keychain and whether it's paired. |
| `POST /pair` | Asks you in a Mac window, then gives Ọrọ̀ the helper key. |
| `POST /link/start` | A sign-in window from Plaid (hosted link): a new connection, or update mode for one that needs signing in again. |
| `POST /link/finish` | Whether you've finished; the new connection (bank, accounts, last 4 digits). Its access token goes to the Keychain only. |
| `POST /accounts` | Accounts and balances (Plaid's cached, free call). |
| `POST /sync` | Transactions added, changed or removed since the saved position, posted only, with the sign flipped to the bank files' way (money out is minus). |
| `POST /remove` | Removes the connection at Plaid (which stops its monthly charge) and from the Keychain. |
| `POST /items` | The connections on this Mac (bank names, no tokens). |
| `POST /sandbox/…` | Sandbox only, for testing: connect a test bank without the window, add a test transaction, make a bank ask to sign in again. |
