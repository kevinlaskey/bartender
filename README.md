# Bartender 🍸

A little phone app: check off what's in your bar, and it shows which cocktails you can make.
Heart the ones she loves, and add notes like "extra lime, no salt."

## What it does

- **My Bar** – tap ingredients you have. "Worth buying next" shows which single bottle would unlock the most new drinks.
- **Drinks** – what you can make right now, then drinks you're missing just one thing for. Filter by vibe (sour, sweet, fizzy, creamy…) or search.
- **Make me a cocktail** – random pick from what you can make. Favorites come up 3× more often.
- **Favorites** – her hearted drinks, split into "can make now" vs "need something." Has its own random-pick button.
- **Notes** on any drink ("she likes it less sweet").
- **Your own recipes** (More tab). Type any ingredient. New ones show up under "Other" in My Bar.
- Works offline once it has loaded.

## Where the data lives

Everything is saved in the phone's browser storage (`localStorage`). No account, no server, and nothing is sent anywhere.

- It's **per phone, per browser**. If you and your wife both want it, each phone keeps its own copy.
  To copy your setup over, use **More → Save backup**, then **Load backup** on the other phone.
- On iPhone, the home-screen app has its own storage, separate from Safari. Set it up after adding it to the home screen.
- Save a backup now and then, in case browser data gets cleared.

## Put it on GitHub Pages (free)

1. Create a new **public** repo on GitHub, for example `bartender`.
2. Upload these files to it, either by dragging them into the GitHub web page ("Add file → Upload files") or with git:
   ```bash
   git init
   git add .
   git commit -m "Bartender app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/bartender.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, then Save.
4. After a minute it's live at `https://<your-username>.github.io/bartender/`.

## Add it to your home screen

- **iPhone (Safari):** open the link, tap **Share → Add to Home Screen**.
- **Android (Chrome):** open the link, tap **⋮ → Add to Home screen** (or **Install app**).

It opens full-screen with its own icon, like a regular app.

## Changing the drink list

All recipes and ingredients are in [`data.js`](data.js). Each recipe looks like this:

```js
{ n: 'Margarita', g: 'Rocks or coupe', v: ['sour', 'fruity'],
  i: [['tequila', '2 oz'], ['triple_sec', '1 oz'], ['lime', '1 oz'], ['salt', 'for the rim', 1]],
  m: 'Shake with ice and strain over fresh ice.' },
```

- A `1` at the end of an ingredient marks it optional (garnish, rim, and so on).
- `'bourbon|rye'` means either one works.

Don't rename a built-in drink after hearting it: favorites and notes are tied to the name.

## Run it locally

```bash
python -m http.server 8765
```

Then open http://localhost:8765.
