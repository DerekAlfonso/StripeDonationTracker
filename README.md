# TCBC Text-a-Thon

A Netlify hosted donation dashboard for Stripe Payment Links. Campaign settings, selected link, polling interval, and dashboard access token are saved in the operator browser's local storage. A small Netlify Function reads Stripe; the restricted Stripe key stays in Netlify's environment. The public `/donate?for=...` page forwards donors to Stripe without using the function.

## Deploy

1. Deploy this repository to Netlify. It has no build step or package dependencies. `netlify.toml` publishes the root directory and includes the Netlify Function.
2. In Netlify **Site configuration → Environment variables**, add:
   - `STRIPE_RESTRICTED_KEY`: a Stripe `rk_test_...` or `rk_live_...` key with **Read** permission for **Payment Links**, **Checkout Sessions**, **Payment Intents**, and **Charges**. Leave every other permission at **None** unless Stripe says one is required. The last two allow the timer to use the payment charge timestamp.
   - `DASHBOARD_TOKEN`: a private, random token of at least 20 characters. Use a password manager to generate it.
3. Redeploy after setting or changing environment variables.
4. Open the deployed site on a trusted operator device, choose **Configure**, enter the dashboard token, connect to Stripe, select a Payment Link, set the campaign name and refresh interval, then **Save configuration**. The interval can be 10–3600 seconds.

The dashboard token is stored in that browser's local storage. It grants read access to the Function's campaign data, so use a trusted device and do not share it with donors. The Stripe restricted key is never sent to the browser. The Function returns only the fields needed for the dashboard and rejects requests without the token.

Use the ⛶ button in the top bar to present the dashboard full-screen. The top bar and introductory title disappear in full-screen mode, leaving the KPIs and chart; press **Esc** to leave it. The chart and KPI cards expand across wide monitors, and each leaderboard bar has its own color.

## Make a donation link in Stripe

1. Use a [Stripe sandbox](https://docs.stripe.com/sandboxes) or test mode first.
2. Open [Payment Links → Create](https://dashboard.stripe.com/payment-links/create/customer-chooses-pricing), select **Customers choose what to pay**, add a campaign title, optionally set suggested/minimum/maximum amounts, and create the link. This option is for one-time donations.
3. Create a [restricted API key](https://docs.stripe.com/keys/restricted-api-keys) in the **same mode** with read access as described above.
4. Configure Netlify and select the link in TCBC Text-a-Thon. Enter a name such as `Derek A` in **Credit this name** and copy the generated URL. It contains `?for=Derek+A`.

The generated URL opens a static page on this site. That page encodes the name into Stripe's supported `client_reference_id` query parameter and redirects to the selected Payment Link. Stripe does not support a raw `for` query parameter as a Checkout field. The dashboard decodes the reference and uses it for the leaderboard. If a donation has no generated reference, a Stripe Checkout custom field with key `for` is used when available; otherwise it is shown as **Unattributed**. Names in share links are public and should not include sensitive information.

## Test without real donations

Use a test or sandbox restricted key and a test mode Payment Link. Open a generated share URL and donate with Stripe's test card `4242 4242 4242 4242`, any future expiry, and any three digit CVC. Return to the dashboard and click **Refresh now** or wait for the next poll. Confirm the donation count, total, `For` leaderboard, and last gift timer change. No real charge is made in test mode. The unconfigured dashboard displays sample data so the layout can be previewed; its **DEMO MODE** badge distinguishes it from Stripe data.

Only **paid, complete** one-time Checkout Sessions for the selected Payment Link count. Pending and failed attempts are excluded. The Function pages through Stripe data up to 10,000 sessions; beyond that it reports an error rather than showing partial totals. A link with multiple payment currencies also reports an error rather than adding unlike currencies.

The “since last gift” timer uses the latest charge creation time from Stripe when available. It falls back to the Payment Intent or Checkout Session creation time if the charge timestamp is unavailable.

## Local checks

Run `node --test`. To exercise the Netlify Function locally, use Netlify Dev with the two environment variables set. A plain static file server can preview the demo dashboard and donation redirect but does not provide the Function.

## References

- [Stripe: Create a Payment Link](https://docs.stripe.com/payment-links/create)
- [Stripe: Payment Link URL parameters](https://docs.stripe.com/payment-links/url-parameters)
- [Stripe: Restricted API keys](https://docs.stripe.com/keys/restricted-api-keys)
- [Stripe: Test card numbers](https://docs.stripe.com/testing)
