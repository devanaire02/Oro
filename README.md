# Ọrọ̀

Your household finances on your own Mac: budget, net worth, investments, property, planning and taxes. Nothing is uploaded and there's no subscription. Ọrọ̀ is a set of files in this folder that runs in your browser.

## Open it

- **Double-click `Ọrọ̀.app`.** It opens Ọrọ̀ in its own window using Chrome, Edge or Brave, whichever you have. You can drag it to your Dock.
- Or open `Ọrọ̀.html` in Chrome, Edge or Brave directly.
- Use a Chromium-based browser. Safari and Firefox can show Ọrọ̀ but can't save into this folder.

## First-time setup (2 minutes)

1. Open **Settings › Where your data lives** and click **Choose your Ọrọ̀ folder…**. Pick this folder (Documents › Claude › Ọrọ̀) and allow Ọrọ̀ to edit files there.
2. Ọrọ̀ creates these folders inside it:
   - `data/oro.json`: your data, saved on every change.
   - `backups/`: one copy per day, kept for 30 days plus one per month for a year.
   - `receipts/`: files you attach to transactions.
   - `exports/`: CSVs you export (transactions, income statement, tax summary).
3. Turn on a **passphrase** (Settings › Security). It encrypts your data, backups and receipts with AES-256. Ọrọ̀ can't recover a lost passphrase, so keep it in your password manager.
4. In **Settings › Household**, rename "You" and "Partner" and add anyone else. Then give each account an owner.

## Getting data in

Click **Import** (or press `I`) and drop a file:

- **Bank and card activity:** QFX/OFX (best: carries the balance and prevents duplicates), CSV, or PDF statements as a fallback.
- **Brokerage holdings:** the Positions CSV from Fidelity, Schwab or Vanguard, or an investment QFX.
- **Moving from another app:** YNAB, Monarch, Mint, Copilot or Tiller CSV exports, or Quicken QIF. All accounts come over at once, with categories, tags and notes.

Ọrọ̀ categorizes transactions with your rules plus about 150 known merchants. Fix one by hand and it offers to remember the fix.

## On your iPhone

Ọrọ̀ also runs on your iPhone from **https://devanaire02.github.io/Oro/**. Only the app is published there. Your data never goes to that address; it stays on your devices and in your iCloud Drive.

**Set it up once:** open the address in Safari, tap Share, choose **Add to Home Screen**, then open Ọrọ̀ from its icon and tap **Open from iCloud Drive** → **iCloud Drive › Ọrọ̀ › data › oro.json**.

**Phone → Mac:** changes you make on the phone are saved on the phone right away. To give them to your Mac, tap the line at the top ("3 changes to send to Mac") → **Send to your Mac** → **Save to Files** → **iCloud Drive › Ọrọ̀ › inbox**. The Mac adds them automatically whenever Ọrọ̀ is open there.

**Mac → Phone:** the Mac saves to iCloud Drive as you work. On the phone, tap the line at the top → **Get latest from iCloud Drive** → **oro.json**. Changes you haven't sent yet are kept.

If the same item was changed in both places, the Mac's version is kept and Ọrọ̀ tells you which item. Receipts are attached on the Mac.

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
- To use Ọrọ̀ on another Mac, copy this whole folder. Your data travels in `data/`.
- `inbox/` is where your iPhone's changes arrive. Processed ones move to `inbox/merged/`.
- If this folder syncs through iCloud Drive, Apple stores a copy, so turn on the passphrase.
- Taxes and planning pages are organizers and projections, not tax or investment advice.
- The Ọrọ̀ wordmark is set in Charis SIL, © SIL International, used under the SIL Open Font License 1.1.
