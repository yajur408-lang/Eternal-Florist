# Open questions for the owner (@oohflorist)

The site is built and works, but the items below must come from the owner. Until they are filled in, the site shows a yellow "To confirm with the owner" marker in their place. In production the server **refuses to start** while the items marked **(launch blocker)** are missing (see `content/business.json`, `requiredForLaunch`). Run `npm run check-content` to see what is still missing.

## Catalogue (blocks selling anything except one item)
1. **Prices.** The only price on the Instagram page is "Hello Kitty & Bouquet, Combo set: Rs.1050/-". The other 9 pieces show "Ask for a price" and link to WhatsApp/DM. For each one: the exact name, price in NPR, and variants (size, colour, number of stems, lights or not). Edit `content/products.json`, then run `npm run migrate`.
2. **Product names.** These names are provisional, written by me from the photo or a cut-off caption. Please confirm or correct: "Flower basket with teddy", "Blue butterfly bouquet", "Sunflower bouquet", "Light-up bouquets with plush", "Light-up butterfly bouquet", "Blue bouquet", "17 roses bouquet".
3. **Stock.** Is everything made to order, or are some pieces in stock with limited quantity? The site currently assumes made to order and doesn't track stock.
4. **Licensed characters.** Are the Hello Kitty and My Melody plushies official Sanrio merchandise? Selling items named after trademarked characters on your own website carries more risk than Instagram posts do. The owner should decide whether to keep those names.

## Business facts (launch blockers)
5. **Contact email** for the site and order emails. **(launch blocker)**
6. **Legal owner name** (person or registered business) for the policies. PAN/VAT registration, and whether prices include VAT. **(launch blocker)**
7. **Delivery areas** (Pokhara only, or all of Nepal) and whether there's pickup. **(launch blocker)**
8. **Delivery fees.** The checkout currently charges for items only. If there is a fee, I'll add it as a server-side line item. **(launch blocker)**
9. **Refund and return policy**, especially for custom pieces. **(launch blocker)**
10. **Cancellation rules.** **(launch blocker)**
11. **Lead time** for orders and custom pieces.
12. **Reply hours** for WhatsApp/DM.
13. **Data retention:** how long order records are kept (tax rules may decide this).
14. **Postal address** for marketing-email footers. This is only needed if they will send marketing emails. The code refuses to send marketing emails without it.
15. **Full Instagram bio.** The screenshot cuts off at "DM to... more".
16. **WhatsApp 9806533832.** Is it OK to show it publicly? I assumed country code +977 for the wa.me links.
17. **@oohribbonrolls:** Should the site link to it, and what is the relationship? It isn't linked yet.
18. **Language:** English only, or also Nepali?

## Images
19. **Higher-quality photos.** Every product image was cropped from your screenshots, so all of them are LOW resolution (between 200x230 and 338x410 px). Please get the original photos and the logo file. Drop them into `public/img/` with the same filenames.
    - Lowest quality: `red-roses.webp` (200x230), `sunflower-bouquet.webp` (225x244), `tulip-bouquet.webp` (338x195), `logo.webp` (194x194).
    - Several crops include the reel's caption text overlay (`hello-kitty-combo.webp`).
20. **Written permission** from the owner to use their Instagram photos and logo on the site. Who drew the cat logo? If it came from an illustrator or a generator, check that they're allowed to use it commercially.

## Payments and accounts
21. Does the owner have an **eSewa merchant account**? If not, **apply now**. It needs business documents and can take time.
22. eSewa only, or also **cash on delivery / Khalti**? Only eSewa is built, per the brief.
23. **Domain name**, **hosting** account (Render is recommended in SETUP.md) and **email sender** (for example Brevo, Postmark or Resend).
