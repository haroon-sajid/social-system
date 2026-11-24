# Social Hub Setup Guide

Claude drafts. You review each platform preview in the dashboard and click Publish. n8n posts it and shows you the link or the exact error. Nothing is ever posted automatically.

Supabase project: `qpmsrznvleogzjnovsmw` (database is already built and tested)

## How it fits together

| Part | Where | Job |
| --- | --- | --- |
| Claude | Claude app (custom connector) | Reads platform rules, writes drafts, reads analytics. Cannot publish. |
| Social 0 MCP Server | n8n | Connects Claude to the database |
| Social 1 One Click Publish | n8n webhook, runs only when you click | Posts one version to Facebook Page, Instagram, Threads or LinkedIn (text plus 1 image) and returns the post link |
| Social 2 Analytics and Tokens | n8n, daily 3:15 AM PKT | Pulls metrics, checks every token |
| Social 3 Weekly Insights | n8n, Monday 9:10 AM PKT | Gemini writes 5 post ideas from your results |
| Dashboard | Vercel (free) or your PC | Preview, edit, one click publish, calendar, analytics |
| X, Reddit, Facebook Groups | Dashboard buttons | Open the platform with text filled in, you press Post |

## Folders

| Folder | What it is |
| --- | --- |
| `dashboard/` | Next.js 16 app. This is what you run locally or deploy to Vercel. |
| `n8n/` | The 4 workflows to import into n8n. |
| `tools/` | Python scripts that generate the `n8n/` files. Only needed if you change a workflow. |

## Step 1. Get your tokens and IDs

When you finish, you have: Facebook Page token + Page ID, Instagram ID, Threads token + Threads ID, LinkedIn token (person ID comes in Step 3), Gemini API key, and a webhook secret you make up.

**Facebook Page and Instagram (one token for both)**
1. Instagram app: Settings, Account type and tools, switch to a **Professional account**. On Facebook: Page settings, Linked accounts, Instagram, Connect.
2. developers.facebook.com, My Apps, Create App. Add the use cases **Manage everything on your Page** and **Manage messaging and content on Instagram**. Development mode is fine for your own accounts.
3. Graph API Explorer: pick your app, Generate Access Token with `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `business_management`. Select your Page and Instagram account in the popup.
4. Access Token Debugger: paste it, click **Extend Access Token**, copy the long token.
5. In Explorer with the long token run `me/accounts?fields=id,name,access_token`. Copy your Page `id` (Page ID) and `access_token` (Page token). The debugger should say **Expires: Never** for the Page token.
6. With the Page token run `YOUR_PAGE_ID?fields=instagram_business_account` and copy the `id` inside. That is your Instagram ID.

**Threads**
1. Same Meta app: Use cases, Add, **Access the Threads API** with `threads_basic`, `threads_content_publish`, `threads_manage_insights`.
2. App roles, Roles, Add people, **Threads Tester**, your Threads username. Accept on threads.com: Settings, Account, Website permissions, Invites.
3. Threads use case settings, User Token Generator: generate a token.
4. If it lasts 1 hour, exchange it for a 60 day token in your browser:
   `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=THREADS_APP_SECRET&access_token=SHORT_TOKEN`
5. Get the ID: `https://graph.threads.net/v1.0/me?fields=id,username&access_token=YOUR_TOKEN`. Write down the date 60 days from today.

**LinkedIn (personal profile)**
1. linkedin.com/developers/apps, Create app (it needs a Company Page you manage).
2. Products tab: request **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**.
3. OAuth Token Generator tool: scopes `openid profile w_member_social`. The token lasts 60 days. Write down the date.

**Gemini (free)**: aistudio.google.com, Get API key, Create API key.

**Webhook secret**: make up a long random string (40+ letters and numbers). The same value goes in n8n and in the dashboard env.

## Step 2. n8n credentials (names must match exactly)

| Credential name | Type | Fields | Allowed domain |
| --- | --- | --- | --- |
| Supabase Service Key | Custom Auth | `{"headers":{"apikey":"SERVICE_ROLE_KEY","Authorization":"Bearer SERVICE_ROLE_KEY"}}` | `qpmsrznvleogzjnovsmw.supabase.co` |
| Meta Page Token | Query Auth | Name `access_token`, Value = Page token | `graph.facebook.com` |
| Threads Token | Query Auth | Name `access_token`, Value = Threads token | `graph.threads.net` |
| LinkedIn Bearer | Header Auth | Name `Authorization`, Value `Bearer LINKEDIN_TOKEN` | `api.linkedin.com, www.linkedin.com` (image uploads go to www.linkedin.com, so do not allow only api.linkedin.com) |
| Publish Webhook Secret | Header Auth | Name `x-publish-secret`, Value = your secret | |
| Gemini API Key | Header Auth | Name `x-goog-api-key`, Value = Gemini key | `generativelanguage.googleapis.com` |

The `service_role` key is in Supabase: Project Settings, API Keys. Keep it secret.

## Step 3. LinkedIn person ID

1. In n8n make an empty workflow with one HTTP Request node: GET `https://api.linkedin.com/v2/userinfo`, Authentication Generic, Header Auth, **LinkedIn Bearer**.
2. Execute step and copy `sub`. That is your person ID. Delete the test workflow.

## Step 4. Import workflows

1. n8n: Workflows, Import from File, import the 4 files in `n8n/`.
2. Open each one. If a node shows a credential warning, pick the credential with the same name.
3. Activate all 4.
4. Copy two Production URLs:
   * Social 0, MCP Server node (for Claude)
   * Social 1, Publish Webhook node (for the dashboard). It ends with `/webhook/social-publish`. Do not use the `/webhook-test/` URL.

Recommended Railway variables for n8n to keep the database small:
`EXECUTIONS_DATA_PRUNE=true` and `EXECUTIONS_DATA_MAX_AGE=168`

**Already imported an older version?** Re-import `social-1-one-click-publish.json` and `social-3-weekly-insights.json` (replace the old ones, then re-select credentials and activate). Social 1 now returns the post link for Instagram and Threads. Social 3 now raises an alert when Gemini sends a bad answer.

## Step 5. Your dashboard login (Supabase)

1. Authentication, Users, Add user, Create new user: your email and a strong password, tick Auto confirm.
2. SQL Editor, run this with your email:
   ```sql
   insert into public.app_admins (user_id)
   select id from auth.users where email = 'YOUR_EMAIL';
   ```
3. Authentication, Sign In / Providers, Email: turn **off** "Allow new users to sign up".

## Step 6. Run the dashboard on your PC

Needs Node.js 20.9 or newer (`node --version`).

```powershell
cd D:\social-system\dashboard
npm install
Copy-Item .env.example .env.local   # skip if .env.local already exists
notepad .env.local                  # set N8N_PUBLISH_WEBHOOK_URL and N8N_WEBHOOK_SECRET
npm run dev
```

Open http://localhost:3000 and sign in with the user from Step 5. Restart `npm run dev` after any change to `.env.local`.

**Skip the login on your PC (optional).** Add these two lines to `.env.local` and restart:

```
AUTH_DISABLED=true
SUPABASE_SERVICE_ROLE_KEY=your service_role key (Supabase, Project Settings, API Keys)
```

The dashboard then opens without a login and shows "Login off (local only)" at the top. The server uses the service role key, which never reaches the browser. This only works on your PC: Vercel ignores `AUTH_DISABLED`, so a deployed dashboard always asks for a login. (On Vercel, add `SUPABASE_SERVICE_ROLE_KEY` only if you use the Claude API there. It stays on the server; never put it in a `NEXT_PUBLIC_` variable.) The dev server only listens on this PC (127.0.0.1), so other devices on your network cannot open it. To turn the login back on, set `AUTH_DISABLED=false` and restart.

Other commands (run inside `dashboard`):

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with live reload on http://localhost:3000 |
| `npm run typecheck` | Checks the TypeScript for errors |
| `npm run build` then `npm start` | Production build, served on http://localhost:3000 (same as Vercel) |

Local and Vercel use the same Supabase database and the same n8n, so a post you publish locally is a real post.

## Step 7. Put the dashboard online (Vercel, free)

1. Push the **contents** of `dashboard/` to a private GitHub repo. Do not upload `node_modules`, `.next` or `.env.local` (the `.gitignore` already skips them).
2. Vercel, Add New, Project, import the repo.
3. Environment Variables (same values as `.env.local`):
   * `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (already filled in `.env.example`)
   * `N8N_PUBLISH_WEBHOOK_URL` = Social 1 Production URL
   * `N8N_WEBHOOK_SECRET_HEADER` = `x-publish-secret`
   * `N8N_WEBHOOK_SECRET` = same random string as the n8n credential
4. Deploy and sign in.

## Step 8. First setup inside the dashboard

**Settings, Connected accounts.** Add 4 rows:

| Platform | Display name | ID | Token expires |
| --- | --- | --- | --- |
| Facebook Page | your Page name | Page ID | empty (never expires) |
| Instagram | your IG username | Instagram ID | empty |
| Threads | your Threads username | Threads ID | date from Step 1 |
| LinkedIn | your name | person ID from Step 3 | date from Step 1 |

**Groups and subreddits.** Add each Facebook Group and subreddit you post in, with its link and its rules.

**Platform rules.** Already filled in. Change tone or format notes and Claude follows them.

## Step 9. Connect Claude

There are two ways. Both can only create and edit drafts; publishing is always your click.

**A. Claude app (through n8n).** Claude app, Settings, Connectors, Add custom connector, paste the MCP Server production URL.
Keep that URL private. The random path works as the key.

**B. Your own Claude agent (Agent SDK, Messages API tools or any script).** The dashboard has an HTTP API at `/api/claude`.
It needs two values in `.env.local` (or your host's environment variables), then a restart:

```
SOCIAL_HUB_API_KEY=a long random key (24+ characters)
SUPABASE_SERVICE_ROLE_KEY=your service_role key
```

Every request sends `Authorization: Bearer <SOCIAL_HUB_API_KEY>`. Endpoints:

| Method and path | What it does |
| --- | --- |
| `GET /api/claude` | Lists the endpoints (no key needed) |
| `GET /api/claude/context` | Platform rules, saved groups and subreddits, accounts. Call this first. |
| `POST /api/claude/drafts` | Creates a post with every field filled: title, master_text, topic, content_type, tags, media, and one entry in `variants` per platform (body, hashtags, link_url, title for Reddit, group_target_ids) |
| `PATCH /api/claude/variants/{id}` | Fixes one draft or failed platform version |
| `GET /api/claude/posts?limit=10` | Recent posts with each platform's status |
| `GET /api/claude/performance?days=30` | Analytics summary for planning |

Media can be a public link (`{ "public_url": "https://...jpg", "mime_type": "image/jpeg" }`) or a file sent as base64
(`{ "data_base64": "...", "mime_type": "image/jpeg" }`, up to 20 MB). Instagram needs a JPEG.
The reply includes `edit_url` (open it to review), and for each platform `char_count`, `max_chars` and `errors` to fix with PATCH.
Settings, Claude API in the dashboard shows the base URL, a full example request, and which Compose field each API field fills.
An agent on the same PC can call `http://127.0.0.1:3000/api/claude`; an agent in the cloud needs your deployed address.

Try: "Check my platform rules, then draft a post about my n8n caregiver check-in automation for all platforms."

## Step 10. Test before real use (in this order)

1. Ask Claude for a draft (or send one to `POST /api/claude/drafts`). It should appear in Posts.
2. Facebook Page: text only, click Publish. Within about 10 seconds it shows Published with a link.
3. Then: Facebook with 1 image, Instagram with 1 image, Threads text, LinkedIn text, LinkedIn with 1 image.
4. Click Publish all ready on a new post to post to all 4 API platforms at once.
5. X and Reddit: click Open and post, post it, paste the link, Mark as posted.
6. Next morning: Analytics shows numbers. Alerts bar is empty. To see analytics right away, open Social 2 in n8n and click Execute workflow.

## Keep it running

* **Red bar at the top of the dashboard:** a token failed or expires within 7 days. Renew the token, update the n8n credential, then change the date in Settings, Connected accounts and click Save. The expiry alert closes as soon as you save a date more than 7 days away.
* **Every 60 days:** renew the Threads and LinkedIn tokens (as above).
* **Facebook and Instagram:** the Page token never expires unless you change your Facebook password or remove the app.
* **A post failed:** read the error on the card, fix it, click Retry.
* **A card says "Stuck in publishing":** n8n stopped mid-way (for example a restart). Open the Social 1 executions in n8n and check the platform. If the post is not there, click Retry.

## Limits to know

* Instagram needs JPEG images. The dashboard converts images to JPEG for you.
* LinkedIn personal post analytics are not on the free API. X, Reddit and Groups are posted by hand, so only post counts show.
* Facebook Groups have no API since 2024, and Reddit closed new API access, so they stay manual.
* One click publish supports text plus 1 image. Post videos and multi image posts by hand for now.
* If a post fails you see the exact error right away. Double clicks are blocked, so nothing posts twice.

## Changing a workflow

Edit the matching script in `tools/`, then regenerate (writes into `n8n/`):

```powershell
cd D:\social-system\tools
python build_mcp.py; python build_publisher.py; python build_analytics.py
```

Then re-import the changed file in n8n.

## Monthly cost

Railway Hobby $5 (n8n only). Supabase, Vercel, Gemini, Meta, Threads and LinkedIn APIs: free. X: free (posted by hand).
