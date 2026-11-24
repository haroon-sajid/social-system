"""Writes n8n/CREDENTIALS.local.md: the exact n8n credentials to create, with the values you already have.

The sheet holds secrets, so it is git-ignored. Run it again after you add or change a value:
    python tools/build_credentials_sheet.py
Values are read from dashboard/.env.local and tools/secrets.local.json. Social tokens can be added to
tools/secrets.local.json as they come in (keys: meta_page_token, threads_token, linkedin_token, gemini_key).
"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ENV = os.path.join(ROOT, "dashboard", ".env.local")
SECRETS = os.path.join(ROOT, "tools", "secrets.local.json")
OUT = os.path.join(ROOT, "n8n", "CREDENTIALS.local.md")


def read_env(path):
    vals = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    vals[k.strip()] = v.strip()
    return vals


def real(v):
    return bool(v) and not v.startswith("PASTE_") and "YOUR-N8N-DOMAIN" not in v


env = read_env(ENV)
sec = {}
if os.path.exists(SECRETS):
    with open(SECRETS, encoding="utf-8") as f:
        sec = json.load(f)

service = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
webhook_secret = env.get("N8N_WEBHOOK_SECRET", "")
mcp_path = sec.get("mcp_path", "(run python tools/build_mcp.py first)")
TODO = "PASTE_WHEN_YOU_HAVE_IT"


def status(ok):
    return "Ready" if ok else "To get"


def val(key):
    v = sec.get(key, "")
    return v if real(v) else TODO


rows = [
    ("Supabase Service Key", "Custom Auth", real(service), "qpmsrznvleogzjnovsmw.supabase.co"),
    ("Publish Webhook Secret", "Header Auth", real(webhook_secret), "(not needed: it protects the webhook)"),
    ("Meta Page Token", "Query Auth", real(sec.get("meta_page_token", "")), "graph.facebook.com"),
    ("Threads Token", "Query Auth", real(sec.get("threads_token", "")), "graph.threads.net"),
    ("LinkedIn Bearer", "Header Auth", real(sec.get("linkedin_token", "")), "api.linkedin.com, www.linkedin.com"),
    ("Gemini API Key", "Header Auth", real(sec.get("gemini_key", "")), "generativelanguage.googleapis.com"),
]

supa_json = json.dumps({"headers": {"apikey": service if real(service) else TODO,
                                    "Authorization": f"Bearer {service if real(service) else TODO}"}}, indent=2)

md = f"""# n8n credentials for Social Hub

PRIVATE: this file holds secrets. It is git-ignored; never paste it into chat, GitHub or anywhere public.

## How to use

1. In n8n: **Overview > Create > Credential**, pick the type, and use the **exact name** below.
   The workflows point to credentials by name, so they connect automatically.
2. Create the credentials **before** importing the workflows.
3. In each credential, open **Allowed HTTP Request Domains**, choose "Specific domains" and enter the domain listed.

## Overview

| # | Credential name (exact) | Type | Status | Allowed domains |
| --- | --- | --- | --- | --- |
""" + "\n".join(f"| {i} | {n} | {t} | {status(ok)} | {d} |" for i, (n, t, ok, d) in enumerate(rows, 1)) + f"""

## 1. Supabase Service Key ({status(real(service))})

Type **Custom Auth**. Paste this into the **JSON** field:

```json
{supa_json}
```

## 2. Publish Webhook Secret ({status(real(webhook_secret))})

Type **Header Auth**. The same value is N8N_WEBHOOK_SECRET in the dashboard (.env.local and Vercel).

- Name: `x-publish-secret`
- Value: `{webhook_secret if real(webhook_secret) else TODO}`

## 3. Meta Page Token ({status(real(sec.get("meta_page_token", "")))})

Type **Query Auth**. One token for the Facebook Page and Instagram (setup guide, Step 1).

- Name: `access_token`
- Value: `{val("meta_page_token")}`

## 4. Threads Token ({status(real(sec.get("threads_token", "")))})

Type **Query Auth**. Lasts 60 days.

- Name: `access_token`
- Value: `{val("threads_token")}`

## 5. LinkedIn Bearer ({status(real(sec.get("linkedin_token", "")))})

Type **Header Auth**. Lasts 60 days. Keep the word Bearer and the space.

- Name: `Authorization`
- Value: `Bearer {val("linkedin_token")}`

## 6. Gemini API Key ({status(real(sec.get("gemini_key", "")))})

Type **Header Auth**. From aistudio.google.com > Get API key.

- Name: `x-goog-api-key`
- Value: `{val("gemini_key")}`

## Claude connector URL (Social 0)

After importing and activating Social 0, its MCP Server node shows the Production URL. It ends with:

```
/mcp/{mcp_path}
```

Paste the full URL in Claude: Settings > Connectors > Add custom connector. Treat it like a password.
"""

with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(md)
print("wrote", os.path.relpath(OUT, ROOT), "|", ", ".join(f"{n}: {status(ok)}" for n, _, ok, _ in rows))
