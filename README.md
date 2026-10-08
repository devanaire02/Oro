# Ọrọ̀

**Ọrọ̀ is Yoruba for wealth. Know your wealth. Keep it close.**

Your household finances on your own devices: budget, net worth, investments, property, planning and taxes. Nothing is uploaded and there's no subscription. Ọrọ̀ is a set of files in this folder that runs in your browser.

## Open it

- **Double-click Ọrọ̀ in your Applications folder** (you can drag it to the Dock). It opens this folder's `Ọrọ̀.html` in its own window using Chrome, Edge or Brave.
- Or open `Ọrọ̀.html` here with Chrome, Edge or Brave (right-click › Open With).
- The copy of `Ọrọ̀.app` inside this iCloud folder may say it can't be opened, because iCloud Drive doesn't keep it runnable. Use the one in Applications.
- Use a Chromium-based browser on the Mac. Safari and Firefox can show Ọrọ̀ but can't save into this folder.

## First-time setup (2 minutes)

1. Open **Settings › Where your data lives** and click **Choose your Ọrọ̀ folder…**. Pick this folder (iCloud Drive › Ọrọ̀) and allow Ọrọ̀ to edit files there. If Chrome offers **Allow on every visit**, choose it.
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

Ọrọ̀ categorizes transactions on your device, in this order:

1. Your rules.
2. How you categorized the same merchant before.
3. A built-in list of about 2,000 merchants (national chains plus Chicago favorites).
4. The merchant category code, when the file has one (some QFX files include it).
5. The bank's own category column (Chase, Capital One, Discover, Amex and Apple Card CSVs have one).
6. Words in the name, such as GRILL, TAQUERIA, PHARMACY or DENTAL, plus restaurant payment processors like Toast (TST*).

Fix one by hand and it offers to remember the fix. On Transactions, **Auto-categorize** runs all of this again on anything still uncategorized.

## On your iPhone

Ọrọ̀ also runs on your iPhone from **https://devanaire02.github.io/Oro/**. Only the app is published there. Your data never goes to that address; it stays on your devices and in your iCloud Drive.

**Set it up once:** open the address in Safari, tap Share, choose **Add to Home Screen**, then open Ọrọ̀ from its icon and tap **Open from iCloud Drive** → **iCloud Drive › Ọrọ̀ › data › oro.json**.

**Getting around:** the four main pages are in the tab bar at the bottom; everything else, plus Money date (swipe between slides), is under **More**. On an iPhone, transactions show as one line each: tap the category to change it, or **Select** to change several at once.

**Phone → Mac:** changes you make on the phone are saved on the phone right away. To give them to your Mac, tap the line at the top ("3 changes to send to Mac") → **Send to your Mac** → **Save to Files** → **iCloud Drive › Ọrọ̀ › inbox**. If Files opens the **data** folder instead, saving there works too. Never replace `oro.json`. The Mac adds them automatically whenever Ọrọ̀ is open there.

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
