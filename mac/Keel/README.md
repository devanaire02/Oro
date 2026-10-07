# Keel

Your household finances on your own Mac: budget, net worth, investments, property, planning and taxes. Nothing is uploaded and there's no subscription. Keel is a set of files in this folder that runs in your browser.

## Open it

- **Double-click `Keel.app`.** It opens Keel in its own window using Chrome, Edge or Brave, whichever you have. You can drag it to your Dock.
- Or open `Keel.html` in Chrome, Edge or Brave directly.
- Use a Chromium-based browser. Safari and Firefox can show Keel but can't save into this folder.

## First-time setup (2 minutes)

1. Open **Settings › Where your data lives** and click **Choose your Keel folder…**. Pick this folder (Documents › Claude › Keel) and allow Keel to edit files there.
2. Keel creates these folders inside it:
   - `data/keel.json`: your data, saved on every change.
   - `backups/`: one copy per day, kept for 30 days plus one per month for a year.
   - `receipts/`: files you attach to transactions.
   - `exports/`: CSVs you export (transactions, income statement, tax summary).
3. Turn on a **passphrase** (Settings › Security). It encrypts your data, backups and receipts with AES-256. Keel can't recover a lost passphrase, so keep it in your password manager.
4. In **Settings › Household**, rename "You" and "Partner" and add anyone else. Then give each account an owner.

## Getting data in

Click **Import** (or press `I`) and drop a file:

- **Bank and card activity:** QFX/OFX (best: carries the balance and prevents duplicates), CSV, or PDF statements as a fallback.
- **Brokerage holdings:** the Positions CSV from Fidelity, Schwab or Vanguard, or an investment QFX.
- **Moving from another app:** YNAB, Monarch, Mint, Copilot or Tiller CSV exports, or Quicken QIF. All accounts come over at once, with categories, tags and notes.

Keel categorizes transactions with your rules plus about 150 known merchants. Fix one by hand and it offers to remember the fix.

## Going over the month together

Use **Money date** (top right) for a slide-by-slide walkthrough of any month, made for sitting down with your partner. It covers the big picture, money in and out, where it went, budget wins and misses, who spent what, goals, what's coming up, and decisions. Switch the top bar to **Simple** for a lighter view any time.

## Keyboard

| Keys | Does |
| --- | --- |
| `⌘K` | Search or jump anywhere |
| `N` | New transaction |
| `I` | Import |
| `/` | Search transactions |
| `G` then a letter | Go to a page |
| `⇧P` | Hide or show amounts |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `?` | All shortcuts |

## Good to know

- If the sidebar says **Reconnect**, click it. Browsers occasionally ask you to re-confirm folder access.
- To use Keel on another Mac, copy this whole folder. Your data travels in `data/`.
- If this folder syncs through iCloud Drive, Apple stores a copy, so turn on the passphrase.
- Taxes and planning pages are organizers and projections, not tax or investment advice.
